'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getViewer } from '@/lib/access/viewer';
import { campaignSchema, candidateSchema } from '@/lib/schemas-campaign';
import { commentClustersSchema, commentRisksSchema, youtubeHandleSchema } from '@/lib/schemas';
import { readCandidate } from '@/lib/report/candidate-fit';
import type { PlatformOutput, Promotion } from '@/types';
import { resolveChannel } from '@/lib/youtube/resolve';
import { freshData } from '@/lib/channel/state';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import { createServiceClient, createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';

export interface CampaignState {
  status: 'idle' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
}

export interface CandidateState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
}

function collect(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Create a campaign.
 *
 * Org-scoped, because a brief is competitive information — what a brand is
 * planning and budgeting must not be visible to another customer. RLS enforces
 * it; `organization_id` here narrows the insert, it does not authorise it.
 */
export async function createCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  if (!isSupabaseConfigured()) {
    return { status: 'error', message: 'Campaigns need a database. See the README for setup.' };
  }

  const viewer = await getViewer();
  if (!viewer.userId) return { status: 'error', message: 'Sign in to create a campaign.' };
  if (!viewer.organization) {
    return { status: 'error', message: 'Create a workspace first, then a campaign.' };
  }

  const parsed = campaignSchema.safeParse({
    name: formData.get('name'),
    brandId: formData.get('brandId'),
    brand: formData.get('brand'),
    product: formData.get('product'),
    useCase: formData.get('useCase'),
    audience: formData.get('audience'),
    objective: formData.get('objective'),
    avoidTopics: formData.get('avoidTopics'),
    budgetTotal: formData.get('budgetTotal'),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: collect(parsed.error.issues),
    };
  }

  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      organization_id: viewer.organization.id,
      created_by: viewer.userId,
      name: parsed.data.name,
      // The trigger in 0041 refuses a brand from another workspace, so a forged
      // id fails the insert rather than attaching somebody else's client.
      brand_id: parsed.data.brandId,
      brand: parsed.data.brand,
      product: parsed.data.product,
      use_case: parsed.data.useCase,
      audience: parsed.data.audience,
      objective: parsed.data.objective,
      avoid_topics: parsed.data.avoidTopics,
      budget_total: parsed.data.budgetTotal,
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !data) {
    console.error('[campaigns] insert failed', error?.message);
    return { status: 'error', message: 'Could not create the campaign. Please try again.' };
  }

  const channelId = String(formData.get('channelId') ?? '');
  if (/^UC[\w-]{22}$/.test(channelId)) {
    const { data: report } = await supabase.from('channel_analyses').select('channel_id').eq('channel_id',channelId).maybeSingle();
    if (report) await supabase.from('campaign_candidates').insert({ campaign_id:data.id, channel_id:channelId });
  }
  revalidatePath('/campaigns');
  // `redirect` throws by design — that is how a server action navigates — so
  // control never reaches the end of this function.
  redirect(`/campaigns/${data.id}`);
}

/**
 * Add a candidate channel to a campaign, and start analysing it.
 *
 * NO CREATOR ACCOUNT, NO APPROVAL, NO OAUTH. This is the whole point of the
 * pivot: the customer pastes any public channel and the same public-data pass
 * that already existed runs against it. Nothing here consults `creators`.
 *
 * The bounded pass runs INLINE — 25 uploads, 600 comments, measured at 2-3s —
 * so the row is useful the moment it appears. The two model passes are queued
 * for the worker, because they are minutes long.
 */
