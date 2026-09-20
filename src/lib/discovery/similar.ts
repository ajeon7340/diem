import { DISCOVERY_SIMILARITY_PROFILE } from '@/lib/report/policy';
import type { VideoFacts } from '@/lib/youtube/search';
import { excludeReference, matchedTerms } from './candidates';
import { collectCandidates, type QueryPlanEntry } from './collect';
import type { DiscoveryLimits } from './limits';
import { depthSignal, rankCandidates, scaleSignal, scoreSignals, type Signal } from './rank';
import type { Retriever, RunControl } from './retriever';
import type { SimilarInput } from './schemas';
import type {
  DiscoveryCandidate,
  DiscoveryResult,
  ReferenceProfile,
  SimilarityDimension,
} from './types';
import { SIMILARITY_DIMENSION_LABEL } from './types';

/**
 * Mode 2: start from one channel, find others making comparable content.
 *
 * THE CLAIM THIS MODE MUST NOT MAKE is the one every buyer will read into it
 * anyway: that two channels making similar videos have similar audiences.
 * Nothing public supports it. Audience composition is Analytics data behind
 * each creator's own OAuth grant, and this product has neither. Every surface
 * here says similarity is between what the channels PUBLISH — see
 * `SIMILARITY_LIMIT` — and no signal in the scoring touches a viewer.
 *
 * THE SECOND FAILURE is inventing a profile for a channel that has not
 * published enough to have one. Three uploads is not a body of work, and a
 * summary written from three uploads reads exactly like one written from three
 * hundred. Below the floor this returns `insufficient_reference_data` and
 * nothing else.
 *
 * HOW THE QUERIES ARE BUILT, and the policy line through the middle of it:
 *
 *   Ungated — the reference channel's own recent VIDEO TITLES, used verbatim as
 *   search strings. Putting a title YouTube gave us back into YouTube's search
 *   box is what a person does by hand; no metric is created and nothing is
 *   stored that was not already retrieved. See the note in README on this
 *   interpretation, which is the one open question in this feature.
 *
 *   Gated — a described profile (recurring topics, formats, the needs the
 *   content addresses) and queries generated from it. That is our own reading
 *   of the catalogue, it is derived data, and it waits for approval.
 */

/** Below this many recent uploads, no profile is described and none is guessed. */
export const MIN_REFERENCE_UPLOADS = 3;

/** Titles longer than this are trimmed before being used as a query — a
 *  thirteen-word title searched whole matches only itself. */
const QUERY_WORDS = 6;

export interface ReferenceSample {
  profile: ReferenceProfile;
  videos: VideoFacts[];
}

export async function loadReference(
  retriever: Retriever,
  channelInput: string,
  dimensions: SimilarityDimension[],
  limits: DiscoveryLimits,
): Promise<
  | { ok: true; sample: ReferenceSample }
  | { ok: false; reason: 'channel_unsupported' | 'insufficient_reference_data'; message: string }
> {
  const resolved = await retriever.resolveChannel(channelInput);
  if (!resolved.ok) return { ok: false, reason: 'channel_unsupported', message: resolved.message };

  const [facts] = await retriever.fetchChannels([resolved.channel.channelId]);
  const uploadIds = await retriever.fetchRecentUploads(
    resolved.channel.channelId,
    limits.referenceUploads,
  );
  const videos = uploadIds.length ? await retriever.fetchVideos(uploadIds) : [];

  if (videos.length < MIN_REFERENCE_UPLOADS) {
    return {
      ok: false,
      reason: 'insufficient_reference_data',
      message: `Only ${videos.length} recent public upload${videos.length === 1 ? '' : 's'} could be read for ${resolved.channel.title}. That is not enough to describe what the channel makes, and describing it anyway would be invention.`,
    };
  }

  const missingEvidence: ReferenceProfile['missingEvidence'] = [];
  if (dimensions.includes('useCases') && !DISCOVERY_SIMILARITY_PROFILE) {
    missingEvidence.push({
      dimension: 'useCases',
      why: 'Reading content for the needs it addresses is restricted until approval is configured, so this dimension was not evaluated.',
    });
  }
  if (dimensions.includes('language') && videos.every((v) => !v.declaredLanguage)) {
    missingEvidence.push({
      dimension: 'language',
      why: 'None of the sampled uploads declares an audio language, so there is nothing to compare.',
    });
  }
  if (dimensions.includes('scale') && (facts?.subscribers ?? null) === null) {
    missingEvidence.push({
      dimension: 'scale',
      why: 'This channel hides its subscriber count, so scale cannot be compared.',
    });
  }

  return {
    ok: true,
    sample: {
      videos,
      profile: {
        channelId: resolved.channel.channelId,
        title: resolved.channel.title,
        handle: facts?.handle ?? resolved.channel.handle,
        avatar: facts?.avatar ?? resolved.channel.thumbnail,
        subscribers: facts?.subscribers ?? resolved.channel.subscribers,
        videoCount: facts?.videoCount ?? null,
        summary: null,
        topics: [],
        sampleSize: videos.length,
        dimensions,
        missingEvidence,
      },
    },
  };
}

