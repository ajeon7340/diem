import { DISCOVERY_RANKING } from '@/lib/report/policy';
import { LOCALE_PARAMETER_DISCLOSURE } from '@/lib/youtube/search-contract';
import { applyPostFilters } from './candidates';
import { collectCandidates, type QueryPlanEntry } from './collect';
import type { DiscoveryLimits } from './limits';
import { depthSignal, rankCandidates, scoreSignals, termCoverageSignal, type Signal } from './rank';
import { SUBSCRIBER_BANDS, VIEW_BANDS, selectedBands } from './ranges';
import type { CriteriaInput, Format } from './schemas';
import type { Retriever, RunControl } from './retriever';
import type { DiscoveryCandidate, DiscoveryResult } from './types';

/**
 * Mode 1: describe the product and the subject, get channels that publish about
 * it.
 *
 * The query plan is DETERMINISTIC and visible. Each of the customer's own terms
 * becomes one search, in the order they wrote them, and the results panel
 * prints the queries that ran. A model writing queries would find more —
 * and would also mean a customer could not tell whether a disappointing result
 * came from their brief or from a paraphrase of it they never saw. The
 * generated-query route exists in `similar.ts`, where there is no customer-typed
 * term to start from, and it is gated there for that reason.
 */

const DURATION: Record<Format, 'short' | 'medium' | 'long'> = {
  short: 'short',
  medium: 'medium',
  long: 'long',
};

/**
 * Queries, in the customer's own words.
 *
 * A description with no keywords still searches: its first few words become one
 * query rather than the run returning nothing, and the panel shows exactly what
 * was sent so a bad query reads as a bad query rather than as an empty market.
 */
export function planCriteriaQueries(input: CriteriaInput, max: number): QueryPlanEntry[] {
  // CATEGORIES FIRST, then any keywords a stored search still carries. The form
  // collects categories now: one search per category, in the customer's own
  // words, and the results panel prints exactly what was sent.
  const terms = [...new Set([...input.categories, ...input.keywords])];
  const plan: QueryPlanEntry[] = terms.map((term) => ({
    q: term,
    terms: [term, ...terms.filter((t) => t !== term)],
    why: `You chose “${term}”.`,
  }));

  if (plan.length === 0 && input.product) {
    const words = input.product.split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
    if (words.length >= 2) {
      plan.push({
        q: words,
        terms: [words],
        why: 'Built from the opening of your product description, because no topic terms were given.',
      });
    }
  }

  if (plan.length === 0) {
    plan.push({ q: '', terms: [], why: 'Browse without a topic using your selected filters.' });
  }
  return plan.slice(0, max);
}

/**
 * Terms worth checking for in retrieved text.
 *
 * MULTI-WORD KEYWORDS ARE EXPANDED, and the reason is visible in a live run:
 * searching "hand grinder review" and then looking for that exact phrase in
 * titles found it on one channel out of fifteen, so fourteen real matches
 * reported "none of your terms appear" — a measurement artefact rendered as a
 * finding about the creator. The phrase is kept AND its words are added, so
 * coverage measures how much of what was asked about actually shows up.
 *
 * Words under four characters are dropped: "the" matches everything, and a
 * signal that always fires measures nothing.
 */
export function criteriaTerms(input: CriteriaInput): string[] {
  const words = (text: string) =>
    text.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4);

  return [
    ...new Set([
      ...input.categories,
      ...input.categories.flatMap((c) => (c.includes(' ') ? words(c) : [])),
      ...input.keywords,
      ...input.keywords.flatMap((keyword) => (keyword.includes(' ') ? words(keyword) : [])),
      ...words(input.product ?? '').slice(0, 6),
    ]),
  ];
}

