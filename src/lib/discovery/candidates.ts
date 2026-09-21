import type { ChannelFacts, SearchVideoHit, VideoFacts } from '@/lib/youtube/search';
import { inBand, medianViews, type Band } from './ranges';
import type { DiscoveryCandidate, EvidenceVideo } from './types';

/**
 * Turning a pile of search hits into a list of channels, exactly once each.
 *
 * Every mode here hits the same problem: one channel comes back from four
 * queries on six videos, and a results list that shows it six times is not a
 * list of creators. Deduplication is by CANONICAL CHANNEL ID and by nothing
 * else — not by title, which changes and repeats; not by handle, which is
 * nullable and re-assignable; not by what the customer typed.
 */

const CHANNEL_ID = /^UC[\w-]{22}$/;

/**
 * The one identifier a candidate is keyed on.
 *
 * Returns null rather than guessing. A handle cannot be turned into an id
 * locally — that needs a lookup, which `resolveChannel` does — and inventing a
 * key here would merge two channels or split one, both silently.
 */
export function canonicalChannelId(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (CHANNEL_ID.test(raw)) return raw;
  const fromUrl = raw.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
  return fromUrl ? fromUrl[1] : null;
}

export function channelUrl(channelId: string, handle: string | null): string {
  return handle ? `https://www.youtube.com/${handle.startsWith('@') ? handle : `@${handle}`}` : `https://www.youtube.com/channel/${channelId}`;
}

/**
 * Which query terms are actually present in text we retrieved.
 *
 * Case-insensitive, and for scripts without spaces (Korean and Japanese are
 * both in the corpus this was built against) a substring test rather than a
 * word boundary — `\b` does not fire between Hangul syllables, so a
 * word-boundary match finds nothing at all in half the market.
 *
 * A term the text does not contain is never returned. This is the function that
 * makes "why it appeared" checkable rather than plausible.
 */
export function matchedTerms(terms: string[], text: string): string[] {
  const haystack = text.toLowerCase();
  const out: string[] = [];
  for (const term of terms) {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) continue;
    if (haystack.includes(needle) && !out.includes(term)) out.push(term);
  }
  return out;
}

export function evidenceFrom(
  hit: SearchVideoHit,
  terms: string[],
  facts?: VideoFacts,
): EvidenceVideo {
  const title = facts?.title ?? hit.title;
  const description = facts?.description ?? hit.description;
  const inTitle = matchedTerms(terms, title);
  const inDescription = matchedTerms(terms, description);
  const all = [...new Set([...inTitle, ...inDescription])];

  return {
    videoId: hit.videoId,
    channelId: hit.channelId,
    title,
    publishedAt: facts?.publishedAt ?? hit.publishedAt,
    views: facts?.views ?? null,
    paidPromotion: facts?.paidPromotion ?? null,
    seconds: facts?.seconds ?? null,
    declaredLanguage: facts?.declaredLanguage ?? null,
    matchedTerms: all,
    matchedIn:
      inTitle.length && inDescription.length
        ? 'both'
        : inTitle.length
          ? 'title'
          : inDescription.length
            ? 'description'
            : null,
    excerpt: all.length ? excerptAround(inTitle.length ? title : description, all[0]) : null,
  };
}

