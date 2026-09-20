'use server';

import { revalidatePath } from 'next/cache';

import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import { getViewer } from '@/lib/access/viewer';
import { getCampaign } from '@/lib/data/campaigns';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { YouTubeError } from '@/lib/youtube/client';
import { parseVideoId } from '@/lib/youtube/parse';
import { explainVideo, type VideoExplain } from '@/lib/youtube/explain';
import { INITIAL_REFERENCE } from './state';

export interface ReferenceState {
  status: 'idle' | 'ok' | 'error';
  message: string;
  result: VideoExplain | null;
  /**
   * The channel every figure in `result` was measured inside.
   *
   * Carried separately because `VideoExplain` deliberately does not hold it —
   * `Scoped<T>` does, so that combining two reads has to go through
   * `withinOwner` and fail loudly. At the save boundary the owner has to be
   * written down, so it is lifted out here and nowhere else.
   */
  channelId: string | null;
  /** Set once the read has been filed against the campaign. */
  saved: boolean;
}

/**
 * Analyse a video a buyer pasted while planning a campaign.
 *
 * The same read Studio gives a creator about their own channel, pointed at
 * anyone's — because every figure is measured INSIDE the video's own channel.
 * No account link, no ownership, no creator having signed up: a reference is
 * usually a competitor's video or a format the buyer liked.
 *
 * Org-gated rather than public, because each call spends four quota units
 * against a shared daily budget and an open form is a free way to drain it.
 */
export async function analyseReference(
  _prev: ReferenceState,
  formData: FormData,
): Promise<ReferenceState> {
  if (!AMENDMENT_ACCEPTED) return { ...INITIAL_REFERENCE,status:'error',message:'Derived analysis requires configured YouTube approval.' };
  const viewer = await getViewer();
  if (!viewer.organization) {
    return { ...INITIAL_REFERENCE, status: 'error', message: 'Sign in to a workspace first.' };
  }

  const raw = String(formData.get('url') ?? '').trim();
  const id = parseVideoId(raw);
  if (!raw) {
    return { ...INITIAL_REFERENCE, status: 'error', message: 'Paste a YouTube link first.' };
  }
  if (!id) {
    return {
      ...INITIAL_REFERENCE,
      status: 'error',
      message:
        'That does not look like a YouTube video link. A watch, Shorts or youtu.be link works; a channel link does not.',
    };
  }

  try {
    const scoped = await explainVideo(id);
    return { status: 'ok', message: '', result: scoped.value, channelId: scoped.channelId, saved: false };
  } catch (err) {
    if (err instanceof YouTubeError) {
      return {
        ...INITIAL_REFERENCE,
        status: 'error',
        message:
          err.reason === 'quotaExceeded'
            ? 'The daily YouTube quota is spent. This resets at midnight Pacific.'
            : err.message,
      };
    }
    console.error('[reference] analyse failed', err);
    return { ...INITIAL_REFERENCE, status: 'error', message: 'Could not read that video.' };
  }
}

/**
 * File an analysed video against the campaign.
 *
 * The whole read is written, not the video id. Re-deriving it on display would
 * produce a different answer — the channel's median moves with every upload —
 * so a saved multiple has to carry the baseline and the date it was taken
 * against. See migration 0034.
 */
export async function saveReference(
  _prev: ReferenceState,
  formData: FormData,
): Promise<ReferenceState> {
  if (!AMENDMENT_ACCEPTED) return { ...INITIAL_REFERENCE,status:'error',message:'Derived analysis requires configured YouTube approval.' };
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) {
    return { ...INITIAL_REFERENCE, status: 'error', message: 'Sign in to a workspace first.' };
  }

  const campaignId = String(formData.get('campaignId') ?? '');
  const payload = String(formData.get('analysis') ?? '');
  if (!campaignId || !payload) {
    return { ...INITIAL_REFERENCE, status: 'error', message: 'Nothing to save.' };
  }

  // RLS would refuse a campaign in another organisation, but checking here
  // turns a silent empty write into an answer.
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return { ...INITIAL_REFERENCE, status: 'error', message: 'That campaign is not yours.' };
  }

  let analysis: VideoExplain;
  try {
    analysis = JSON.parse(payload) as VideoExplain;
  } catch {
    return { ...INITIAL_REFERENCE, status: 'error', message: 'Could not read that analysis.' };
  }

  const channelId = String(formData.get('channelId') ?? '');
  if (!channelId) {
    return { ...INITIAL_REFERENCE, status: 'error', message: 'That analysis has no channel.' };
  }
  const candidateId = String(formData.get('candidateId') ?? '') || null;
  const note = String(formData.get('note') ?? '').trim().slice(0, 2000) || null;

  const supabase = createSessionClient();
  const { error } = await supabase.from('campaign_references').upsert(
    {
      campaign_id: campaignId,
      candidate_id: candidateId,
      video_id: analysis.videoId,
      title: analysis.title,
      channel_id: channelId,
      channel_title: analysis.channelTitle,
      published_at: analysis.publishedAt,
      duration_sec: analysis.durationSec,
      views: analysis.views,
      channel_median_views: analysis.channelMedianViews,
      multiple: analysis.multiple,
      engagement_rate: analysis.engagementRate,
      channel_median_engagement: analysis.channelMedianEngagement,
      sample_size: analysis.sampleSize,
      note,
      // The read is only as current as the moment it was taken, and the
      // baseline behind it has moved since. Stamped, never inferred.
      analysed_at: new Date().toISOString(),
    },
    { onConflict: 'campaign_id,video_id' },
  );

  if (error) {
    console.error('[campaign_references] save failed', error.message);
    return { ...INITIAL_REFERENCE, status: 'error', message: 'Could not save that reference.' };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return { status: 'ok', message: 'Saved to this campaign.', result: analysis, channelId, saved: true };
}