export async function runCriteria(
  retriever: Retriever,
  input: CriteriaInput,
  limits: DiscoveryLimits,
  control?: RunControl,
): Promise<DiscoveryResult> {
  const plan = planCriteriaQueries(input, limits.queries);
  const terms = criteriaTerms(input);

  const subscriberBands = selectedBands(SUBSCRIBER_BANDS, input.subscribers);
  const viewBands = selectedBands(VIEW_BANDS, input.views);

  if (plan.length === 0) {
    return {
      mode: 'criteria',
      candidates: [],
      coverage: {
        queries: [],
        searchCalls: 0,
        otherCalls: 0,
        unitsSpent: 0,
        pagesRead: 0,
        resultsSeen: 0,
        truncated: false,
        stoppedBecause: 'complete',
        collectedAt: retriever.now().toISOString(),
      },
      appliedFilters: { api: [], post: [] },
      emptyReason: 'no_matches',
      notes: ['No category chosen, so there was nothing to search for.'],
    };
  }

  const publishedAfter =
    input.publishedWithinDays === null
      ? undefined
      : new Date(retriever.now().getTime() - input.publishedWithinDays * 86_400_000).toISOString();

  const collected = await collectCandidates(retriever, {
    plan: plan.map((entry) => ({ ...entry, terms })),
    base: {
      relevanceLanguage: input.language ?? undefined,
      regionCode: input.market ?? undefined,
      videoDuration: input.formats.length === 1 ? DURATION[input.formats[0]] : undefined,
      publishedAfter,
      order: 'relevance',
      maxResults: 50,
    },
    limits,
    control,
  });

  const filtered = applyPostFilters(collected.candidates, {
    // The band wins where one was chosen; the open numbers stay live for
    // searches that were run before bands existed.
    minSubscribers: input.minSubscribers,
    maxSubscribers: input.maxSubscribers,
    subscriberBands,
    viewBands,
    excludedTopics: input.excludeTopics,
  });

  const withReasons = filtered.kept.map((candidate) => ({
    ...candidate,
    reason: criteriaReason(candidate, collected.foundBy.get(candidate.channelId)?.q ?? null),
  }));

  const ranked = DISCOVERY_RANKING
    ? rankCandidates(withReasons, (candidate) => scoreSignals(criteriaSignals(candidate, terms, input)))
    : withReasons;

  const api: { name: string; value: string }[] = [
    { name: 'Search', value: plan.map((p) => p.q || 'All topics').join(' · ') },
  ];
  if (input.language) api.push({ name: 'Content language preference', value: input.language });
  if (input.market) api.push({ name: 'Market preference', value: input.market });
  if (input.formats.length === 1) api.push({ name: 'Video length', value: input.formats[0] });
  if (publishedAfter) api.push({ name: 'Published after', value: publishedAfter.slice(0, 10) });

  const post: { name: string; value: string }[] = [];
  if (subscriberBands.length) {
    post.push({ name: 'Subscribers', value: subscriberBands.map((item) => item.label).join(' or ') });
  } else if (input.minSubscribers != null || input.maxSubscribers != null) {
    post.push({
      name: 'Subscriber range',
      value: `${input.minSubscribers?.toLocaleString('en-US') ?? 'any'} – ${input.maxSubscribers?.toLocaleString('en-US') ?? 'any'}`,
    });
  }
  if (viewBands.length) {
    post.push({
      name: 'Typical views',
      value: `${viewBands.map((item) => item.label).join(' or ')} — median of the videos this search retrieved, not of the channel`,
    });
  }
  if (input.excludeTopics.length) post.push({ name: 'Excluded topics', value: input.excludeTopics.join(', ') });
  if (input.formats.length > 1) {
    post.push({ name: 'Video length', value: `${input.formats.join(', ')} — more than one length cannot be sent to YouTube as a filter, so results were not narrowed by it` });
  }

  const notes = filtered.removed.map((r) => `${r.count} removed — ${r.note}`);
  if (input.language || input.market) notes.push(LOCALE_PARAMETER_DISCLOSURE);

  return {
    mode: 'criteria',
    candidates: ranked,
    coverage: collected.coverage,
    appliedFilters: { api, post },
    emptyReason: emptyReason(ranked, collected.coverage.stoppedBecause),
    notes,
  };
}

function emptyReason(
  candidates: DiscoveryCandidate[],
  stopped: DiscoveryResult['coverage']['stoppedBecause'],
): DiscoveryResult['emptyReason'] {
  if (candidates.length > 0) return null;
  // The distinction the whole empty state turns on: a search that ran and found
  // nobody, versus a search that could not finish. Reporting the second as the
  // first tells a customer there are no creators for their product because our
  // budget ran out.
  if (stopped === 'quota_units' || stopped === 'quota_search_calls') return 'quota_exhausted';
  if (stopped === 'api_error') return 'api_error';
  // A cancellation has no empty reason at all. It is not a finding about the
  // market, and the job's own `cancelled` status is what the page renders.
  if (stopped === 'cancelled') return null;
  return 'no_matches';
}

/**
 * The reason, built from what was retrieved and nothing else.
 *
 * Always present, approval or not: it quotes a video title that came back and
 * names the query that found it, both of which are facts about our own search.
 */
export function criteriaReason(candidate: DiscoveryCandidate, query: string | null): string {
  const matched = candidate.evidence.filter((e) => e.matchedTerms.length > 0);
  const lead = matched[0] ?? candidate.evidence[0];
  const where = query ? `the search “${query}”` : 'this search';

  if (!lead) return `Returned by ${where}.`;
  if (!query) return `Found while browsing all topics — “${lead.title}”.`;
  if (matched.length === 0) {
    return `Returned by ${where}; none of your terms appear in the title or description of “${lead.title}”.`;
  }
  return `Returned by ${where}. ${matched.length} of the videos read name ${matched[0].matchedTerms.slice(0, 3).map((t) => `“${t}”`).join(', ')} — for example “${lead.title}”.`;
}

export function criteriaSignals(
  candidate: DiscoveryCandidate,
  terms: string[],
  input: CriteriaInput,
): Signal[] {
  const matched = candidate.evidence.flatMap((e) => e.matchedTerms);
  const withMatch = candidate.evidence.filter((e) => e.matchedTerms.length > 0);
  const inTitle = candidate.evidence.filter((e) => e.matchedIn === 'title' || e.matchedIn === 'both');

  return [
    {
      key: 'termCoverage',
      label: 'Your terms found in retrieved text',
      value: termCoverageSignal(terms, matched),
      weight: 3,
      missingBecause: 'No topic terms were given, so term coverage could not be measured.',
    },
    {
      key: 'depth',
      label: 'How many retrieved videos matched',
      value: depthSignal(withMatch.length),
      weight: 2,
      missingBecause: 'No retrieved video matched your terms, so depth is unmeasured rather than zero.',
    },
    {
      key: 'titleMatch',
      label: 'Matches in the title rather than only the description',
      value: candidate.evidence.length === 0 ? null : inTitle.length / candidate.evidence.length,
      weight: 2,
      missingBecause: 'No video metadata was retrieved for this channel.',
    },
    {
      key: 'recency',
      label: 'Matched videos inside the period you asked for',
      value: recency(candidate, input.publishedWithinDays),
      weight: 1,
      missingBecause: 'No publication dates were retrieved, or you set no period.',
    },
  ];
}

function recency(candidate: DiscoveryCandidate, withinDays: number | null): number | null {
  if (withinDays === null) return null;
  const dated = candidate.evidence.filter((e) => Number.isFinite(Date.parse(e.publishedAt)));
  if (dated.length === 0) return null;
  const cutoff = Date.now() - withinDays * 86_400_000;
  return dated.filter((e) => Date.parse(e.publishedAt) >= cutoff).length / dated.length;
}