/**
 * Queries from the reference channel's own recent titles.
 *
 * Deduplicated on the trimmed string, because a series that posts "EP.12 …",
 * "EP.13 …" would otherwise spend every query in the budget on one show.
 */
export function verbatimQueries(videos: VideoFacts[], max: number, topics: string[] = []): QueryPlanEntry[] {
  const seen = new Set<string>();
  const out: QueryPlanEntry[] = [];

  /**
   * REPRESENTATIVE FIRST, THEN MOST-VIEWED.
   *
   * Most-viewed alone was the first version and a live run showed why it is
   * wrong: @jameshoffmann's biggest upload in the sample was not about coffee,
   * so the one query the budget allowed searched for that, and the channels
   * that came back were similar to the outlier rather than to the channel. A
   * title carrying vocabulary the channel uses repeatedly is what a person
   * would have typed.
   *
   * Videos with no view count sort last rather than as zero — an unreported
   * count is not a small one.
   */
  const ordered = [...videos].sort((a, b) => {
    const represents = (video: VideoFacts) =>
      topics.length === 0 ? 0 : matchedTerms(topics, video.title.toLowerCase()).length;
    const byTopic = represents(b) - represents(a);
    if (byTopic !== 0) return byTopic;
    return (b.views ?? -1) - (a.views ?? -1);
  });

  for (const video of ordered) {
    const q = video.title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, QUERY_WORDS)
      .join(' ')
      .replace(/[|#]+/g, ' ')
      .trim();
    const key = q.toLowerCase();
    if (q.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push({
      q,
      terms: q.split(/\s+/).filter((w) => w.length >= 2),
      why: `Taken from the reference channel’s own video “${video.title}”.`,
    });
    if (out.length >= max) break;
  }
  return out;
}

export async function runSimilar(
  retriever: Retriever,
  input: SimilarInput,
  limits: DiscoveryLimits,
  control?: RunControl,
): Promise<DiscoveryResult> {
  const loaded = await loadReference(retriever, input.channel, input.dimensions, limits);
  const collectedAt = retriever.now().toISOString();

  if (!loaded.ok) {
    return {
      mode: 'similar',
      candidates: [],
      coverage: emptyCoverage(retriever, collectedAt),
      appliedFilters: { api: [], post: [] },
      emptyReason: loaded.reason,
      reference: null,
      notes: [loaded.message],
    };
  }

  const { profile, videos } = loaded.sample;
  const referenceVocabulary = topicTerms(videos);
  const plan = verbatimQueries(videos, limits.queries, referenceVocabulary);

  const collected = await collectCandidates(retriever, {
    plan,
    base: { order: 'relevance', maxResults: 50 },
    limits,
    exclude: [profile.channelId],
    control,
  });

  // Belt and braces: the reference is excluded from the search input AND from
  // the output. It is the single result that must never appear, and an exclusion
  // that only happens in one place is one refactor away from not happening.
  const candidates = excludeReference(collected.candidates, profile.channelId);

  const referenceTerms = referenceVocabulary;
  const referenceFormat = formatMix(videos);
  const referenceLanguages = new Set(
    videos.map((v) => v.declaredLanguage).filter((l): l is string => !!l).map(normaliseLanguage),
  );

  const described = candidates.map((candidate) => ({
    ...candidate,
    reason: similarReason(candidate, profile.title, referenceTerms),
  }));

  const ranked = rankCandidates(described, (candidate) =>
    scoreSignals(
      similaritySignals(candidate, {
        dimensions: input.dimensions,
        referenceTerms,
        referenceFormat,
        referenceLanguages,
        referenceSubscribers: profile.subscribers,
      }),
    ),
  );

  return {
    mode: 'similar',
    candidates: ranked,
    coverage: collected.coverage,
    appliedFilters: {
      api: [{ name: 'Search terms', value: plan.map((p) => p.q).join(' · ') }],
      post: [
        { name: 'Reference channel excluded', value: profile.title },
        { name: 'Duplicate channels merged', value: 'by canonical channel id' },
      ],
    },
    emptyReason:
      ranked.length > 0
        ? null
        : collected.coverage.stoppedBecause === 'quota_units' ||
            collected.coverage.stoppedBecause === 'quota_search_calls'
          ? 'quota_exhausted'
          : 'no_matches',
    reference: profile,
    notes: profile.missingEvidence.map(
      (m) => `${SIMILARITY_DIMENSION_LABEL[m.dimension]} not evaluated — ${m.why}`,
    ),
  };
}

function emptyCoverage(retriever: Retriever, collectedAt: string): DiscoveryResult['coverage'] {
  const spend = retriever.ledger.read();
  return {
    queries: [],
    searchCalls: spend.searchCalls,
    otherCalls: spend.otherCalls,
    unitsSpent: spend.units,
    pagesRead: 0,
    resultsSeen: 0,
    truncated: false,
    stoppedBecause: 'complete',
    collectedAt,
  };
}

/**
 * The words that recur across the reference channel's titles.
 *
 * A frequency count over retrieved titles, used only to MATCH against candidate
 * titles — it is not shown as a finding about the channel and is not stored.
 * Words appearing once are dropped: a single title's vocabulary is not what a
 * channel is about.
 */
export function topicTerms(videos: VideoFacts[], limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const video of videos) {
    const words = new Set(video.title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(isTopicWord));
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

/**
 * Is this word worth counting as a topic?
 *
 * MEASURED, NOT GUESSED. A live run against @jameshoffmann matched candidates
 * on "to", "we", "in", "me", "an" and "of" — a drama channel and a history
 * channel came back as similar to a coffee channel on the strength of English
 * function words, each with a confident "moderate" band under it. Two things
 * were wrong: the minimum length was two, and the stopword list was a dozen
 * words long.
 *
 * THE LENGTH FLOOR IS SCRIPT-DEPENDENT, which is why it is not simply three.
 * Korean and Japanese carry real meaning in two characters — 커피 is "coffee" —
 * so a flat three-character floor would delete the topic vocabulary of half the
 * market this was built against. ASCII words need three; everything else needs
 * two.
 */
function isTopicWord(word: string): boolean {
  if (STOPWORDS.has(word)) return false;
  const ascii = /^[\x00-\x7F]+$/.test(word);
  return ascii ? word.length >= 3 : word.length >= 2;
}

const STOPWORDS = new Set([
  // Function words that pass the length floor and mean nothing about a topic.
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'you', 'your', 'how', 'what', 'why',
  'are', 'was', 'were', 'been', 'have', 'has', 'had', 'but', 'not', 'all', 'can', 'will',
  'its', 'their', 'them', 'they', 'his', 'her', 'she', 'him', 'our', 'out', 'who', 'when',
  'where', 'which', 'into', 'over', 'than', 'then', 'them', 'more', 'most', 'some', 'any',
  'about', 'after', 'before', 'every', 'just', 'only', 'very', 'like', 'made', 'make',
  'one', 'two', 'three', 'new', 'best', 'top', 'get', 'got',
  // Channel furniture rather than subject matter.
  'feat', 'official', 'video', 'shorts', 'part', 'full', 'episode', 'live', 'sub', 'eng',
]);

/** Share of sampled uploads at most three minutes long. A PROXY for Shorts, and
 *  named one everywhere it is shown — public metadata does not identify Shorts. */
export function formatMix(videos: VideoFacts[]): number | null {
  const timed = videos.filter((v) => v.seconds !== null);
  if (timed.length === 0) return null;
  return timed.filter((v) => (v.seconds ?? 0) <= 180).length / timed.length;
}

function normaliseLanguage(code: string): string {
  return code.split('-')[0].toLowerCase();
}

export interface SimilarityContext {
  dimensions: SimilarityDimension[];
  referenceTerms: string[];
  referenceFormat: number | null;
  referenceLanguages: Set<string>;
  referenceSubscribers: number | null;
}

export function similaritySignals(
  candidate: DiscoveryCandidate,
  context: SimilarityContext,
): Signal[] {
  const signals: Signal[] = [];
  const candidateText = [candidate.title, candidate.description ?? '', ...candidate.evidence.map((e) => e.title)].join(' \n ');

  if (context.dimensions.includes('topics')) {
    const hits = matchedTerms(context.referenceTerms, candidateText);
    signals.push({
      key: 'topics',
      label: SIMILARITY_DIMENSION_LABEL.topics,
      value: context.referenceTerms.length === 0 ? null : hits.length / context.referenceTerms.length,
      weight: 3,
      missingBecause:
        'The reference channel’s titles share too little vocabulary to compare topics against.',
    });
  }

  if (context.dimensions.includes('formats')) {
    const candidateFormat = formatMixFromEvidence(candidate);
    signals.push({
      key: 'formats',
      label: SIMILARITY_DIMENSION_LABEL.formats,
      value:
        context.referenceFormat === null || candidateFormat === null
          ? null
          : 1 - Math.abs(context.referenceFormat - candidateFormat),
      weight: 2,
      missingBecause: 'No video lengths were retrieved on one side, so the format mix cannot be compared.',
    });
  }

  if (context.dimensions.includes('scale')) {
    signals.push({
      key: 'scale',
      label: SIMILARITY_DIMENSION_LABEL.scale,
      value: scaleSignal(context.referenceSubscribers, candidate.subscribers),
      weight: 1,
      missingBecause: 'One of the two channels hides its subscriber count.',
    });
  }

  if (context.dimensions.includes('language')) {
    const candidateLanguages = new Set(
      candidate.evidence
        .map((e) => e.declaredLanguage)
        .filter((l): l is string => !!l)
        .map(normaliseLanguage),
    );
    signals.push({
      key: 'language',
      label: SIMILARITY_DIMENSION_LABEL.language,
      value:
        context.referenceLanguages.size === 0 || candidateLanguages.size === 0
          ? null
          : [...candidateLanguages].some((l) => context.referenceLanguages.has(l))
            ? 1
            : 0,
      weight: 1,
      missingBecause: 'Neither side declares an audio language on the uploads we read.',
    });
  }

  if (context.dimensions.includes('useCases')) {
    signals.push({
      key: 'useCases',
      label: SIMILARITY_DIMENSION_LABEL.useCases,
      value: null,
      weight: 2,
      missingBecause: DISCOVERY_SIMILARITY_PROFILE
        ? 'The content profile did not produce comparable use cases for this channel.'
        : 'Reading content for the needs it addresses is restricted until approval is configured.',
    });
  }

  signals.push({
    key: 'depth',
    label: 'Retrieved videos supporting the comparison',
    value: depthSignal(candidate.evidence.length),
    weight: 1,
    missingBecause: 'No video metadata was retrieved for this channel.',
  });

  return signals;
}

/**
 * The candidate's short/long mix, from the videos actually retrieved for it.
 *
 * A far smaller sample than the reference's — a handful of search hits against
 * a page of uploads — and it is a PROXY either way, since public metadata does
 * not identify Shorts and this only asks whether a video is at most three
 * minutes. Null when no duration came back, so the dimension goes unevaluated
 * rather than scoring every candidate the same.
 */
export function formatMixFromEvidence(candidate: DiscoveryCandidate): number | null {
  const timed = candidate.evidence.filter((e) => e.seconds !== null);
  if (timed.length === 0) return null;
  return timed.filter((e) => (e.seconds ?? 0) <= 180).length / timed.length;
}

export function similarReason(
  candidate: DiscoveryCandidate,
  referenceTitle: string,
  referenceTerms: string[],
): string {
  const text = [candidate.title, ...candidate.evidence.map((e) => e.title)].join(' \n ');
  const shared = matchedTerms(referenceTerms, text).slice(0, 3);
  const example = candidate.evidence[0];

  if (shared.length === 0) {
    return `Returned by a search built from ${referenceTitle}’s own video titles${example ? `, on “${example.title}”` : ''}. No recurring term from the reference appears in what was read here.`;
  }
  return `Shares ${shared.map((t) => `“${t}”`).join(', ')} with ${referenceTitle}’s recurring titles${example ? ` — for example “${example.title}”` : ''}.`;
}

/**
 * The differences worth printing beside a similarity.
 *
 * Similarity features show what matched and stop, which leaves the reader to
 * discover on the call that the channel is a tenth the size and posts in
 * another language. These are the differences the data can actually support.
 */
export function importantDifferences(
  candidate: DiscoveryCandidate,
  profile: ReferenceProfile,
): string[] {
  const out: string[] = [];

  if (profile.subscribers && candidate.subscribers) {
    const ratio = candidate.subscribers / profile.subscribers;
    if (ratio >= 3 || ratio <= 1 / 3) {
      out.push(
        `${ratio >= 3 ? 'Substantially larger' : 'Substantially smaller'} than ${profile.title}: ${candidate.subscribers.toLocaleString('en-US')} against ${profile.subscribers.toLocaleString('en-US')} subscribers.`,
      );
    }
  } else if (candidate.subscribers === null) {
    out.push('Subscriber count is hidden on this channel, so size cannot be compared.');
  }

  if (candidate.evidence.length <= 1) {
    out.push('Only one retrieved video supports this comparison.');
  }

  for (const missing of profile.missingEvidence) {
    out.push(`${SIMILARITY_DIMENSION_LABEL[missing.dimension]} was not evaluated.`);
  }

  return out;
}
