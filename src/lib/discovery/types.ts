/**
 * The shapes the three discovery modes all produce.
 *
 * One result type on purpose: the workspace has a single results surface, and
 * a mode that returned its own shape would grow its own card, its own actions
 * and eventually its own idea of what a candidate is. What differs between
 * modes is the EVIDENCE and the REASON, which are fields here, not types.
 */

export type DiscoveryMode = 'criteria' | 'similar' | 'competitor';

export const DISCOVERY_MODES: Record<DiscoveryMode, { label: string; blurb: string }> = {
  criteria: { label: 'Search by criteria', blurb: 'Browse by location, then narrow the results.' },
  similar: { label: 'Find similar channels', blurb: 'Start from a channel you already like.' },
  competitor: {
    label: 'Explore competitor collaborations',
    blurb: 'Confirm competing brands, then see who they’ve worked with.',
  },
};

/**
 * How a result got here, in the words of the thing that found it.
 *
 * `matchedTerms` are terms from the query that appear in text we actually
 * retrieved — never a paraphrase, and never a term we hoped was there.
 */
export interface EvidenceVideo {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: string;
  views: number | null;
  /** YouTube's own flag. Null is "not reported", never false. */
  paidPromotion: boolean | null;
  /** Length in seconds when `videos.list` was reached for it, else null. */
  seconds: number | null;
  /** The audio language the UPLOADER declared. Never an audience measurement. */
  declaredLanguage: string | null;
  matchedTerms: string[];
  /** Where the terms were found in what we read. */
  matchedIn: 'title' | 'description' | 'both' | null;
  /** The exact retrieved text the match sits in, bounded for display. */
  excerpt: string | null;
}

export type EvidenceClass =
  /** The platform flagged paid promotion AND the description names this brand. */
  | 'explicit_paid'
  /** An affiliate link or affiliate disclosure for this brand. */
  | 'affiliate'
  /** A stated gift or loan of product. */
  | 'gifted'
  /** The brand or product is named. Nothing establishes a commercial relationship. */
  | 'mention'
  /** The customer told us this collaboration happened. Their record, not ours. */
  | 'customer_confirmed';

export const EVIDENCE_CLASS_LABEL: Record<EvidenceClass, string> = {
  explicit_paid: 'Disclosed paid promotion naming this brand',
  affiliate: 'Affiliate disclosure',
  gifted: 'Gifted product disclosure',
  mention: 'Brand mentioned — collaboration not established',
  customer_confirmed: 'Confirmed by you',
};

/**
 * What each class does NOT establish, printed with it.
 *
 * Every one of these sentences exists because the category above it reads as a
 * stronger claim than it is. A reader who sees "Affiliate disclosure" concludes
 * the creator was paid a fee by that brand; they were not necessarily, and the
 * evidence cannot tell us.
 */
export const EVIDENCE_CLASS_LIMIT: Record<EvidenceClass, string> = {
  explicit_paid:
    'YouTube flags the video as paid promotion. That this brand is the sponsor comes from the description, not the flag.',
  affiliate: 'An affiliate link pays on referral — not evidence of a sponsorship fee or an agreement.',
  gifted: 'A gift is not a fee or a campaign, and may have been unsolicited.',
  mention:
    'A mention is not proof of a commercial relationship. Creators talk about products nobody paid them for.',
  customer_confirmed: 'Your own record, unverified by adfit.',
};

export interface CollaborationRecord {
  brand: string;
  /** Named only when the retrieved text names it. */
  product: string | null;
  channelId: string;
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  publishedAt: string;
  /** Which endpoint and which query produced this row. */
  source: string;
  excerpt: string | null;
  classification: EvidenceClass;
  /** Why this class and not a stronger one. Never empty. */
  ambiguity: string;
  collectedAt: string;
}

/** What a run actually reached, so no count reads as a total. */
export interface Coverage {
  queries: string[];
  searchCalls: number;
  otherCalls: number;
  unitsSpent: number;
  pagesRead: number;
  resultsSeen: number;
  /** True when a bound stopped the run before the index did. */
  truncated: boolean;
  stoppedBecause: 'complete' | 'quota_units' | 'quota_search_calls' | 'candidate_cap' | 'cancelled' | 'api_error';
  collectedAt: string;
}

export interface Relevance {
  /** 0–1 over the signals that were AVAILABLE. Never over ones that were not. */
  score: number;
  /** Share of the total weight that had evidence behind it. */
  evidenceCoverage: number;
  band: 'strong' | 'moderate' | 'weak' | 'provisional';
  /** Results sharing a group are not distinguished. Ordering within is arbitrary. */
  tiedGroup: number;
  /** Signals with no evidence. Named, not scored as zero. */
  missing: string[];
  /** Each contributing signal, so the number can be taken apart. */
  parts: { key: string; label: string; value: number | null; weight: number }[];
}

