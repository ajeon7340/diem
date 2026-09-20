import 'server-only';

import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import type { AnalysisJob, AnalysisJobKind } from '@/types';
import type {
  CollaborationRecord,
  Coverage,
  DiscoveryCandidate,
  DiscoveryMode,
  EmptyReason,
  EvidenceVideo,
  ReferenceProfile,
  Relevance,
} from '@/lib/discovery/types';

/**
 * Reading discovery back.
 *
 * Under the CUSTOMER's session throughout, never the service role: every table
 * here is org-private, and RLS is what enforces that. A read that used the
 * service key and filtered by organisation in TypeScript would work identically
 * until the day the filter was forgotten, and then it would work identically
 * except for showing one agency another agency's competitor list.
 */

export interface DiscoverySearchRow {
  id: string;
  mode: DiscoveryMode;
  campaignId: string | null;
  params: Record<string, unknown>;
  referenceChannelId: string | null;
  reference: ReferenceProfile | null;
  coverage: Coverage | null;
  appliedFilters: { api: { name: string; value: string }[]; post: { name: string; value: string }[] } | null;
  notes: string[];
  emptyReason: EmptyReason | null;
  /** Whether OUR scoring was permitted when this ran — not whether it is now. */
  rankingEnabled: boolean;
  collectedAt: string | null;
  createdAt: string;
}

export interface CompetitorBrandRow {
  id: string;
  name: string;
  relation: 'direct' | 'adjacent' | 'uncertain';
  rationale: string | null;
  products: string[];
  source: 'customer' | 'model';
  confirmed: boolean;
  confirmedAt: string | null;
}

export async function getSearches(organizationId: string, limit = 20): Promise<DiscoverySearchRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createSessionClient()
    .from('discovery_searches')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<Record<string, unknown>[]>();
  if (error) {
    console.error('[discovery] search list failed', error.message);
    return [];
  }
  return (data ?? []).map(toSearch);
}

export async function getSearch(id: string): Promise<DiscoverySearchRow | null> {
  if (!isSupabaseConfigured()) return null;
  // RLS decides visibility. A search belonging to another organisation simply
  // does not come back, and the page 404s — "not allowed" would confirm the id.
  const { data } = await createSessionClient()
    .from('discovery_searches')
    .select('*')
    .eq('id', id)
    .maybeSingle<Record<string, unknown>>();
  return data ? toSearch(data) : null;
}

function toSearch(row: Record<string, unknown>): DiscoverySearchRow {
  return {
    id: row.id as string,
    mode: row.mode as DiscoveryMode,
    campaignId: (row.campaign_id as string) ?? null,
    params: (row.params as Record<string, unknown>) ?? {},
    referenceChannelId: (row.reference_channel_id as string) ?? null,
    reference: (row.reference_profile as ReferenceProfile) ?? null,
    coverage: (row.coverage as Coverage) ?? null,
    appliedFilters: (row.applied_filters as DiscoverySearchRow['appliedFilters']) ?? null,
    notes: Array.isArray(row.notes) ? (row.notes as string[]) : [],
    emptyReason: (row.empty_reason as EmptyReason) ?? null,
    rankingEnabled: row.ranking_enabled === true,
    collectedAt: (row.collected_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function getCandidates(searchId: string): Promise<DiscoveryCandidate[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createSessionClient();

  const [{ data: rows, error }, { data: evidence }] = await Promise.all([
    supabase
      .from('discovery_candidates')
      .select('*')
      .eq('search_id', searchId)
      .order('position', { ascending: true })
      .returns<Record<string, unknown>[]>(),
    supabase
      .from('collaboration_evidence')
      .select('*')
      .eq('search_id', searchId)
      .returns<Record<string, unknown>[]>(),
  ]);

  if (error) {
    console.error('[discovery] candidate read failed', error.message);
    return [];
  }

  const byChannel = new Map<string, CollaborationRecord[]>();
  for (const row of evidence ?? []) {
    const channelId = row.channel_id as string;
    const list = byChannel.get(channelId) ?? [];
    list.push(toRecord(row));
    byChannel.set(channelId, list);
  }

  return (rows ?? []).map((row) => {
    const facts = (row.facts as Record<string, unknown>) ?? {};
    const channelId = row.channel_id as string;
    return {
      channelId,
      title: (facts.title as string) ?? channelId,
      handle: (facts.handle as string) ?? null,
      avatar: (facts.avatar as string) ?? null,
      url: (facts.url as string) ?? `https://www.youtube.com/channel/${channelId}`,
      description: (facts.description as string) ?? null,
      subscribers: facts.subscribers == null ? null : Number(facts.subscribers),
      hiddenSubscribers: facts.hiddenSubscribers === true,
      videoCount: facts.videoCount == null ? null : Number(facts.videoCount),
      viewCount: facts.viewCount == null ? null : Number(facts.viewCount),
      reason: (row.reason as string) ?? '',
      evidence: Array.isArray(row.evidence) ? (row.evidence as EvidenceVideo[]) : [],
      // Null, not a zeroed object: unranked is a state, and a relevance of 0
      // would sort and render as a judgement nobody made.
      relevance: (row.relevance as Relevance) ?? null,
      collaborations: byChannel.get(channelId) ?? [],
      collectedAt: (row.collected_at as string) ?? '',
    };
  });
}

function toRecord(row: Record<string, unknown>): CollaborationRecord {
  return {
    brand: row.brand as string,
    product: (row.product as string) ?? null,
    channelId: row.channel_id as string,
    videoId: row.video_id as string,
    videoTitle: row.video_title as string,
    videoUrl: row.video_url as string,
    publishedAt: (row.published_at as string) ?? '',
    source: row.source as string,
    excerpt: (row.excerpt as string) ?? null,
    classification: row.classification as CollaborationRecord['classification'],
    ambiguity: (row.ambiguity as string) ?? '',
    collectedAt: (row.collected_at as string) ?? '',
  };
}

export async function getBrands(searchId: string): Promise<CompetitorBrandRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await createSessionClient()
    .from('competitor_brands')
    .select('*')
    .eq('search_id', searchId)
    .order('created_at', { ascending: true })
    .returns<Record<string, unknown>[]>();

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    relation: row.relation as CompetitorBrandRow['relation'],
    rationale: (row.rationale as string) ?? null,
    products: (row.products as string[]) ?? [],
    source: row.source as CompetitorBrandRow['source'],
    confirmed: row.confirmed === true,
    confirmedAt: (row.confirmed_at as string) ?? null,
  }));
}