export async function addCandidate(
  _prev: CandidateState,
  formData: FormData,
): Promise<CandidateState> {
  if (!isSupabaseConfigured()) {
    return { status: 'error', message: 'Candidates need a database. See the README for setup.' };
  }

  const viewer = await getViewer();
  if (!viewer.organization) return { status: 'error', message: 'Sign in to add a candidate.' };

  const campaignId = String(formData.get('campaignId') ?? '');
  const parsed = candidateSchema.safeParse({
    channel: formData.get('channel'),
    proposedFee: formData.get('proposedFee'),
    notes: formData.get('notes'),
  });
  if (!parsed.success) {
    return { status: 'error', fieldErrors: collect(parsed.error.issues) };
  }

  // Any shape YouTube has ever served: @handle, /channel/UC…, /c/Name,
  // /user/Name, or a bare name. Same parser the creator form uses.
  const normalised = youtubeHandleSchema.safeParse(parsed.data.channel);
  if (!normalised.success || !normalised.data) {
    return {
      status: 'error',
      fieldErrors: { channel: 'Paste a channel URL or @handle, like youtube.com/@name' },
    };
  }

  const resolved = await resolveChannel(normalised.data);
  if (!resolved.ok) {
    return { status: 'error', fieldErrors: { channel: resolved.message } };
  }

  const supabase = createSessionClient();
  // RLS decides whether this campaign belongs to the caller's org; the insert
  // simply fails if it does not.
  const { error } = await supabase.from('campaign_candidates').insert({
    campaign_id: campaignId,
    channel_id: resolved.channel.channelId,
    submitted_as: resolved.channel.handle || resolved.channel.title,
    proposed_fee: parsed.data.proposedFee,
    notes: parsed.data.notes,
  });

  if (error) {
    if (error.code === '23514') return { status:'error', message:'Compare up to five candidates per campaign.' };
    if (error.code === '23505') {
      return { status: 'error', fieldErrors: { channel: 'That channel is already on this list.' } };
    }
    console.error('[candidates] insert failed', error.message);
    return { status: 'error', message: 'Could not add that candidate.' };
  }

  // Reuse current public-source data. A unique durable job owns any collection.
  const service = createServiceClient();
  await supabase.from('workspace_channels').upsert({ organization_id:viewer.organization.id, channel_id:resolved.channel.channelId },{ignoreDuplicates:true});
  if (service) {
    const { error: queueError } = await service.rpc('queue_channel_collection', {
      p_channel:resolved.channel.channelId, p_days:0, p_refresh:false,
    });
    if (queueError) return { status:'error', message:'Candidate saved, but analysis could not be queued. Open Channel analysis to retry.' };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return { status: 'ok', message: `${resolved.channel.title} added.` };
}

/** Shortlist, reject, or put back under consideration. */
export async function setCandidateStatus(formData: FormData): Promise<void> {
  await updateCandidateReview({ status: 'idle' }, formData);
}

export async function updateCandidateReview(_prev: CandidateState, formData: FormData): Promise<CandidateState> {
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) return { status: 'error', message: 'Sign in to save your decision.' };

  const id = String(formData.get('candidateId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!['considering', 'shortlisted', 'hold', 'rejected'].includes(status)) return { status: 'error', message: 'Choose a valid review status.' };

  const supabase = createSessionClient();
  const campaignId = String(formData.get('campaignId') ?? '');
  const { data, error } = await supabase.from('campaign_candidates').update({ status }).eq('id', id).eq('campaign_id', campaignId).select('id').maybeSingle();
  if (error || !data) return { status: 'error', message: 'Could not save your decision. Please try again.' };
  revalidatePath(`/campaigns/${campaignId}`);
  return { status: 'ok', message: 'Decision saved.' };
}

/**
 * Write the read of one candidate against this campaign's brief.
 *
 * Campaign-specific and therefore NOT on the shared channel row: the same
 * channel is a different answer for a cleanser and for a trading app, and
 * caching one under the channel would serve the wrong brief to the second
 * customer.
 *
 * On purpose, it is a button rather than automatic. A model call per candidate
 * per add is money spent before anyone has looked at the list, and most
 * candidates get discarded on the numbers alone.
 */
export async function writeCandidateFit(formData: FormData): Promise<void> {
  await evaluateCandidate({ status: 'idle' }, formData);
}

export async function evaluateCandidate(_prev: CandidateState, formData: FormData): Promise<CandidateState> {
  if (!AMENDMENT_ACCEPTED) return { status: 'error', message: 'Campaign assessment is not available.' };
  const viewer = await getViewer();
  if (!viewer.organization) return { status: 'error', message: 'Sign in to assess this candidate.' };

  const candidateId = String(formData.get('candidateId') ?? '');
  const campaignId = String(formData.get('campaignId') ?? '');
  const supabase = createSessionClient();

  // RLS scopes both reads to this customer's own rows, so a candidate id from
  // another organisation simply returns nothing.
  const [{ data: candidate }, { data: campaign }] = await Promise.all([
    supabase
      .from('campaign_candidates')
      .select('id, channel_id, proposed_fee, fee_currency')
      .eq('id', candidateId)
      .eq('campaign_id', campaignId)
      .maybeSingle<{
        id: string;
        channel_id: string;
        proposed_fee: number | null;
        fee_currency: string;
      }>(),
    supabase
      .from('campaigns')
      .select('name, brand, product, use_case, audience, objective, avoid_topics, updated_at')
      .eq('id', campaignId)
      .maybeSingle<{
        updated_at: string;
        use_case: string | null;
        name: string;
        brand: string | null;
        product: string | null;
        audience: string | null;
        objective: string | null;
        avoid_topics: string | null;
      }>(),
  ]);
  if (!candidate || !campaign) return { status: 'error', message: 'Candidate unavailable.' };

  const { data: row } = await supabase
    .from('channel_analyses')
    .select('*')
    .eq('channel_id', candidate.channel_id)
    .maybeSingle<Record<string, unknown>>();
  if (!row || !freshData(row.data_fetched_at)) return { status: 'error', message: 'Refresh the public report before assessing this candidate.' };

  const outputs = (row.output_stats ?? []) as PlatformOutput[];
  const youtube = outputs.find((o) => o.platform === 'youtube') ?? outputs[0] ?? null;
  const moderation = (row.moderation ?? null) as { commentsScanned?: number } | null;

  const read = await readCandidate({
    brief: {
      name: campaign.name,
      brand: campaign.brand,
      product: [campaign.product,campaign.use_case ? `Use case: ${campaign.use_case}` : null].filter(Boolean).join('\n') || null,
      audience: campaign.audience,
      objective: campaign.objective,
      avoidTopics: campaign.avoid_topics,
    },
    channel: {
      title: row.title as string,
      handle: (row.handle as string) ?? null,
      description: (row.description as string) ?? null,
      subscribers: row.subscribers === null ? null : Number(row.subscribers),
      medianViews: youtube?.medianViews ?? null,
      engagementRate: row.engagement_rate === null ? null : Number(row.engagement_rate),
      uploadsInWindow: youtube?.postsInWindow ?? null,
      windowDays: youtube?.windowDays ?? null,
    },
    comments: {
      analysed: Number(row.comments_analyzed ?? 0),
      scanned: moderation?.commentsScanned ?? null,
      sentiment: row.sentiment_score === null ? null : Number(row.sentiment_score),
      purchaseIntentRate:
        row.purchase_intent_rate === null ? null : Number(row.purchase_intent_rate),
      intentBasis: (row.purchase_intent_basis as string) ?? null,
      intentScored:
        row.intent_comments_scored === null ? null : Number(row.intent_comments_scored),
      clusters: commentClustersSchema.parse(row.top_comment_clusters ?? []),
      risks: commentRisksSchema.parse(row.comment_risks ?? []),
    },
    promotions: (row.promotions ?? []) as Promotion[],
    // ONLY from what the customer typed. Nothing public reveals a rate, and a
    // derived one would be an invention the brief then gets budgeted against.
    proposedFee:
      candidate.proposed_fee === null
        ? null
        : { amount: Number(candidate.proposed_fee), currency: candidate.fee_currency },
  });

  if (!read.ok) {
    console.error('[candidates] fit read failed', { candidateId, reason: read.reason });
    return { status: 'error', message: 'Assessment could not be completed. Please try again.' };
  }

  const { data: saved, error } = await supabase.rpc('save_campaign_fit', {
    p_candidate:candidateId,p_campaign:campaignId,p_brief_at:campaign.updated_at,
    p_data_at:row.data_fetched_at,p_fit:read.fit,p_model:read.model,
  });
  if (error || saved !== true) {
    if (error) console.error('[candidates] fit write failed', error.message);
    return { status: 'error', message: 'Could not save the assessment. The brief or report may have changed; please try again.' };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return { status: 'ok', message: 'Campaign assessment updated.' };
}

export async function updateCampaign(_prev: CampaignState, form: FormData): Promise<CampaignState> {
 const viewer=await getViewer(); if(!viewer.organization||!isSupabaseConfigured())return {status:'error',message:'Sign in first.'};
 const parsed=campaignSchema.safeParse(Object.fromEntries(form));
 if(!parsed.success)return {status:'error',message:'Check the campaign fields.',fieldErrors:collect(parsed.error.issues)};
 const p=parsed.data;const id=String(form.get('campaignId')??'');
 const {error}=await createSessionClient().from('campaigns').update({name:p.name,brand_id:p.brandId,brand:p.brand,product:p.product,use_case:p.useCase,audience:p.audience,objective:p.objective,avoid_topics:p.avoidTopics,budget_total:p.budgetTotal}).eq('id',id).eq('organization_id',viewer.organization.id);
 if(error)return {status:'error',message:'Could not update the brief.'};
 revalidatePath(`/campaigns/${id}`);redirect(`/campaigns/${id}`);
}
export async function updateCandidateDetails(_: CandidateState, form: FormData): Promise<CandidateState> {
 const viewer=await getViewer();if(!viewer.organization||!isSupabaseConfigured())return {status:'error',message:'Sign in first.'};
 const parsed=candidateSchema.safeParse({channel:'@placeholder',proposedFee:form.get('proposedFee'),notes:form.get('notes')});
 if(!parsed.success)return {status:'error',message:'Check the quoted fee and notes.'};
 const campaignId=String(form.get('campaignId')??'');
 const {error}=await createSessionClient().from('campaign_candidates').update({proposed_fee:parsed.data.proposedFee,notes:parsed.data.notes,fit_summary:null,fit_written_at:null}).eq('id',String(form.get('candidateId')??'')).eq('campaign_id',campaignId);
 if(error)return {status:'error',message:'Could not save candidate details.'};
 revalidatePath(`/campaigns/${campaignId}`);return {status:'ok',message:'Private notes and quoted fee saved.'};
}