/** A bounded window of the retrieved text around the first matched term. */
export function excerptAround(text: string, term: string, width = 180): string {
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) return text.slice(0, width);
  const start = Math.max(0, at - Math.floor(width / 3));
  const slice = text.slice(start, start + width).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${slice}${start + width < text.length ? '…' : ''}`;
}

export interface MergeInput {
  facts: ChannelFacts;
  evidence: EvidenceVideo[];
  reason: string;
  collectedAt: string;
}

/**
 * One row per channel, with every piece of evidence that pointed at it.
 *
 * Evidence is unioned by video id: the same video found by two queries is one
 * piece of evidence, and counting it twice would inflate exactly the figure a
 * reader uses to judge how well-supported a result is.
 */
export function mergeCandidates(inputs: MergeInput[]): DiscoveryCandidate[] {
  const byChannel = new Map<string, DiscoveryCandidate>();

  for (const input of inputs) {
    const id = canonicalChannelId(input.facts.channelId);
    if (!id) continue;

    const existing = byChannel.get(id);
    if (!existing) {
      byChannel.set(id, {
        channelId: id,
        title: input.facts.title,
        handle: input.facts.handle,
        avatar: input.facts.avatar,
        url: channelUrl(id, input.facts.handle),
        description: input.facts.description,
        subscribers: input.facts.subscribers,
        hiddenSubscribers: input.facts.hiddenSubscribers,
        videoCount: input.facts.videoCount,
        viewCount: input.facts.viewCount,
        reason: input.reason,
        evidence: dedupeEvidence(input.evidence),
        relevance: null,
        collaborations: [],
        collectedAt: input.collectedAt,
      });
      continue;
    }

    existing.evidence = dedupeEvidence([...existing.evidence, ...input.evidence]);
    // The reason from the query that found it FIRST stands. Concatenating
    // reasons produces a paragraph nobody reads and a claim nobody checked.
  }

  return [...byChannel.values()];
}

export function dedupeEvidence(evidence: EvidenceVideo[]): EvidenceVideo[] {
  const seen = new Map<string, EvidenceVideo>();
  for (const item of evidence) {
    const prior = seen.get(item.videoId);
    if (!prior) {
      seen.set(item.videoId, item);
      continue;
    }
    // Same video, two queries: keep the union of what matched, and prefer a
    // flag that was actually reported over one that was not.
    seen.set(item.videoId, {
      ...prior,
      matchedTerms: [...new Set([...prior.matchedTerms, ...item.matchedTerms])],
      paidPromotion: prior.paidPromotion ?? item.paidPromotion,
      seconds: prior.seconds ?? item.seconds,
      declaredLanguage: prior.declaredLanguage ?? item.declaredLanguage,
      excerpt: prior.excerpt ?? item.excerpt,
    });
  }
  return [...seen.values()];
}

/**
 * Drop the channel the search started from.
 *
 * "Find channels like this one" returning that one at the top is the failure
 * every similarity feature ships with once, and it is not cosmetic: the
 * reference channel matches its own profile better than anything else can, so
 * it takes the top slot and the strongest wording with it.
 */
export function excludeReference<T extends { channelId: string }>(
  candidates: T[],
  referenceChannelId: string | null,
): T[] {
  const reference = canonicalChannelId(referenceChannelId);
  if (!reference) return candidates;
  return candidates.filter((c) => canonicalChannelId(c.channelId) !== reference);
}

export interface PostFilters {
  /** Inclusive. Either end may be null, which means unbounded, not zero. */
  minSubscribers?: number | null;
  maxSubscribers?: number | null;
  /** Band for the typical views of the videos THIS SEARCH retrieved. */
  viewBand?: Band | null;
  /** Terms that disqualify a candidate if they appear in its retrieved text. */
  excludedTopics?: string[];
  /** Drop channels whose subscriber count is hidden when a range was asked for. */
  requireVisibleSubscribers?: boolean;
}

export interface FilterOutcome<T> {
  kept: T[];
  /** Per filter, how many rows it removed — so "12 results" can be explained. */
  removed: { filter: string; count: number; note: string }[];
}

/**
 * Filters applied AFTER retrieval, each one counted.
 *
 * The counting is the point. A customer who asked for 10k–100k subscribers and
 * got four results needs to know whether the search found four channels or
 * found forty and forty-six were outside the range, and those are different
 * answers to the question they are actually asking.
 *
 * A HIDDEN SUBSCRIBER COUNT IS NOT A FAILING ONE. `subscribers` is null when
 * the creator switched the count off; treating null as 0 would drop every such
 * channel out of every minimum, silently, and they are not small — they are
 * unmeasured. They are set aside and reported separately.
 */
export function applyPostFilters(
  candidates: DiscoveryCandidate[],
  filters: PostFilters,
): FilterOutcome<DiscoveryCandidate> {
  const removed: FilterOutcome<DiscoveryCandidate>['removed'] = [];
  let kept = candidates;

  const hasRange = filters.minSubscribers != null || filters.maxSubscribers != null;
  if (hasRange) {
    const before = kept.length;
    const hidden = kept.filter((c) => c.subscribers === null);
    kept = kept.filter((c) => {
      if (c.subscribers === null) return !filters.requireVisibleSubscribers;
      if (filters.minSubscribers != null && c.subscribers < filters.minSubscribers) return false;
      if (filters.maxSubscribers != null && c.subscribers > filters.maxSubscribers) return false;
      return true;
    });
    if (before !== kept.length) {
      removed.push({
        filter: 'subscriberRange',
        count: before - kept.length,
        note: 'Outside the subscriber range you set, measured after retrieval.',
      });
    }
    if (hidden.length) {
      removed.push({
        filter: 'hiddenSubscriberCount',
        count: hidden.length,
        note: filters.requireVisibleSubscribers
          ? 'Subscriber count hidden by the creator, so the range could not be checked — excluded.'
          : 'Subscriber count hidden by the creator, so the range could not be checked — kept and marked.',
      });
    }
  }

  const viewBand = filters.viewBand;
  if (viewBand && (viewBand.min !== null || viewBand.max !== null)) {
    const before = kept.length;
    let unmeasured = 0;
    kept = kept.filter((candidate) => {
      const verdict = inBand(medianViews(candidate.evidence.map((e) => e.views)), viewBand);
      // Unmeasured is kept and counted, never dropped: a channel whose
      // retrieved videos reported no view count has not failed the filter, and
      // removing it would quietly narrow the field on missing data.
      if (verdict === null) {
        unmeasured += 1;
        return true;
      }
      return verdict;
    });
    if (before !== kept.length) {
      removed.push({
        filter: 'recentViewRange',
        count: before - kept.length,
        note: 'Typical views of the videos this search retrieved fell outside the band you chose.',
      });
    }
    if (unmeasured) {
      removed.push({
        filter: 'viewsUnmeasured',
        count: unmeasured,
        note: 'No view count came back for these — kept, because an unreported figure is not a small one.',
      });
    }
  }

  const excluded = (filters.excludedTopics ?? []).map((t) => t.trim()).filter((t) => t.length > 1);
  if (excluded.length) {
    const before = kept.length;
    kept = kept.filter((candidate) => {
      const text = [
        candidate.title,
        candidate.description ?? '',
        ...candidate.evidence.map((e) => e.title),
      ].join(' \n ');
      return matchedTerms(excluded, text).length === 0;
    });
    if (before !== kept.length) {
      removed.push({
        filter: 'excludedTopics',
        count: before - kept.length,
        note: 'An excluded term appeared in the channel name, description or a retrieved video title.',
      });
    }
  }

  return { kept, removed };
}
