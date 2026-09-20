import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import { freshData } from '@/lib/channel/state';
import 'server-only';

import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { commentClustersSchema, commentRisksSchema } from '@/lib/schemas';
import type { CandidateFit } from '@/lib/report/candidate-fit';
import type {
  AnalysisJob,
  AnalysisJobKind,
  CommentCluster,
  CommentRisk,
  PlatformOutput,
  Promotion,
} from '@/types';

export interface Campaign {
  id: string;
  name: string;
  brand: string | null;
  product: string | null;
  useCase?: string | null;
  audience: string | null;
  objective: string | null;
  avoidTopics: string | null;
  budgetTotal: number | null;
  budgetCurrency: string;
  createdAt: string;
}

export interface ChannelAnalysis {
  channelId: string;
  handle: string | null;
  title: string;
  avatarUrl: string | null;
  description: string | null;
  subscribers: number | null;
  outputStats: PlatformOutput[];
  promotions: Promotion[];
  clusters: CommentCluster[];
  risks: CommentRisk[];
  sentiment: number | null;
  purchaseIntentRate: number | null;
  purchaseIntentBasis: string | null;
  /**
   * How many comments the rate is OVER. Not decorative: on two channels read
   * in the same pass the rate was 19.5% of 361 product comments and 43.8% of
   * 4, and rendered as bare percentages the second one outranks the first.
   */
  intentCommentsScored: number | null;
  engagementRate: number | null;
  commentsAnalysed: number;
  commentsScanned: number | null;
  /** When the public data was read. Every report has to state this. */
  dataFetchedAt: string;
  analysedAt: string | null;
  /** True once the model pass has produced axes. Until then the read is thin. */
  classified: boolean;
  /**
   * True once a model pass has FINISHED against this channel, whatever it
   * found. Separate from `classified` because the two diverge on exactly the
   * case that matters: a channel with comments disabled comes back with zero
   * axes, and treating that as "not yet run" tells a buyer to wait for a
   * figure that is never coming — while treating it as a clean scan claims a
   * safety result over a corpus that was empty. It is neither; it is a pass
   * that ran and had nothing to read.
   */
  analysisRan: boolean;
}

export interface Candidate {
  id: string;
  channelId: string;
  submittedAs: string | null;
  proposedFee: number | null;
  feeCurrency: string;
  notes: string | null;
  status: 'considering' | 'shortlisted' | 'hold' | 'rejected';
  fit: CandidateFit | null;
  fitModel: string | null;
  fitWrittenAt: string | null;
  addedAt: string;
  analysis: ChannelAnalysis | null;
}

export async function getCampaigns(organizationId: string): Promise<Campaign[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .returns<Record<string, unknown>[]>();
  if (error) {
    console.error('[campaigns] query failed', error.message);
    return [];
  }
  return (data ?? []).map(toCampaign);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createSessionClient();
  // RLS decides visibility; this is a lookup, not an authorisation check.
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle<Record<string, unknown>>();
  return data ? toCampaign(data) : null;
}

function toCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: row.id as string,
    name: row.name as string,
    brand: (row.brand as string) ?? null,
    product: (row.product as string) ?? null,
    useCase: (row.use_case as string) ?? null,
    audience: (row.audience as string) ?? null,
    objective: (row.objective as string) ?? null,
    avoidTopics: (row.avoid_topics as string) ?? null,
    budgetTotal: row.budget_total === null ? null : Number(row.budget_total),
    budgetCurrency: (row.budget_currency as string) ?? 'USD',
    createdAt: row.created_at as string,
  };
}

/**
 * The candidates on a campaign, each joined to the shared channel analysis.
 *
 * Two reads rather than an embed: `channel_analyses` is keyed by a text
 * channel id and has no foreign key to `campaign_candidates` — deliberately,
 * because the analysis outlives any particular campaign and belongs to no
 * customer. PostgREST cannot infer a relationship that does not exist, so the
 * join happens here.
 */
export async function getCandidates(campaignId: string): Promise<Candidate[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createSessionClient();

  const { data: rows, error } = await supabase
    .from('campaign_candidates')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('added_at', { ascending: true })
    .returns<Record<string, unknown>[]>();
  if (error) {
    console.error('[candidates] query failed', error.message);
    return [];
  }
  if ((rows ?? []).length === 0) return [];

  const ids = [...new Set((rows ?? []).map((r) => r.channel_id as string))];
  const { data: analyses } = await supabase
    .from('channel_analyses')
    .select('*')
    .in('channel_id', ids)
    .returns<Record<string, unknown>[]>();
  const byChannel = new Map((analyses ?? []).filter(a=>freshData(a.data_fetched_at)).map((a) => [a.channel_id as string, a]));

  return (rows ?? []).map((row) => {
    const raw = byChannel.get(row.channel_id as string);
    return {
      id: row.id as string,
      channelId: row.channel_id as string,
      submittedAs: (row.submitted_as as string) ?? null,
      proposedFee: row.proposed_fee === null ? null : Number(row.proposed_fee),
      feeCurrency: (row.fee_currency as string) ?? 'USD',
      notes: (row.notes as string) ?? null,
      status: row.status as Candidate['status'],
      fit: AMENDMENT_ACCEPTED && raw ? (row.fit_summary as CandidateFit) ?? null : null,
      fitModel: (row.fit_model as string) ?? null,
      fitWrittenAt: (row.fit_written_at as string) ?? null,
      addedAt: row.added_at as string,
      analysis: raw ? toAnalysis(raw) : null,
    };
  });
}