export interface DiscoveryCandidate {
  channelId: string;
  title: string;
  handle: string | null;
  avatar: string | null;
  url: string;
  description: string | null;
  subscribers: number | null;
  hiddenSubscribers: boolean;
  videoCount: number | null;
  viewCount: number | null;
  /** One sentence, grounded in `evidence`. Never model prose without sources. */
  reason: string;
  evidence: EvidenceVideo[];
  /** Null when ranking is withheld — not zero, and not an empty object. */
  relevance: Relevance | null;
  /** Populated in competitor mode only. */
  collaborations: CollaborationRecord[];
  collectedAt: string;
}

export interface DiscoveryResult {
  mode: DiscoveryMode;
  candidates: DiscoveryCandidate[];
  coverage: Coverage;
  /** Filters YouTube applied, and filters we applied afterwards. Shown apart. */
  appliedFilters: { api: { name: string; value: string }[]; post: { name: string; value: string }[] };
  /** Set when the mode could not produce candidates for a nameable reason. */
  emptyReason: EmptyReason | null;
  /** Mode-specific extras the results page renders above the list. */
  reference?: ReferenceProfile | null;
  notes: string[];
}

export type EmptyReason =
  | 'no_matches'
  | 'channel_unsupported'
  | 'insufficient_reference_data'
  | 'competitor_unconfirmed'
  | 'no_collaboration_evidence'
  | 'no_api_key'
  | 'quota_exhausted'
  | 'approval_unavailable'
  | 'api_error';

export const EMPTY_REASON_COPY: Record<EmptyReason, { title: string; body: string }> = {
  no_matches: {
    title: 'No creators matched',
    body: 'Try a broader category, or remove a filter.',
  },
  channel_unsupported: {
    title: 'Channel not found',
    body: 'Check the URL or @handle. YouTube’s auto-generated topic channels can’t be used as a reference.',
  },
  insufficient_reference_data: {
    title: 'Not enough recent uploads',
    body: 'This channel has too few public uploads to compare others against.',
  },
  competitor_unconfirmed: {
    title: 'Confirm a brand first',
    body: 'Collaboration search runs on brands you’ve confirmed.',
  },
  no_collaboration_evidence: {
    title: 'No collaboration evidence found',
    body: 'This search reached none — which doesn’t mean none exists.',
  },
  // Neither of the next two is anything the person reading it can fix, so
  // neither tells them to try something that will not work.
  no_api_key: {
    title: 'Creator search isn’t set up yet',
    body: 'Ask whoever administers this workspace to finish setup.',
  },
  approval_unavailable: {
    title: 'This step isn’t available here',
    body: 'Searching works. The deeper read of channel content is turned off.',
  },
  quota_exhausted: {
    title: 'Daily search limit reached',
    body: 'Anything already found is shown below. More can be searched for tomorrow.',
  },
  api_error: {
    title: 'YouTube didn’t respond',
    body: 'Try again shortly. This says nothing about how many creators match.',
  },
};

/** The reference channel, shown before anything is searched for. */
export interface ReferenceProfile {
  channelId: string;
  title: string;
  handle: string | null;
  avatar: string | null;
  subscribers: number | null;
  videoCount: number | null;
  /** Null until (and unless) the gated profiling step runs. */
  summary: string | null;
  topics: { label: string; videoIds: string[] }[];
  /** How many uploads the profile was built from. Names its own denominator. */
  sampleSize: number;
  /** Dimensions the customer asked to compare on. */
  dimensions: SimilarityDimension[];
  /** Dimensions we could not evaluate, and why. */
  missingEvidence: { dimension: SimilarityDimension; why: string }[];
}

export type SimilarityDimension = 'topics' | 'formats' | 'scale' | 'language' | 'useCases';

export const SIMILARITY_DIMENSION_LABEL: Record<SimilarityDimension, string> = {
  topics: 'Topics',
  formats: 'Content formats',
  scale: 'Recent performance scale',
  language: 'Language',
  useCases: 'Product use cases addressed',
};

/**
 * What similarity of CONTENT does not tell anyone.
 *
 * The inference this blocks is the one every buyer makes unprompted: two
 * channels making the same videos must have the same viewers. Nothing public
 * supports that, and the data that would is Analytics data behind each
 * creator's own grant.
 */
export const SIMILARITY_LIMIT =
  'Similarity is between what the channels publish — not audience overlap, demographics or buying behaviour, none of which public data shows.';
