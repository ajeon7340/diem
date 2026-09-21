import 'server-only';

import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import type { CandidateFit } from '@/lib/report/candidate-fit';
import type { RequirementRow } from '@/lib/relevance/requirements';

/**
 * Stored relevance analyses.
 *
 * Under the customer's own session throughout. An agency's read of a creator
 * for one client is competitive information, and RLS is what keeps it inside
 * the workspace.
 */

export interface StoredRelevance {
  id: string;
  channelId: string;
  brandId: string;
  campaignId: string | null;
  evidenceFetchedAt: string;
  contextFingerprint: string;
  matrix: RequirementRow[];
  /** The gated model reading. Null where approval is not configured. */
  narrative: CandidateFit | null;
  model: string | null;
  createdAt: string;
}

export async function getRelevance(
  organizationId: string,
  channelId: string,
  brandId: string,
  campaignId: string | null,
): Promise<StoredRelevance | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createSessionClient();
  let query = supabase
    .from('relevance_analyses')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('channel_id', channelId)
    .eq('brand_id', brandId);
  // `.is` and `.eq` are different operators for null: using `eq` with null here
  // returns nothing rather than the brand-level row.
  query = campaignId ? query.eq('campaign_id', campaignId) : query.is('campaign_id', null);

  const { data } = await query.maybeSingle<Record<string, unknown>>();
  return data ? toStored(data) : null;
}

/** Every analysis held for one channel, for the picker on the report. */
export async function getRelevanceForChannel(
  organizationId: string,
  channelId: string,
): Promise<StoredRelevance[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await createSessionClient()
    .from('relevance_analyses')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .returns<Record<string, unknown>[]>();
  return (data ?? []).map(toStored);
}

function toStored(row: Record<string, unknown>): StoredRelevance {
  return {
    id: row.id as string,
    channelId: row.channel_id as string,
    brandId: row.brand_id as string,
    campaignId: (row.campaign_id as string) ?? null,
    evidenceFetchedAt: row.evidence_fetched_at as string,
    contextFingerprint: row.context_fingerprint as string,
    matrix: Array.isArray(row.matrix) ? (row.matrix as RequirementRow[]) : [],
    narrative: (row.narrative as CandidateFit) ?? null,
    model: (row.model as string) ?? null,
    createdAt: row.created_at as string,
  };
}
