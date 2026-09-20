import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { DISCOVERY_RANKING } from '@/lib/report/policy';
import { writeReasons } from './ai';
import { runCollaborations, type ConfirmedBrand } from './competitors';
import { runCriteria } from './criteria';
import { discoveryLimits } from './limits';
import { liveRetriever } from './retriever-live';
import { competitorSchema, criteriaSchema, similarSchema } from './schemas';
import { runSimilar } from './similar';
import type { RunControl } from './retriever';
import type { CollaborationRecord, DiscoveryMode, DiscoveryResult } from './types';

/**
 * One discovery job, from a row in `discovery_searches` to a committed result.
 *
 * The worker owns the lease and the retries; this owns the pipeline choice, the
 * ordering guarantee and the commit. Split there because the worker must stay
 * ignorant of what any particular pass does — it has been that way since 0028
 * and it is why discovery needed no new queue.
 *
 * THE OUTCOME IS THREE-WAY, not two. A run that reached its bound with results
 * in hand is PARTIAL: it neither failed nor finished, and collapsing it into
 * either loses the only thing the customer needs to know, which is whether
 * there is more to find.
 */

export interface RunOutcome {
  status: 'succeeded' | 'partial' | 'cancelled';
  candidates: number;
  stoppedBecause: DiscoveryResult['coverage']['stoppedBecause'];
  unitsSpent: number;
  searchCalls: number;
}

export async function runDiscoveryJob(
  supabase: SupabaseClient,
  jobId: string,
  searchId: string,
  worker: string,
  control: RunControl,
): Promise<RunOutcome> {
  const { data: search, error } = await supabase
    .from('discovery_searches')
    .select('id, mode, params, organization_id')
    .eq('id', searchId)
    .maybeSingle<{ id: string; mode: DiscoveryMode; params: Record<string, unknown>; organization_id: string }>();

  if (error) throw new Error(error.message);
  // A search deleted while its job waited is not a failure to retry.
  if (!search) {
    return { status: 'cancelled', candidates: 0, stoppedBecause: 'cancelled', unitsSpent: 0, searchCalls: 0 };
  }

  const limits = discoveryLimits();
  const retriever = liveRetriever();

  let result: DiscoveryResult;
  let evidence: CollaborationRecord[] = [];

  switch (search.mode) {
    case 'criteria':
      result = await runCriteria(retriever, criteriaSchema.parse(search.params), limits, control);
      break;
    case 'similar':
      result = await runSimilar(retriever, similarSchema.parse(search.params), limits, control);
      break;
    case 'competitor': {
      const brands = await confirmedBrands(supabase, searchId);
      const outcome = await runCollaborations(retriever, brands, limits, control);
      result = outcome;
      evidence = outcome.byBrand.flatMap((group) => group.records);
      break;
    }
    default:
      throw new Error(`unknown discovery mode "${search.mode}"`);
  }

  // Explanations last, over an order that is already fixed. `writeReasons`
  // freezes the ids going in and throws if they come back different.
  const explained = await writeReasons(
    result.candidates,
    explanationContext(search.mode, search.params),
  );

  const rows = explained.map((candidate, index) => ({
    channelId: candidate.channelId,
    position: index,
    tiedGroup: candidate.relevance?.tiedGroup ?? null,
    relevance: candidate.relevance,
    reason: candidate.reason,
    evidence: candidate.evidence,
    facts: {
      title: candidate.title,
      handle: candidate.handle,
      avatar: candidate.avatar,
      url: candidate.url,
      description: candidate.description,
      subscribers: candidate.subscribers,
      hiddenSubscribers: candidate.hiddenSubscribers,
      videoCount: candidate.videoCount,
      viewCount: candidate.viewCount,
    },
  }));

  if (!(await control.checkpoint('storing'))) {
    return {
      status: 'cancelled',
      candidates: 0,
      stoppedBecause: 'cancelled',
      unitsSpent: result.coverage.unitsSpent,
      searchCalls: result.coverage.searchCalls,
    };
  }

  const { data: committed, error: commitError } = await supabase.rpc('commit_discovery_results', {
    p_job: jobId,
    p_worker: worker,
    p_search: searchId,
    p_summary: {
      coverage: result.coverage,
      appliedFilters: result.appliedFilters,
      notes: result.notes,
      emptyReason: result.emptyReason,
      reference: result.reference ?? null,
      // Recorded as it was AT RUN TIME. A result collected while ranking was
      // off must keep reading as unranked even if approval is configured
      // afterwards — the scores were never computed and cannot be implied.
      rankingEnabled: DISCOVERY_RANKING,
    },
    p_rows: rows,
    p_evidence: evidence,
  });

  if (commitError) throw new Error(commitError.message);
  // The lease went elsewhere mid-run. Whoever holds it now owns the outcome.
  if (!committed) {
    return {
      status: 'cancelled',
      candidates: 0,
      stoppedBecause: 'cancelled',
      unitsSpent: result.coverage.unitsSpent,
      searchCalls: result.coverage.searchCalls,
    };
  }

  return {
    status: outcomeStatus(result.coverage.stoppedBecause),
    candidates: rows.length,
    stoppedBecause: result.coverage.stoppedBecause,
    unitsSpent: result.coverage.unitsSpent,
    searchCalls: result.coverage.searchCalls,
  };
}

export function outcomeStatus(
  stopped: DiscoveryResult['coverage']['stoppedBecause'],
): RunOutcome['status'] {
  if (stopped === 'cancelled') return 'cancelled';
  if (stopped === 'complete') return 'succeeded';
  // candidate_cap, quota_units, quota_search_calls and api_error all mean the
  // same thing to a reader: there is more out there and this run did not reach
  // it. Which bound it was lives in `coverage.stoppedBecause`.
  return 'partial';
}

async function confirmedBrands(supabase: SupabaseClient, searchId: string): Promise<ConfirmedBrand[]> {
  const { data } = await supabase
    .from('competitor_brands')
    .select('name, products, confirmed')
    .eq('search_id', searchId)
    .eq('confirmed', true)
    .returns<{ name: string; products: string[] | null; confirmed: boolean }[]>();

  // Filtered in the query AND here. The second filter is not redundant: this is
  // the one place an unconfirmed name could reach a search query, and a
  // predicate that only exists in a query string is one edit away from not
  // existing.
  return (data ?? [])
    .filter((row) => row.confirmed === true)
    .map((row) => ({ name: row.name, products: row.products ?? [] }));
}

function explanationContext(mode: DiscoveryMode, params: Record<string, unknown>): string {
  switch (mode) {
    case 'criteria': {
      const input = criteriaSchema.safeParse(params);
      return JSON.stringify({
        searchedFor: input.success ? input.data.keywords : [],
        product: input.success ? input.data.product : null,
      });
    }
    case 'similar':
      return JSON.stringify({ referenceChannel: similarSchema.safeParse(params).data?.channel ?? null });
    default:
      return JSON.stringify({ brands: competitorSchema.safeParse(params).data?.knownCompetitors ?? [] });
  }
}