function toAnalysis(row: Record<string, unknown>): ChannelAnalysis {
  row = AMENDMENT_ACCEPTED ? row : { ...row, moderation:null, comment_axes:null, top_comment_clusters:[], comment_risks:[], sentiment_score:null,purchase_intent_rate:null,intent_comments_scored:null,analysed_at:null };
  const moderation = (row.moderation ?? null) as { commentsScanned?: number } | null;
  const axes = (row.comment_axes ?? null) as { total?: number } | null;
  return {
    channelId: row.channel_id as string,
    handle: (row.handle as string) ?? null,
    title: row.title as string,
    avatarUrl: (row.avatar_url as string) ?? null,
    description: (row.description as string) ?? null,
    subscribers: row.subscribers === null ? null : Number(row.subscribers),
    outputStats: (row.output_stats ?? []) as PlatformOutput[],
    promotions: ((row.promotions ?? []) as Promotion[]).filter(p=>AMENDMENT_ACCEPTED||p.disclosure==='explicit'),
    // Parsed through the same schemas the creator path uses, so one bad row
    // degrades one cluster instead of the panel.
    clusters: commentClustersSchema.parse(row.top_comment_clusters ?? []),
    risks: commentRisksSchema.parse(row.comment_risks ?? []),
    sentiment: row.sentiment_score === null ? null : Number(row.sentiment_score),
    purchaseIntentRate:
      row.purchase_intent_rate === null ? null : Number(row.purchase_intent_rate),
    purchaseIntentBasis: (row.purchase_intent_basis as string) ?? null,
    intentCommentsScored:
      row.intent_comments_scored === null ? null : Number(row.intent_comments_scored),
    engagementRate: row.engagement_rate === null ? null : Number(row.engagement_rate),
    commentsAnalysed: Number(row.comments_analyzed ?? 0),
    commentsScanned: moderation?.commentsScanned ?? null,
    dataFetchedAt: row.data_fetched_at as string,
    analysedAt: (row.analysed_at as string) ?? null,
    // The axes are the model pass's output. Without them the report has
    // counts and no reading, and every surface has to say which it is.
    classified: (axes?.total ?? 0) > 0,
    analysisRan: row.analysed_at != null,
  };
}

/**
 * The live state of the model passes for a set of channels.
 *
 * Read under the CUSTOMER's own session, not the service role: 0032 admits a
 * channel job only to an organisation that has that channel on one of its own
 * campaigns, so this returns nothing for a channel they did not add — and the
 * existence of a job stays invisible to everyone else, because whether a rival
 * agency is evaluating a creator is exactly the thing the private shortlist
 * exists to hide.
 */
export async function getChannelJobs(channelIds: string[]): Promise<Map<string, AnalysisJob[]>> {
  const out = new Map<string, AnalysisJob[]>();
  if (!isSupabaseConfigured() || channelIds.length === 0) return out;

  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('analysis_jobs')
    .select(
      'id, kind, status, attempts, max_attempts, queued_at, started_at, finished_at, ' +
        'comments_scanned, findings, last_error, progress_done, progress_total, progress_stage, channel_id',
    )
    .in('channel_id', channelIds)
    .order('queued_at', { ascending: false })
    .returns<Record<string, unknown>[]>();

  if (error) {
    console.error('[campaigns] job read failed', error.message);
    return out;
  }

  for (const row of data ?? []) {
    const channelId = row.channel_id as string;
    const list = out.get(channelId) ?? [];
    // Newest first, and only the newest of each kind: an older failed attempt
    // beside a running retry would report both, and the page would say the
    // pass has failed while it is in fact running.
    if (list.some((j) => j.kind === (row.kind as AnalysisJobKind))) continue;
    list.push({
      id: row.id as string,
      kind: row.kind as AnalysisJobKind,
      status: row.status as AnalysisJob['status'],
      attempts: Number(row.attempts ?? 0),
      maxAttempts: Number(row.max_attempts ?? 0),
      queuedAt: row.queued_at as string,
      startedAt: (row.started_at as string) ?? null,
      finishedAt: (row.finished_at as string) ?? null,
      commentsScanned: row.comments_scanned === null ? null : Number(row.comments_scanned),
      findings: row.findings === null ? null : Number(row.findings),
      lastError: (row.last_error as string) ?? null,
      progressDone: row.progress_done === null ? null : Number(row.progress_done),
      progressTotal: row.progress_total === null ? null : Number(row.progress_total),
      progressStage: (row.progress_stage as AnalysisJob['progressStage']) ?? null,
    });
    out.set(channelId, list);
  }
  for (const [id, jobs] of out) {
    const collection = jobs.find(j=>j.kind==='collect_channel');
    if (collection) out.set(id,jobs.filter(j=>j.kind==='collect_channel'||j.queuedAt>=collection.queuedAt));
  }
  return out;
}
