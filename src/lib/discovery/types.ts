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
  criteria: {
    label: 'Search by criteria',
    blurb: 'Describe the product and what the content should be about.',
  },
  similar: {
    label: 'Find similar channels',
    blurb: 'Start from one channel and look for others making comparable content.',
  },
  competitor: {
    label: 'Explore competitor collaborations',
    blurb: 'Confirm competing brands, then look for public evidence of who they have worked with.',
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
    'YouTube’s flag says the video contains paid promotion. That this brand is the sponsor is read from the description, not from the flag.',
  affiliate:
    'An affiliate link pays on referral. It is not evidence of a separate sponsorship fee, a brief, or any agreement between the brand and the creator.',
  gifted:
    'A stated gift is not a fee and not a campaign. It may have been unsolicited.',
  mention:
    'A mention or review is not proof of a commercial relationship. Creators talk about products nobody paid them to talk about.',
  customer_confirmed: 'Your own record. adfit has not verified it against any source.',
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
    title: 'No channels matched this search',
    body: 'The search ran and returned nothing usable. Widen the topic, drop a filter, or try the terms a viewer would type.',
  },
  channel_unsupported: {
    title: 'That channel cannot be used as a reference',
    body: 'YouTube has no channel at that address, or it is one of the catalogue channels YouTube generates automatically rather than one somebody uploads to.',
  },
  insufficient_reference_data: {
    title: 'Not enough public content to compare against',
    body: 'This channel has too few recent public uploads to describe. Rather than invent a profile from one video, nothing is claimed.',
  },
  competitor_unconfirmed: {
    title: 'No confirmed brands yet',
    body: 'Collaboration search runs against brands you confirm. Add or confirm at least one.',
  },
  no_collaboration_evidence: {
    title: 'No public collaboration evidence found',
    body: 'This search reached no videos tying these brands to a creator. That is not evidence that no collaboration happened — only that this search did not reach one.',
  },
  no_api_key: {
    title: 'YouTube access is not configured',
    body: 'This deployment has no YouTube API key, so no search can run. An operator configures it.',
  },
  quota_exhausted: {
    title: 'The daily YouTube budget is used up',
    body: 'Searches stopped at this deployment’s bound. Anything already collected is shown; the rest can be retrieved when the budget resets.',
  },
  approval_unavailable: {
    title: 'This step needs approval that is not configured',
    body: 'Retrieval works. The part of this mode that reads content into a profile is restricted until the operator establishes YouTube’s approval for it.',
  },
  api_error: {
    title: 'YouTube could not be reached',
    body: 'The search failed. This says nothing about how many creators match — it says the request did not complete.',
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
  'Similarity here is between what the channels publish. It is not audience overlap, shared viewers, comparable demographics or comparable purchasing — none of which public data can show.';