/**
 * The job behind a search, if there is one.
 *
 * Returned as a list for symmetry with `getChannelJobs`, but a search has at
 * most one live job by construction (`analysis_jobs_one_live_per_search`).
 */
export async function getSearchJobs(searchIds: string[]): Promise<Map<string, AnalysisJob[]>> {
  const out = new Map<string, AnalysisJob[]>();
  if (!isSupabaseConfigured() || searchIds.length === 0) return out;

  const { data, error } = await createSessionClient()
    .from('analysis_jobs')
    .select(
      'id, kind, status, attempts, max_attempts, queued_at, started_at, finished_at, ' +
        'comments_scanned, findings, last_error, progress_done, progress_total, progress_stage, search_id',
    )
    .in('search_id', searchIds)
    .order('queued_at', { ascending: false })
    .returns<Record<string, unknown>[]>();

  if (error) {
    console.error('[discovery] job read failed', error.message);
    return out;
  }

  for (const row of data ?? []) {
    const searchId = row.search_id as string;
    const list = out.get(searchId) ?? [];
    // Newest of each kind only — an older failed attempt beside a running
    // retry would report both and the page would say it had failed.
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
    out.set(searchId, list);
  }
  return out;
}

export interface SavedCandidateRow {
  channelId: string;
  searchId: string | null;
  mode: DiscoveryMode | null;
  reason: string | null;
  evidence: EvidenceVideo[];
  savedAt: string;
  /** Present once the shared public analysis exists for this channel. */
  title: string | null;
  handle: string | null;
  avatar: string | null;
  subscribers: number | null;
  dataFetchedAt: string | null;
}

export async function getSavedCandidates(organizationId: string): Promise<SavedCandidateRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createSessionClient();

  const { data: rows } = await supabase
    .from('workspace_candidates')
    .select('*')
    .eq('organization_id', organizationId)
    .order('saved_at', { ascending: false })
    .returns<Record<string, unknown>[]>();

  const ids = (rows ?? []).map((r) => r.channel_id as string);
  const { data: analyses } = ids.length
    ? await supabase
        .from('channel_analyses')
        .select('channel_id, title, handle, avatar_url, subscribers, data_fetched_at')
        .in('channel_id', ids)
        .returns<Record<string, unknown>[]>()
    : { data: [] as Record<string, unknown>[] };

  const byChannel = new Map((analyses ?? []).map((a) => [a.channel_id as string, a]));

  return (rows ?? []).map((row) => {
    const channelId = row.channel_id as string;
    const analysis = byChannel.get(channelId);
    const evidence = Array.isArray(row.evidence) ? (row.evidence as EvidenceVideo[]) : [];
    const facts = (row.facts as Record<string, unknown>) ?? {};
    return {
      channelId,
      searchId: (row.search_id as string) ?? null,
      mode: (row.discovery_mode as DiscoveryMode) ?? null,
      reason: (row.reason as string) ?? null,
      evidence,
      savedAt: row.saved_at as string,
      // The analysis wins where it exists, because it is newer and shared.
      // Otherwise what discovery cached: saving is deliberately CHEAP, so most
      // saved candidates have no report yet and a bare channel id is useless.
      title: (analysis?.title as string) ?? (facts.title as string) ?? null,
      handle: (analysis?.handle as string) ?? (facts.handle as string) ?? null,
      avatar: (analysis?.avatar_url as string) ?? (facts.avatar as string) ?? null,
      subscribers:
        analysis?.subscribers != null
          ? Number(analysis.subscribers)
          : facts.subscribers == null
            ? null
            : Number(facts.subscribers),
      dataFetchedAt: (analysis?.data_fetched_at as string) ?? null,
    };
  });
}
