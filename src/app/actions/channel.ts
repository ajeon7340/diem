'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/access/viewer';
import { createSessionClient, createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { youtubeHandleSchema } from '@/lib/schemas';
import { resolveChannel, type ResolvedChannel } from '@/lib/youtube/resolve';
import { freshData } from '@/lib/channel/state';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
export interface ChannelState { message?: string; channel?: ResolvedChannel; exists?: boolean; shareUrl?: string }
export async function previewChannel(_: ChannelState, form: FormData): Promise<ChannelState> {
 const parsed = youtubeHandleSchema.safeParse(form.get('channel'));
 if (!parsed.success || !parsed.data) return { message: 'Enter a supported YouTube channel URL or @handle.' };
 const resolved = await resolveChannel(parsed.data);
 if (!resolved.ok) return { message: resolved.message };
 const viewer = await getViewer();
 let exists = false;
 if (viewer.organization && isSupabaseConfigured()) {
  const { data } = await createSessionClient().from('channel_analyses').select('data_fetched_at').eq('channel_id',resolved.channel.channelId).maybeSingle();
  exists = freshData(data?.data_fetched_at);
 }
 return { channel: resolved.channel, exists };
}
export async function startChannel(_: ChannelState, form: FormData): Promise<ChannelState> {
 const viewer = await getViewer();
 if (!viewer.organization || !isSupabaseConfigured()) return { message: 'A saved workspace and database are required to run analysis.' };
 const service = createServiceClient();
 if (!service || !process.env.YOUTUBE_API_KEY) return { message: 'Channel analysis is not configured. The operator must configure YouTube API access and the background worker.' };
 const id = String(form.get('channelId') ?? '');
 if (!/^UC[\w-]{22}$/.test(id)) return { message: 'Confirm a channel first.' };
 const db = createSessionClient();
 const { error: save } = await db.from('workspace_channels').upsert({ organization_id: viewer.organization.id, channel_id: id }, { onConflict: 'organization_id,channel_id', ignoreDuplicates: true });
 if (save) return { message: 'Could not save this channel to your workspace.' };
 const days = Number(form.get('days') ?? 90);
 const { error } = await service.rpc('queue_channel_collection', { p_channel: id, p_days: [30,90,365].includes(days) ? days : 90, p_refresh: form.get('refresh') === 'true' });
 if (error) return { message: 'Could not queue analysis. Please try again.' };
 revalidatePath('/channels');
 redirect(`/channels/${id}`);
}
export async function retryChannel(_: ChannelState, form: FormData): Promise<ChannelState> {
 const viewer = await getViewer();
 if (!viewer.organization || !isSupabaseConfigured()) return { message: 'Sign in first.' };
 const db = createSessionClient();
 const id = String(form.get('channelId') ?? '');
 const { data: ref } = await db.from('workspace_channels').select('channel_id').eq('channel_id',id).eq('organization_id',viewer.organization.id).maybeSingle();
 if (!ref) return { message: 'Report unavailable.' };
 const service = createServiceClient();
 if (!service) return { message: 'Worker access is not configured.' };
 const { data: jobs } = await db.from('analysis_jobs').select('id,kind,status,params').eq('channel_id',id).order('queued_at',{ascending:false});
 const seen = new Set<string>();
 for (const job of jobs ?? []) {
  if (seen.has(job.kind)) continue; seen.add(job.kind);
  if (job.status !== 'failed' || (job.kind !== 'collect_channel' && !AMENDMENT_ACCEPTED)) continue;
  const { error } = await service.from('analysis_jobs').insert({ channel_id:id, kind:job.kind, params:job.params });
  if (error && error.code !== '23505') return { message: 'Could not queue retry.' };
 }
 revalidatePath(`/channels/${id}`);
 return { message: 'Failed work queued where permitted. Completed work is reused.' };
}
export async function attachReport(_: ChannelState, form: FormData): Promise<ChannelState> {
 const viewer = await getViewer();
 if (!viewer.organization || !isSupabaseConfigured()) return { message: 'Sign in first.' };
 const db = createSessionClient(); const channelId = String(form.get('channelId') ?? '');
 const campaignId = String(form.get('campaignId') ?? '');
 const { data: report } = await db.from('channel_analyses').select('channel_id').eq('channel_id',channelId).maybeSingle();
 if (!report) return { message: 'Refresh the report first.' };
 const { error } = await db.from('campaign_candidates').insert({ campaign_id:campaignId, channel_id:channelId });
 if (error) return { message: error.code === '23505' ? 'Already in this campaign.' : error.code === '23514' ? 'Compare up to five candidates per campaign.' : 'Could not add this report.' };
 revalidatePath(`/campaigns/${campaignId}`);
 redirect(`/campaigns/${campaignId}`);
}
export async function shareReport(_: ChannelState, form: FormData): Promise<ChannelState> {
 const viewer = await getViewer();
 if (!viewer.organization || !isSupabaseConfigured()) return { message: 'Sign in first.' };
 const db = createSessionClient(); const channelId = String(form.get('channelId') ?? '');
 const campaignId = String(form.get('campaignId') ?? '') || null;
 const { data: report } = await db.from('channel_analyses').select('data_fetched_at').eq('channel_id',channelId).maybeSingle();
 if (!report || !freshData(report.data_fetched_at)) return { message: 'Refresh the report before sharing.' };
 if (campaignId) {
  const { data: candidate } = await db.from('campaign_candidates').select('id').eq('campaign_id',campaignId).eq('channel_id',channelId).maybeSingle();
  if (!candidate) return { message: 'Select a campaign containing this channel.' };
 }
 const { error: saved } = await db.from('workspace_channels').upsert({organization_id: viewer.organization.id, channel_id:channelId},{ignoreDuplicates:true});
 if (saved) return { message: 'Could not save report.' };
 const expires = new Date(Math.min(Date.now()+7*86400000,Date.parse(report.data_fetched_at)+30*86400000)).toISOString();
 const { data, error } = await db.from('report_shares').insert({
  organization_id:viewer.organization.id,channel_id:channelId,campaign_id:campaignId,expires_at:expires,
  include_notes:!!campaignId && form.get('notes') === 'on', include_budget:!!campaignId && form.get('budget') === 'on', include_fee:!!campaignId && form.get('fee') === 'on',
 }).select('token').single();
 if (error) return { message: 'Could not create share link.' };
 return { shareUrl:`/shared/${data.token}`, message:`Anyone with this link can view the selected content until ${new Date(expires).toLocaleDateString('en-US')}.` };
}
export async function revokeShare(form: FormData): Promise<void> {
 if (!isSupabaseConfigured()) return;
 await createSessionClient().from('report_shares').delete().eq('token',String(form.get('token')));
 revalidatePath('/settings');
}
