/**
 * Data contract for the public profile, the directory, and both funnels.
 *
 * The load-bearing type is `ProfileView`: a discriminated union on
 * `access.mode`. On every locked branch the `report` field does not exist on
 * the type at all, so locked metrics are never serialised into the RSC payload.
 * The frosted glass on the profile is a curiosity device over placeholder
 * geometry — it is not, and must never become, the access control.
 */

export type SocialPlatform = 'youtube' | 'instagram';
export type AdFatigueLevel = 'low' | 'moderate' | 'high';
export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';
export type BillingPlan = 'free' | 'pro_agency';
export type OrgRole = 'owner' | 'admin' | 'member';
export type BriefStatus = 'sent' | 'viewed' | 'accepted' | 'declined';

// ---------------------------------------------------------------------------
// Creator (public surface)
// ---------------------------------------------------------------------------

/** Everything an anonymous visitor is entitled to. */
export interface Creator {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  niche: string | null;
  bio: string | null;
  isVerified: boolean;
  /** Track B opt-in: listed in the agency directory, instantly readable by Pro. */
  isDirectoryVisible: boolean;
  /** Advisory floor shown on the proposal form. Never blocks a request. */
  /**
   * What a placement with this creator is likely to cost.
   *
   * A RANGE, not a floor. `minimumBudget` asked for the smallest figure a
   * creator would accept and published it, which anchored every negotiation at
   * their own worst number and told a buyer only what the creator would not do.
   *
   * `budgetMax` null with a `budgetMin` present renders as "from X" — a floor
   * is still a true thing to say, and inventing a ceiling from a multiple
   * would not be.
   */
  budgetMin: number | null;
  budgetMax: number | null;
  /** They will not publish figures. Honest; renders as such, never as free. */
  budgetNegotiable: boolean;
  /** Historical. The basis of stored CPMs — see migration 0020. */
  minimumBudget: number | null;
  totalFollowers: number;
  platforms: SocialStats[];
  /** 2–3 qualitative chips. Claims about locked metrics, never the figures. */
  teaserHighlights: TeaserHighlight[];
  hasReport: boolean;
  lastAnalyzedAt: string | null;
}

export interface TeaserHighlight {
  label: string;
  /** Emerald reads as a positive signal; indigo and slate are neutral. */
  tone: 'emerald' | 'indigo' | 'slate';
}

export interface SocialStats {
  platform: SocialPlatform;
  handle: string | null;
  followerCount: number;
  /** Platform-specific rollup written by the ingestion worker. */
  statsSummary: {
    medianViews?: number;
    postsAnalyzed?: number;
    engagementRate?: number;
  };
}

// ---------------------------------------------------------------------------
// AI report (locked)
// ---------------------------------------------------------------------------

export interface DistributionBucket {
  label: string;
  /** 0–1, summing to ~1 within its dimension. */
  share: number;
}

export interface Demographics {
  ageBands: DistributionBucket[];
  genderSplit: DistributionBucket[];
  topCountries: DistributionBucket[];
  /** Share reachable at the creator's typical posting hours, 0–1. */
  activeAudienceRate: number;
}

/**
 * Why a particular comment was surfaced. A buyer reads a "most liked" comment
 * very differently from a typical one, so the basis is stated rather than left
 * to be assumed.
 */
export type EvidenceBasis = 'representative' | 'most_liked' | 'most_recent';

/**
 * One comment, on the creator's own post or video, with a route back to it.
 *
 * No author field, deliberately: the comment is public and the permalink
 * exposes whoever wrote it, but reprinting handles inside a document that gets
 * emailed around a buying team is a different act from linking to the source.
 */
export interface ClusterComment {
  id: string;
  /**
   * Null once the 30-day verbatim horizon has passed — see `expireVerbatim`.
   * The cluster it belongs to survives; only the stored copy of what somebody
   * wrote goes. Non-nullable before that change, so null can only mean expired.
   */
  text: string | null;
  platform: SocialPlatform;
  /** The creator's post or video this comment sits on. */
  postId: string;
  postTitle: string | null;
  /** Dropped with the text: API Data about one comment, nothing derives from it. */
  likes: number | null;
  publishedAt: string | null;
  basis: EvidenceBasis;
  /** Permalink to the comment, or the post when the platform has no comment anchor. */
  url: string | null;
}

/** One semantically grouped set of comments from the LLM clustering pass. */
/**
 * What a comment is ABOUT. One of two axes; see `CommentIntent` for the other.
 *
 * A single axis could not express the thing a buyer most needs to know. Under
 * the old enum, "asking where to buy this primer" and "asking who she is" were
 * both questions, separated only by a free-text label — so the share of a
 * comment section actually attached to something purchasable was not a number
 * the report could produce. It is now: sum every cluster with object
 * `product`. On the first channel measured that was 6.7%, against the 0.6% the
 * single-axis model implied.
 *
 * `unclassified` is reserved for comments with no determinable referent —
 * meta banter ("first", "who's watching in 2026") and text the rules cannot
 * read.
 *
 * `subject` — SOMEONE ELSE THE VIDEO IS ABOUT — exists because the standing
 * default above turned out to be wrong on an entire format.
 *
 * The default was: a comment on a creator's own video carrying no product,
 * content or meta marker is taken to be about the creator, "because these
 * intents need a target and no other referent exists on the page". On a
 * call-out, reaction, interview or dispute video there IS another referent on
 * the page, and it is usually the loudest thing in the section. Measured on
 * @가재맨, whose uploads are largely a third party being confronted: the
 * audience is overwhelmingly WARM about the creator ("형섭이 똑똑하다") and
 * hostile about the person in the video. Folding the second into `creator`
 * would have produced an enormous `creator:criticise` and reported an audience
 * that likes him as one that does not.
 *
 * It is not `content` either: "his story doesn't add up" is about a person's
 * conduct, not about the edit, the format or the upload. And it is not
 * `unclassified`, which means the classifier could not read the comment — these
 * read perfectly well.
 *
 * `subject` carries NO purchase-intent weight, in any combination. Someone
 * arguing about a third party is not closer to buying anything, and a busy
 * call-out section must not read as commercial engagement.
 */
export type CommentObject = 'creator' | 'content' | 'product' | 'subject' | 'unclassified';

/**
 * What a comment WANTS. Exhaustive and single-label by contract: every analysed
 * comment lands in exactly one, so shares are parts of a whole and a proportion
 * bar over them is honest. The same holds for `CommentObject`, which makes the
 * cross-product exhaustive too — collapse along either axis and the total is
 * still 100%.
 *
 * `react` was called `off_topic` until this taxonomy replaced it, and the old
 * name is why it got filtered out of the UI: "off-topic" sounds like noise. It
 * is not. A comment section that reacts to the creator rather than to anything
 * they are holding is the single most consequential fact a brand can learn —
 * on one real channel it was 54.6% of 21,330 comments, and hiding it made the
 * remaining clusters read as if they were the whole audience.
 *
 * `request` earns its place on evidence rather than symmetry: asking a creator
 * to make a particular video is neither a question nor applause, and it is the
 * highest-value non-purchase signal there is. An audience that asks for
 * tutorials is an audience that will accept a sponsored one.
 *
 * `unclassified` is the terminal bucket, and it is measured rather than
 * inferred: the classifier puts a comment here when it cannot read it, so the
 * figure means "the model could not place these" rather than "the numbers did
 * not add up". See `withResidual` in src/lib/report/clusters for the arithmetic
 * fallback that still guards rows written by anything else.
 */
export type CommentIntent =
  | 'buy'
  | 'request'
  | 'ask'
  | 'praise'
  /** Substantive objection: the edit, the price, the claim, the method. */
  | 'criticise'
  /**
   * Personal attack: slurs, sexual harassment, threats, pure vulgarity.
   *
   * Split out of `criticise` because the two were being scored as one thing
   * and they are opposites. "Her editing is heavy-handed" is an audience
   * telling a creator something. The other is an audience doing something TO
   * them — and a report that lets the second lower the creator's own rating is
   * marking them down for being a target.
   *
   * Nothing on this rung counts against the creator. It feeds two other
   * places instead: the moderation queue they can act on, and the brand's
   * ad-adjacency read, which cares that the comment exists and not at all who
   * it was aimed at.
   */
  | 'abuse'
  | 'react'
  | 'unclassified';

/**
 * Each axis rolled up over the whole corpus.
 *
 * Stored rather than derived from `topCommentClusters`, because clusters are a
 * readable summary: small cells are folded into an "other" group whose members
 * no longer share one object or one intent. Summing the clusters would
 * therefore produce a rollup that is close to right and quietly wrong. These
 * counts come from the classification pass itself.
 */
export interface CommentAxes {
  object: Array<{ key: CommentObject; count: number }>;
  intent: Array<{ key: CommentIntent; count: number }>;
  /**
   * The object x intent CROSS-PRODUCT, and the only thing purchase intent can
   * be computed from.
   *
   * The margins cannot produce it. They say how many comments are `buy` and
   * how many are about a `product`; they cannot say how many are both, and
   * `buy` aimed at a creator is merch. No arithmetic over two margins recovers
   * a joint distribution — see migration 0013.
   *
   * Empty on rows written before the classifier emitted it. Those keep
   * whatever rate the pipeline stored, with its basis unknown.
   */
  cells: Array<{ object: CommentObject; intent: CommentIntent; count: number }>;
  /** Denominator. Every axis sums to exactly this. */
  total: number;
}

/**
 * How the comment section is WRITTEN, measured from the text itself.
 *
 * Deliberately not an inference about who wrote it. "This audience skews
 * older" is exactly the shape III.E.4.h(ii) forbids — a derived metric used to
 * profile on a protected attribute, with age named in the policy — and it
 * would be a guess on top of that. Register is a property of the comments, so
 * it can be stated as a fact and checked by reading them.
 *
 * Every share is over `scanned`, which is the register pass's OWN denominator
 * and not the clustering corpus. Null fields mean the pass has not run.
 */
export interface CommentRegister {
  /** Comments the register pass read. The denominator for every share here. */
  scanned: number;
  /**
   * Share written in a polite or complete register: Korean 존댓말 endings, or
   * a capitalised sentence with terminal punctuation in Latin script.
   */
  formalShare: number;
  /**
   * Share carrying internet shorthand — Korean consonant-only forms (ㅋㅋ, ㅇㅇ,
   * ㅈㄴ), heavy abbreviation, letter-stretching.
   */
  slangShare: number;
  /** Share carrying at least one emoji. */
  emojiShare: number;
  /** Median length in characters. A section of three-word reactions reads differently from one of paragraphs. */
  medianLength: number;
}

/**
 * The headline read on a comment section's social temperature.
 *
 * Replaces a list of risk categories as the headline. Categories answer "what
 * is in here"; a buyer's first question is "what is it LIKE in here", and a
 * row of counts made them assemble that themselves.
 *
 * NOT A RATING. `hostile` is not worse than `warm` — it is a different buy. A
 * combative section converts for some categories and is disqualifying for
 * others, and the report's job is to say which one this is, not to rank it.
 * The creator is not marked up or down by any of it: they did not write it.
 */
export type ClimateLabel = 'warm' | 'ordinary' | 'rough' | 'hostile';

/**
 * Secondary characteristics, orthogonal to the label.
 *
 * `polarised` is the one worth a sentence: it is high praise and high
 * criticism AT THE SAME TIME — an audience that splits rather than agrees.
 * That is a different fact from a hostile section, and it is the one a
 * launch-risk-averse buyer actually asks about.
 */
export type ClimateTrait = 'polarised' | 'formal' | 'casual';

export interface AudienceClimate {
  /** Null when too little was read to say. Never a default of `ordinary`. */
  label: ClimateLabel | null;
  traits: ClimateTrait[];
  /**
   * One sentence, generated from the figures rather than written by a model.
   *
   * The fit read is the place for argued prose and it is verified claim by
   * claim. This sentence is the opposite: a template over measured numbers, so
   * it cannot drift from them and needs no API key to render.
   */
  summary: string;
  /** Everything the label was computed from, for the method note under it. */
  basis: {
    /** Interpersonal hostility as a share of what the risk scan read, 0–1. */
    hostileShare: number | null;
    /** Comments the risk scan read. */
    scanned: number | null;
    criticiseShare: number | null;
    praiseShare: number | null;
    praiseRatio: number | null;
    /** The clustering corpus total, which is a different denominator from `scanned`. */
    classified: number | null;
  };
  rubricVersion: string;
}

export interface CommentCluster {
  id: string;
  label: string;
  /**
   * Portion of analysed comments in this cluster, 0–1.
   *
   * Shares across a report's clusters sum to 1. Render every one of them: a
   * proportion display that drops a bucket while keeping the full denominator
   * prints a number that cannot be reconciled with its own total.
   */
  share: number;
  /** Absolute count, rather than derived from `share` and rounded. */
  commentCount: number;
  /**
   * -1 (hostile) … 1 (enthusiastic), or null where valence is already carried
   * by the intent axis.
   *
   * A two-axis pass leaves this null on purpose. The lexicon that decides
   * `praise` vs `criticise` is the same one that would score the sentiment, so
   * a `praise` cluster comes out positive by construction — the number would
   * restate the badge beside it and look like corroboration. Single-axis rows
   * written before the taxonomy change still carry a real score.
   */
  sentiment: number | null;
  /** Null on rows written before two-axis classification. */
  object: CommentObject | null;
  intent: CommentIntent;
  /** The terms that actually define this cluster — makes the grouping legible. */
  keyphrases: string[];
  /** Verifiable evidence. Empty falls back to `exampleComment`. */
  comments: ClusterComment[];
  /** Legacy single quote, kept so rows written before 0007 still render. */
  exampleComment: string;
}


// ---------------------------------------------------------------------------
// Buyer-side blocks
//
// Everything above describes the audience. These six answer the questions a
// marketer has to answer before releasing budget — see migration 0003.
// ---------------------------------------------------------------------------

export type BenchmarkMetric =
  | 'sentiment'
  | 'purchaseIntent'
  | 'brandSafety'
  | 'engagement';

export interface Benchmark {
  metric: BenchmarkMetric;
  value: number;
  /** Median for the cohort, in the same unit as `value`. */
  cohortMedian: number;
  /** 0–100, higher is better. What turns a raw score into a judgement. */
  percentile: number;
}

export interface Benchmarks {
  /** e.g. "Consumer Tech · 500k–1M followers". Names what we compared against. */
  cohortLabel: string;
  cohortSize: number;
  metrics: Benchmark[];
}

/**
 * Derived from the creator's stated minimum budget and median views — an
 * estimate, not a quote. The UI is required to say so: a CPM a buyer mistakes
 * for a rate card is worse than no CPM.
 */
export interface CostEfficiency {
  currency: string;
  basisBudget: number;
  medianViews: number;
  /** Cost per thousand views at the basis budget. */
  estimatedCpm: number;
  /** Cost per thousand *engaged* viewers — CPM adjusted by engagement rate. */
  costPerThousandEngaged: number;
  cohortMedianCpm: number | null;
  /**
   * The category's typical sponsored-to-organic view retention, 0–1.
   *
   * `estimatedCpm` is derived from median views. For a creator who has never
   * run a sponsorship every one of those views is organic, and sponsored posts
   * systematically underperform — so the headline figure is the best case. This
   * is what lets the UI state a realistic number rather than invent a
   * multiplier or say nothing.
   */
  cohortMedianRetention: number | null;
}

/** The evidence behind `adFatigueLevel`, which on its own is just a verdict. */
export interface SponsoredPerformance {
  sponsoredPostsAnalyzed: number;
  windowDays: number;
  organicMedianViews: number;
  sponsoredMedianViews: number;
  /** sponsored ÷ organic median views. 1.0 means no drop-off. */
  viewRetention: number;
  /**
   * Both 0–100, same scale as `sentimentScore`. NULL when the sentiment pass
   * has not run on that half — which is not the same as a sentiment of zero.
   *
   * Required until 2026-09-16, and the cost was immediate: a creator with no
   * sentiment pass carried 0 and 0, and the panel rendered
   * "0.0 → 0.0 +0%" IN EMERALD — because the delta helper treats a zero
   * denominator as no change, and no change is coloured as a good outcome. An
   * unmeasured field came out as a green, flat, confident result on a 0-100
   * scale where 0 is the worst score available. Absence rendering as a finding,
   * in the one direction nobody checks.
   */
  organicSentiment: number | null;
  sponsoredSentiment: number | null;
}

export type RiskSeverity = 'none' | 'low' | 'medium' | 'high';

/**
 * What `incidence` is a share OF.
 *
 * The field used to be documented as "share of analysed content or comments",
 * and the fixtures duly used both: profanity at 1.26% of COMMENTS sat in the
 * same array as a competitor conflict at 22% of SPONSORED POSTS. Two
 * denominators in one number means no formula can combine them, and the
 * brand-safety score was the formula that was supposed to — which is one
 * reason it was never written and the column carried hand-typed values that
 * contradicted the flags beneath them.
 *
 * The same defect as the purchase-intent denominator, in a different column.
 */
export type FlagBasis =
  /** Of analysed comments. Profanity, toxicity, audience scrutiny. */
  | 'comments'
  /** Of analysed posts. Political content, on-camera risk. */
  | 'posts'
  /** Of sponsored posts. Competitor conflict, undisclosed placement. */
  | 'sponsored_posts';

export interface BrandSafetyFlag {
  category: string;
  severity: RiskSeverity;
  /** Share of `basis` exhibiting it, 0–1. Meaningless without the basis. */
  incidence: number;
  /**
   * How much more the flagged comments are liked than the corpus average.
   *
   * VOLUME AND ENDORSEMENT ARE DIFFERENT RISKS, and merging them is what this
   * field exists to stop. One real flag read "Authenticity scrutiny · 5.06% ·
   * medium", where 5.06% was the volume and the severity was actually driven
   * by a note saying critical comments were liked 3.3x more than praise. A
   * reader could not reconcile the number with the rating because they were
   * measuring different things.
   *
   * Volume asks how much of the section is critical. Endorsement asks whether
   * criticism is what the audience UPVOTES — a small, loudly-agreed-with
   * complaint and a large, ignored one are not the same buy, and only the
   * second number can tell them apart.
   *
   * 1.0 means the flagged comments are liked like anything else. Null means it
   * was not measured, which on a corpus without per-comment likes is common —
   * and null must not read as 1.0, because "no endorsement advantage" is a
   * finding and "we could not tell" is not.
   */
  endorsement: number | null;
  /**
   * Null on rows written before the denominator was recorded. Treated as
   * 'comments' when scoring — a stated default, not a measurement, and the
   * strictest of the three, so an unknown denominator cannot flatter a
   * creator. Same shape of assumption the classifier makes when a comment
   * carries no product, content or meta marker.
   */
  basis: FlagBasis | null;
  note: string;
}

export interface BrandSafety {
  /** Flags above `none`. What the panel counts. */
  raised: number;
  /** Categories checked, raised or not. A clean 100 means all of these came back clean. */
  checked: number;
  /** The single worst severity present, for sorting without the scalar. */
  worst: RiskSeverity | null;
  rubricVersion: string;
}

/**
 * What makes a comment a problem for a brand placing an ad beside it.
 *
 * Independent of who the comment targets, and deliberately so. A slur in a
 * comment section is an ad-adjacency problem whether it was aimed at the
 * creator, at another viewer, or at nobody — the brand's placement sits next
 * to it either way.
 *
 * Also independent of `CommentIntent`. Not every abusive comment is a brand
 * risk (a mild insult is neither), and not every brand risk is abuse (a scam
 * link is polite and disqualifying). Two axes because they answer two
 * questions.
 */
/**
 * The categories a census scan screens for, as a value rather than a type.
 *
 * `BrandRiskCategory` is erased at build time, so every runtime list of these
 * was a hand-kept copy — scripts/scan-comments.ts had one, and `checked` needed
 * another. Two copies of a closed vocabulary drift silently: a category added
 * to the union but not to the scan's array is simply never looked for, and the
 * report still says every category was screened.
 */
export const BRAND_RISK_CATEGORIES = [
  'hate',
  'sexual',
  'violence',
  'illegal',
  'spam',
  'harassment',
] as const;

export type BrandRiskCategory =
  /** Slurs and hate directed at a protected group. */
  | 'hate'
  /** Explicit sexual content or harassment. */
  | 'sexual'
  /** Threats, calls for harm, glorified violence. */
  | 'violence'
  /** Drugs, weapons, counterfeit, fraud offers. */
  | 'illegal'
  /** Scam links, engagement farming, impersonation. */
  | 'spam'
  /**
   * Degrading attacks on a person that are not protected-group slurs.
   *
   * Added because the nastiest comment in the first real scan fit nowhere: a
   * catalogue of someone's facial features as defects, closed with a saying
   * about what "a woman should never" do. Not a slur, so not `hate`. Not
   * sexual, violent, illegal or spam. It fell through every category and was
   * reported as a clean section.
   *
   * ON A PERSON, NOT ON THE CREATOR. This doc and the classifier prompt both
   * used to say "attacks on the creator", which contradicted the axis this
   * type sits on — `CommentRisk` is independent of who a comment targets,
   * because an ad is placed beside it either way. Measured on @가재맨, a
   * call-out channel where the video IS a third party being confronted: 2,384
   * comments, 180 risky, and almost every one of them aimed at that third
   * party rather than at the creator. Read literally, the old wording returned
   * a clean section. The target is irrelevant; authorship is what matters, and
   * `byCreator` records that separately.
   *
   * THE BOUNDARY, and it is the whole risk of this category: the test is
   * whether a comment is about what someone DID — their work, their conduct,
   * their argument — or about their BODY, THEIR FAMILY, OR THEIR WORTH.
   *
   *   "Her editing is heavy-handed"        → criticise. Not this.
   *   "She's overrated, unsubscribing"      → criticise. Not this.
   *   "This is more cringe than X's videos" → criticise. Not this.
   *   "He's lying, this doesn't add up"     → criticise. Not this.
   *   "He's a scammer, report him"          → criticise. Not this.
   *   "Crossed eyes, crooked mouth — is
   *    this what you call beautiful?"       → harassment.
   *   "Your mother should have known
   *    better"                              → harassment.
   *
   * The two conduct lines are the ones that decide whether a whole genre is
   * mispriced. On a call-out channel an audience concluding somebody is
   * dishonest IS the content; flagging it would report the format as unsafe
   * for the wrong reason.
   *
   * An audience is allowed to dislike someone's work as loudly as it likes.
   * This category is for degrading the person, and it must never widen to
   * cover disagreement — the number it feeds follows a creator around and
   * shapes what they are paid, so the cost of over-flagging here is borne
   * entirely by them.
   *
   * Like every other category it does NOT touch their rating unless they wrote
   * it. Harassment is by definition done to someone.
   */
  | 'harassment';

/**
 * Compile-time proof that the runtime list and the union are the same set.
 * Adding a category to one and not the other stops the build instead of
 * quietly producing a scan that never looks for it.
 */
type _BrandRiskCategoriesCoverUnion =
  (typeof BRAND_RISK_CATEGORIES)[number] extends BrandRiskCategory
    ? BrandRiskCategory extends (typeof BRAND_RISK_CATEGORIES)[number]
      ? true
      : never
    : never;
const _brandRiskCategoriesAreExhaustive: _BrandRiskCategoriesCoverUnion = true;
void _brandRiskCategoriesAreExhaustive;

export const BRAND_RISK_LABEL: Record<BrandRiskCategory, string> = {
  hate: 'Hate & slurs',
  sexual: 'Sexual content',
  violence: 'Violence & threats',
  illegal: 'Illegal goods & fraud',
  spam: 'Scams & impersonation',
  harassment: 'Personal attacks',
};

/**
 * One risk category, counted over the whole comment census.
 *
 * THE CENSUS IS WHY THIS REPLACES THE SEARCHED CORPUS AS THE RISK READ. Every
 * comment on every video is read, so "312 of 21,330" is a true statement with
 * a real denominator — no query, no selection rule, nothing to audit. The
 * off-platform search could never say that, which is why its totals were
 * demoted to a description of the search.
 *
 * `byCreator` is the field that decides what counts against whom.
 */
export interface CommentRisk {
  category: BrandRiskCategory;
  /**
   * Comments in this category, across the whole census.
   *
   * An ad-adjacency figure and a moderation workload. NOT a judgement on the
   * creator: strangers post filth under people, and a report that marks a
   * creator down for being a target is marking them down for being visible.
   */
  count: number;
  /**
   * Of those, how many the creator wrote or endorsed.
   *
   * The only part that reflects on them, and the only part that moves their
   * rating. Usually zero, and a non-zero number here is a serious finding
   * rather than a percentage point.
   */
  byCreator: number;
  /** How many have since been hidden or removed by the creator. */
  hidden: number;
  /** One quoted example, for the moderation queue. Empty when none is safe to show. */
  example: string;
}

/**
 * What the creator has already cleaned up.
 *
 * Kept so the rating cannot be gamed and the cleanup can still be credited.
 * Scoring only what survives moderation lets a creator delete their way to a
 * better number; scoring only the original punishes the ones who do the work.
 * Both figures are stored, both are shown, and the difference between them is
 * itself information a brand wants: an actively moderated section is a
 * different buy from an abandoned one.
 */
export interface ModerationState {
  /**
   * How many comments the RISK SCAN actually read.
   *
   * Its own denominator, separate from `commentsAnalyzed`, because the two
   * passes cover different things: the clustering pass may have read every
   * comment on the channel while a risk scan covered five videos. Dividing one
   * by the other produces a share of a set that was never scanned — the same
   * denominator mistake as the purchase-intent basis and the off-platform
   * totals, in a third place.
   */
  commentsScanned: number;
  /** Risky comments found before any moderation this pass observed. */
  foundTotal: number;
  /** Still visible now. */
  visibleTotal: number;
  /** Hidden, rejected, or deleted by the creator. */
  hiddenTotal: number;
  lastModeratedAt: string | null;
}


/**
 * How we know a post was a promotion.
 *
 * Not optional, and it must render. "#ad in the description" and "a model
 * thought this looked sponsored" are different claims, and a report that
 * cannot tell them apart will eventually tell a brand that their competitor
 * ran a campaign which never happened — the same class of error as presenting
 * an unsearched platform as "nothing found".
 */
export type PromotionDisclosure =
  /** The creator labelled it: #ad, a paid-promotion flag, a spoken disclosure. */
  | 'explicit'
  /** An affiliate or tracked link in the description. Commercial, not disclosed. */
  | 'affiliate'
  /** Neither. The classifier read it as a promotion. A guess, and labelled one. */
  | 'inferred';

/**
 * One past promotion: what they sold, for whom, and how it did.
 *
 * Replaced `categoryExposure`, which asserted category saturation without
 * showing the posts it counted. This shows them, and is the source of the
 * `productBearing` flag the intent measurement needs.
 */
export interface Promotion {
  postId: string;
  platform: SocialPlatform;
  title: string;
  url: string | null;
  publishedAt: string;
  /**
   * Null when a post is plainly commercial but the advertiser cannot be
   * identified. Renders as "unidentified" — never as a blank cell, which reads
   * as a data error rather than as the honest limit it is.
   */
  brand: string | null;
  product: string | null;
  category: string | null;
  disclosure: PromotionDisclosure;
  views: number | null;
  /** This post's views against the creator's organic median. Null without one. */
  sponsoredRetention: number | null;
}

/**
 * Which denominator the headline intent rate was computed over.
 *
 * 'product_comments' is the headline: of the comments attached to something
 * purchasable, how much wants to buy it. 'all_comments' is commercial density,
 * which moves with what the creator films. On the first channel measured the
 * two were 6.7% and 0.6% — a rate whose basis is unknown is worse than no
 * rate, so the basis travels with it.
 */
export type IntentBasis = 'product_comments' | 'all_comments';

/**
 * Everything that turns `purchaseIntentRate` from a number into a decision
 * input. Computed by src/lib/report/intent.ts; null on reports written before
 * migration 0013, which carry a rate and no way to say what it meant.
 */
export interface IntentMeasurement {
  /** The headline point estimate, 0–1. Mirrors `AIReport.purchaseIntentRate`. */
  rate: number | null;
  /** Wilson 95% bounds. What directory floors are asked of, not the estimate. */
  ciLow: number | null;
  ciHigh: number | null;
  basis: IntentBasis;
  /** The same computation over every classified comment. */
  commercialDensity: number | null;
  /** Comments in the basis denominator — not the whole corpus. */
  commentsScored: number;
  postsScored: number;
  /** Posts in the window that carried something purchasable. */
  productPostsAnalyzed: number;
  /** Standard deviation of the per-post rate. Null below three scored posts. */
  dispersion: number | null;
  /** The INTENT_WEIGHTS version this was computed under. */
  rubricVersion: string | null;
}

export interface RecommendedAction {
  kind: 'do' | 'avoid';
  text: string;
}


// ---------------------------------------------------------------------------
// Per-platform analysis
//
// The aggregate figures hide the thing a buyer most needs: YouTube and
// Instagram audiences behave differently enough that they are separate media
// buys, not one creator with two distribution channels.
// ---------------------------------------------------------------------------

export interface PlatformAnalysis {
  platform: SocialPlatform;
  followers: number;
  medianViews: number;
  engagementRate: number;
  /** Null when this platform has no readable comments — see `AIReport`. */
  sentimentScore: number | null;
  purchaseIntentRate: number | null;
  commentsAnalyzed: number;
  /** Sponsored ÷ organic median views on this platform. Null with no paid history. */
  sponsoredRetention: number | null;
  /** Derived the same way as the aggregate CPM. Null with no published minimum. */
  estimatedCpm: number | null;
  /**
   * What this platform's comment section mostly does. Null when no classifier
   * pass has run on it.
   *
   * Was required, which forced a creator carrying only a risk census to name a
   * dominant intent that had never been measured — the absence rule broken by a
   * type rather than by a coercion. Neither this nor `bestFormat` is rendered
   * anywhere today; both are kept because the shape mirrors the stored column.
   */
  dominantIntent: CommentCluster['intent'] | null;
  /** The format that historically performs here. Null until there is evidence. */
  bestFormat: string | null;
  /** One-line read a buyer can lift into a plan. */
  note: string;
}

// ---------------------------------------------------------------------------
// Output & engagement
//
// How much the creator publishes, and how wide their range is. Cadence sizes
// the flight; the gap between median and peak says whether a good post is a
// floor or a fluke, which is the difference between a predictable buy and a
// lottery ticket.
// ---------------------------------------------------------------------------

export interface PlatformOutput {
  platform: SocialPlatform;
  /** 'videos' on YouTube, 'posts' on Instagram — the creator's own vocabulary. */
  unit: 'videos' | 'posts';
  /** Everything published on the channel, all time. */
  totalPosts: number;
  /** Published inside the analysis window. */
  postsInWindow: number;
  windowDays: number;
  /** Posts per week across the window. */
  cadencePerWeek: number;

  avgViews: number;
  medianViews: number;
  /** Best-performing post in the window — the upside case. */
  peakViews: number;

  /**
   * Null when the source did not carry them. Public channel pages expose view
   * counts but not per-post likes, so a zero here would be the same lie as a
   * zero sentiment score: unmeasured rendered as none.
   */
  avgLikes: number | null;
  peakLikes: number | null;
  avgComments: number | null;
  engagementRate: number | null;
}

// ---------------------------------------------------------------------------
// Off-platform discussion (여론)
//
// The only third-party signal in the report. Everything else is 1st-party and
// creator-authorised; this is the wider public conversation, which a creator
// neither controls nor moderates — and which their own comment section cannot
// reveal. Typed and surfaced separately so the provenance distinction is
// impossible to lose.
//
// THIS MODEL CARRIES NO SENTIMENT, BY DESIGN.
//
// Every off-platform corpus is assembled by searching, and a search is a
// selection. Query the creator's name and the results skew to whoever had a
// reason to post about them, which is disproportionately conflict. Scoring the
// sentiment of a set chosen that way measures the query, not the opinion: the
// first real corpus we built this way returned three themes, all negative,
// summing to 100% of the sample — an impossible result for genuine discussion
// and a clean proof that the frame, not the creator, produced the number.
//
// So this model reports volume, sources and themes: how much is being said,
// where, and about what. Those survive a selected frame — a theme label and a
// mention count are still true of the set that was read. A sentiment average
// does not, and there is no threshold of mentions that rescues it. Do not add
// one back without a sampling frame that admits discussion regardless of
// stance; until then the honest read is the creator's own comment corpus,
// which is a census rather than a search.
// ---------------------------------------------------------------------------

/**
 * The platforms the off-platform pass covers.
 *
 * Fixed rather than derived from whatever the data happens to contain, so a
 * platform with nothing on it still gets a tab. "No discussion found on
 * Instagram" and "we never checked Instagram" are different claims, and only
 * the first one is honest if the tab list is built from results.
 */
export const OPINION_PLATFORMS = [
  'YouTube',
  'Reddit',
  'X',
  'Instagram',
  'TikTok',
  'Forums',
  'Press',
] as const;

/**
 * The platforms this pass can actually read, and therefore the only ones that
 * get a tab.
 *
 * `OPINION_PLATFORMS` above stays complete because rows written earlier carry
 * those source names and still have to parse. But four of them can never be
 * reported on, and rendering four tabs that will never populate is four
 * invitations to click into an explanation nobody asked for. They collapse
 * into one standing line instead — see `UNCOVERABLE_NOTE`.
 *
 * YouTube commentary comes from the comment pipeline; Press and Forums from
 * the web-search pass in scripts/opinion-press.ts.
 */
export const COVERABLE_OPINION_PLATFORMS = ['YouTube', 'Press', 'Forums'] as const;

/**
 * Said once, near the coverage, and not removable.
 *
 * The temptation on narrowing the tab list is to drop the caveat with it — the
 * panel gets cleaner and nothing visibly breaks. It would also leave a buyer
 * reading "YouTube and Press, nothing alarming" with no way to know that four
 * of the busiest surfaces on the internet are missing by law rather than by
 * accident. That is the difference between a narrow report and a misleading
 * one, and it is the same rule as `coveredPlatforms` itself: never let an
 * absence of measurement read as a measurement.
 */
/**
 * The standing caveat on every off-platform read.
 *
 * "Why is it 7? There are way more videos than that." — and the answer is that
 * 7 is what one search surfaced, not what exists. No query enumerates the
 * internet, so this panel can report what it read and how it looked, and it
 * cannot report how much is being said. Those are different claims and the
 * second one is not available at any budget.
 *
 * Migration 0011 was careful about this — it kept volume on the grounds that
 * "7,906 comments on seven videos" is a fact about THE SET THAT WAS READ. The
 * qualifier was the whole load-bearing half of that sentence, and the UI
 * dropped it, rendering a bare 7 at headline size beside "last 460d". Read
 * that way it says almost nobody discusses her, which is a conclusion nothing
 * here supports.
 *
 * Absent from this panel is not evidence of absent discussion.
 */
export const SEARCH_NOT_CENSUS_NOTE =
  'These counts describe this search, not this creator. A search returns what it surfaces — there is no way to enumerate everything published about someone, so a low number here means we found little, never that little exists. Read the themes and the evidence; do not read the totals as volume.';

export const UNCOVERABLE_NOTE =
  'Reddit, X, Instagram and TikTok are not covered. Their terms do not permit reporting what other people post, so discussion there — whatever its volume or tone — is absent from this panel by licensing, not by absence.';

export type OpinionPlatform = (typeof OPINION_PLATFORMS)[number] | 'Other';

export interface OpinionSource {
  /** Free text as the pipeline wrote it, e.g. "YouTube commentary". */
  source: string;
  /**
   * DISTINCT PIECES OF DISCUSSION: videos, articles, threads. One each.
   *
   * This field used to be called `mentions` and held 7,906 for a corpus that
   * was seven YouTube videos — every comment under them counted as a separate
   * mention. Once press merged in, "23 articles" sat in the same column as
   * "7,906", and any total over the two was just the comment section again at
   * three hundred times the weight.
   *
   * Seven videos and twenty-three articles are comparable. Seven thousand
   * comments and twenty-three articles are not, and the sufficiency gate was
   * reading the inflated figure as a deep corpus when the real basis was seven
   * pieces of content.
   */
  items: number;
  /**
   * Comments or replies WITHIN those items.
   *
   * Real, and worth showing — a video with four thousand comments is a
   * different event from one with nine. But it is audience reaction to a piece
   * of discussion, not more discussion, and it must never be added to an
   * article count. Null where the medium has no comparable figure, which is
   * most press.
   */
  reactions: number | null;
}

/** Maps a pipeline source string onto a monitored platform. */
export function toOpinionPlatform(source: string): OpinionPlatform {
  const s = source.toLowerCase();
  if (s.includes('youtube')) return 'YouTube';
  if (s.includes('reddit')) return 'Reddit';
  if (s === 'x' || s.includes('twitter')) return 'X';
  if (s.includes('instagram')) return 'Instagram';
  if (s.includes('tiktok')) return 'TikTok';
  if (s.includes('forum')) return 'Forums';
  if (s.includes('press') || s.includes('news')) return 'Press';
  return 'Other';
}

/** One off-platform post or thread, with a route back to it. No author, as above. */
export interface OpinionMention {
  id: string;
  /** e.g. "Reddit", "X". Matches an entry in `sources`. */
  source: string;
  /** Null once the 30-day verbatim horizon has passed — see `expireVerbatim`. */
  excerpt: string | null;
  url: string | null;
  publishedAt: string | null;
  /** Upvotes, likes, or whatever the platform counts. Null when unavailable. */
  engagement: number | null;
}

/**
 * One distinct piece of discussion: a video, an article, a thread.
 *
 * The inventory that `sources[].items` only counts. A source row saying
 * "YouTube · 7 · 7,906 comments" reads as seven comparable places talking
 * about a creator — but if six thousand of those comments sit under one video,
 * the off-platform read is one comment section wearing seven hats, and nothing
 * in an aggregate can tell you which it is.
 *
 * That is the same failure as a purchase-intent rate resting on one viral post,
 * which `clusterFactor` exists to widen the interval for. Here the answer is
 * simpler: list them.
 *
 * An empty array does NOT mean no discussion. It means the pass did not record
 * the pieces individually, which the panel has to say out loud — an aggregate
 * presented without its distribution is a claim about balance that nobody made.
 */
export interface OpinionItem {
  id: string;
  /** 'YouTube' | 'Press' | 'Forums' — matches an entry in `sources`. */
  source: string;
  title: string;
  /** Channel or outlet. Null when the pass could not attribute it. */
  publisher: string | null;
  url: string | null;
  publishedAt: string;
  /**
   * Comments or replies under THIS piece. Null where the medium has none we
   * collect — most press. Never 0 for "we didn't count", which would claim
   * silence under an article that may be busy.
   */
  reactions: number | null;
}

/** A recurring subject in the off-platform discussion, independent of the creator's own posts. */
export interface OpinionTheme {
  label: string;
  /**
   * How many of the read mentions carry this theme.
   *
   * A COUNT, not a proportion, and the distinction is the whole point.
   * Migration 0011 removed `netSentiment` from this model because an
   * off-platform corpus is assembled by SEARCH and a search is a selection —
   * then left the theme shares in place, which carry exactly the same bias.
   *
   * The corpus that prompted 0011 was 7,906 comments from seven YouTube
   * commentary videos found by querying a creator's name, and its three themes
   * were 52% / 31% / 17% — all critical, summing to precisely 100%. There was
   * no "people like her work" theme, because nobody uploads commentary about a
   * creator being fine. 52% was a true statement about which seven videos the
   * query returned and a false one about the public, and rendered as a
   * proportion bar it read as the second.
   *
   * "4,111 of the 7,906 comments we read" survives a selected frame. "52% of
   * the discussion" does not, and there is no denominator that rescues it,
   * because the denominator IS the selection. Contrast `CommentCluster.share`,
   * which is legitimate: the creator's own comment section is a census, so its
   * denominator really is everything.
   */
  reactionCount: number;
  /**
   * How many distinct items carry this theme, when the pass recorded it.
   *
   * The more honest of the two numbers and the harder one to get: "five of the
   * seven videos are about this" says more than "4,111 comments mention it",
   * because the 4,111 could all be under one video. Null when not recorded.
   */
  itemCount: number | null;
  /**
   * Legacy proportion over the read set. Retained so rows written before this
   * change still parse, and deliberately NOT rendered as a share of discussion.
   */
  share: number;
  /** Traceable evidence. Empty falls back to `example`. */
  mentions: OpinionMention[];
  /** Legacy single excerpt, kept so rows written before 0007 still render. */
  example: string;
}

export interface Controversy {
  summary: string;
  severity: RiskSeverity;
  occurredAt: string;
  /** Whether the discussion has since died down or been addressed. */
  resolved: boolean;
}

/**
 * Why a monitored platform carries nothing.
 *
 * Two states were not enough. "Covered, nothing found" and "not covered" were
 * distinguishable, but everything Reddit, X, Instagram and TikTok will ever
 * report falls into a third case: we are not permitted to read them at all.
 * Their terms forbid commercialising platform data, and no amount of
 * engineering changes that — so rendering them as merely "not covered" implies
 * a pass that is coming, when in fact it never is.
 */
export type PlatformCoverage = 'covered' | 'not_covered' | 'not_permitted';

/**
 * Platforms whose terms forbid what this panel does — reading what OTHER
 * people say ABOUT a creator and commercialising it.
 *
 * The scope of that sentence is the whole point, and an earlier version of
 * this comment got it wrong by generalising from this panel to the platform.
 * Reddit's Responsible Builder Policy names ads targeting and ML analysis
 * explicitly; X permits redistributing Post IDs but not content; Meta
 * prohibits processing Platform Data to build user profiles WITHOUT USER
 * CONSENT. Every one of those is about third-party content.
 *
 * NONE OF IT CLOSES THE FIRST-PARTY ROUTE. A creator's own authorised data is
 * a different question with a different answer, and on TikTok the answer is
 * yes: the Creator Marketplace API exists for exactly this use case and gives
 * approved Marketing Partners audience demographics, growth and performance
 * with the creator's authorisation. TikTok's Research API is the one that is
 * closed — explicitly non-commercial, with advertisers and commercial users
 * ineligible by name — but that is not the route this product would take.
 *
 * So a platform on this list is unavailable for OPINION and may still be
 * available for the creator's own data. Do not read this list as "we cannot
 * work with TikTok"; read it as "we cannot report what TikTok users say".
 */
export const UNLICENSED_OPINION_PLATFORMS: readonly OpinionPlatform[] = [
  'Reddit',
  'X',
  'Instagram',
  'TikTok',
];

export function platformCoverage(
  platform: OpinionPlatform,
  covered: readonly OpinionPlatform[],
): PlatformCoverage {
  if (covered.includes(platform)) return 'covered';
  if (UNLICENSED_OPINION_PLATFORMS.includes(platform)) return 'not_permitted';
  return 'not_covered';
}

export interface PublicOpinion {
  /**
   * How the corpus was assembled, when the method shapes the result.
   *
   * Not optional in practice: a search-assembled corpus MUST say so, because
   * every theme count under it is a fact about the query. The panel renders a
   * standing caveat when this is null rather than letting the silence read as
   * "assembled neutrally".
   */
  corpusNote: string | null;
  /**
   * The platforms this pass actually read.
   *
   * Without it, coverage gets inferred from results and a platform with no
   * mentions reads as "we checked, nothing there" — which is false whenever a
   * platform could not be reached. Reddit gates its API and blocks several
   * crawlers; silence from a source we never queried is not a finding.
   */
  coveredPlatforms: OpinionPlatform[];
  windowDays: number;
  /** Sum of `sources[].items` — distinct pieces of discussion read. */
  itemsAnalyzed: number;
  /**
   * The pieces themselves, when the pass recorded them.
   *
   * Empty is a gap, not a zero: `itemsAnalyzed` may say seven while this says
   * nothing, and that combination means the counts cannot be attributed. The
   * panel states it rather than rendering a tidy aggregate over it.
   */
  items: OpinionItem[];
  /** Sum of `sources[].reactions`. Null when no source carried one. */
  reactionsAnalyzed: number | null;
  /**
   * Share of the COMMENTS read that are actually about the creator, rather
   * than spam, off-topic chatter, or talk about the commentator.
   *
   * The denominator is `reactionsAnalyzed`, not `itemsAnalyzed`, and naming it
   * matters because the panel's headline unit is now pieces — "91%" sitting
   * next to "7 pieces" invites reading it as 91% of seven.
   *
   * It is also a weak signal and should not be given weight. A search for
   * commentary ABOUT someone returns videos about them, so their comment
   * sections are about them; 91% mostly says the search found the right
   * videos. It is a check on the retrieval, not a finding about the creator.
   */
  discussionShare: number;
  /**
   * How the pieces that were read were chosen out of what the search found.
   *
   * The question this model could not answer: seven videos were read, but
   * there are certainly more than seven — so who picked seven, out of how
   * many, by what rule? Nothing recorded it, which makes the count
   * unauditable: without the selection rule, "7" carries no information at
   * all, because a different rule would have produced a different 7 and
   * nothing would look any different.
   *
   * Null means the pass did not record its own selection. That is a gap to
   * state, not a detail to omit — it is the difference between a sample and
   * an anecdote.
   */
  selection: {
    /** How many candidates the search surfaced. Null when not recorded. */
    surfaced: number | null;
    /** How many of them were actually read. */
    read: number;
    /** e.g. "top 7 by comment count". Null when not recorded. */
    rule: string | null;
  } | null;
  sources: OpinionSource[];
  themes: OpinionTheme[];
  controversies: Controversy[];
  summary: string;
}

/**
 * How much of the comment corpus was readable.
 *
 * Every qualitative score is derived from comments, so when they are missing
 * the report must say "not measured" rather than render a zero. Partial
 * coverage matters too: a sample drawn from 3 of 40 posts is biased, not just
 * small.
 */
export interface CommentCoverage {
  postsAnalyzed: number;
  postsWithComments: number;
  /** Why comments are missing, when they are. Null when coverage is fine. */
  reason: 'disabled' | 'none_yet' | 'restricted' | null;
}

export interface AIReport {
  creatorId: string;
  /**
   * Null when the creator has not authorised analytics access. Demographics are
   * the one figure that genuinely requires OAuth — they cannot be derived from
   * anything public — so "not connected" has to be representable rather than
   * rendering as four empty bars.
   */
  demographics: Demographics | null;
  topCommentClusters: CommentCluster[];
  /** Null on reports produced before two-axis classification. */
  commentAxes: CommentAxes | null;
  coverage: CommentCoverage | null;
  /**
   * All four are null when there were no readable comments to derive them
   * from. Null is not a zero and not a low rating — rendering it as one tells a
   * buyer the audience is toxic and never converts, when nothing was measured.
   */
  sentimentScore: number | null;
  purchaseIntentRate: number | null;
  /**
   * Checks that raised a flag, and checks that ran.
   *
   * Replaces a 0-100 score, and is the last composite this report carried.
   * It blended a share of comments, a share of sponsored posts and the
   * creator's own conduct into one figure whose movement nobody could
   * attribute. Worse, flags are derived FROM comments, so a thin corpus raised
   * fewer of them and the score ROSE — absence of evidence rendering as safety.
   *
   * Both null when no check ran. Zero raised is a result; nothing checked is
   * not, and one number could not tell those apart.
   */
  raisedFlags: number | null;
  checkedFlags: number | null;
  engagementRate: number | null;
  /**
   * Null means there is no sponsored history to measure against — not a
   * neutral rating. Rendering null as 'moderate' or 'low' invents a
   * reassurance the data cannot support.
   */
  adFatigueLevel: AdFatigueLevel | null;
  aiSummary: string;
  /** Null until the pipeline has a cohort large enough to rank against. */
  benchmarks: Benchmarks | null;
  /** Null when the creator has published no minimum budget to derive from. */
  costEfficiency: CostEfficiency | null;
  sponsoredPerformance: SponsoredPerformance | null;
  brandSafetyFlags: BrandSafetyFlag[];
  /**
   * Brand-risk categories counted over the comment census. Empty means the
   * risk scan has not run — not that the section is clean.
   */
  commentRisks: CommentRisk[];
  /** Null until a scan has observed the section. */
  moderation: ModerationState | null;
  /** How the section is written. Null until the register pass has run. */
  commentRegister: CommentRegister | null;
  /**
   * DERIVED at read time from the axes, the risk census and the register —
   * never stored. Same reason as brand safety and purchase intent: a headline
   * kept in a column drifts from the evidence printed under it, and this one
   * is a sentence, which drifts fastest of all.
   */
  climate: AudienceClimate;
  /**
   * Derived from `brandSafetyFlags` at read time, so `raisedFlags` can never
   * disagree with the panel that lists them. `worst` null means unassessed —
   * nothing checked, or too thin a corpus to check against, which is not the
   * same as nothing raised.
   */
  brandSafety: BrandSafety;
  /** Past sponsored and product-bearing posts, newest first. Empty until synced. */
  promotions: Promotion[];
  /**
   * The interval, basis and sample behind `purchaseIntentRate`. Null on rows
   * written before 0013 — those carry a rate computed over an unknown
   * denominator, which is exactly what must not be presented as a measurement.
   */
  intent: IntentMeasurement | null;
  recommendedActions: RecommendedAction[];
  /** Empty until more than one platform is connected. */
  platformBreakdown: PlatformAnalysis[];
  /** Null until the off-platform pass has run. */
  publicOpinion: PublicOpinion | null;
  /** Empty until at least one platform has been synced. */
  outputStats: PlatformOutput[];
  modelVersion: string | null;
  commentsAnalyzed: number;
  lastAnalyzedAt: string | null;
}

// ---------------------------------------------------------------------------
// Organizations (Track B)
// ---------------------------------------------------------------------------

/** What a buyer is trying to achieve. Changes the read more than any figure. */
export const CAMPAIGN_OBJECTIVES = [
  'awareness',
  'consideration',
  'conversion',
  'launch',
  'always_on',
] as const;

export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const OBJECTIVE_LABEL: Record<CampaignObjective, string> = {
  awareness: 'Awareness',
  consideration: 'Consideration',
  conversion: 'Conversion',
  launch: 'Product launch',
  always_on: 'Always-on',
};

export interface Organization {
  id: string;
  name: string;
  billingPlan: BillingPlan;
  /**
   * Who this buyer is, in enough detail for a fit read to be about them.
   *
   * All optional, and a thin profile has to produce a thin paragraph rather
   * than an invented campaign — "written for Northbeam Media" over prose that
   * knows nothing about Northbeam Media is a personalisation a reader spots in
   * one line, and it discredits the figures beside it.
   */
  industry: string | null;
  sells: string | null;
  audience: string | null;
  categories: CampaignCategory[];
  objectives: CampaignObjective[];
  /** Server-only. Never projected into a client component. */
  stripeCustomerId?: string | null;
  createdAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
}

export interface CampaignBrief {
  id: string;
  organizationId: string;
  title: string;
  objective: string;
  briefNote: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string;
  createdAt: string;
  recipientCount?: number;
}

// ---------------------------------------------------------------------------
// Access requests (Track A)
// ---------------------------------------------------------------------------

export interface AccessRequest {
  id: string;
  creatorId: string;
  requesterName: string;
  requesterEmail: string;
  companyName: string;
  campaignObjective: string;
  proposedBudget: number | null;
  budgetCurrency: string;
  pitchNote: string | null;
  organizationId: string | null;
  status: AccessRequestStatus;
  expiresAt: string | null;
  createdAt: string;
  respondedAt: string | null;
  firstViewedAt: string | null;
  viewCount: number;
}

/** Brand-side form payload. Validated by `accessRequestInputSchema`. */
export interface AccessRequestInput {
  handle: string;
  companyName: string;
  requesterName: string;
  requesterEmail: string;
  campaignObjective: string;
  proposedBudget?: number | null;
  budgetCurrency?: string;
  pitchNote?: string | null;
}

/** The slice of an approved request shown to the token holder. */
export interface AccessGrant {
  requestId: string;
  companyName: string;
  expiresAt: string;
  viewCount: number;
}

// ---------------------------------------------------------------------------
// Offers (the end of the funnel)
// ---------------------------------------------------------------------------

export type OfferStatus = 'sent' | 'accepted' | 'declined' | 'withdrawn';

export interface Offer {
  id: string;
  creatorId: string;
  accessRequestId: string | null;
  organizationId: string | null;
  companyName: string;
  senderName: string;
  senderEmail: string;
  deliverables: string;
  amount: number;
  currency: string;
  flightStart: string | null;
  flightEnd: string | null;
  exclusivityDays: number | null;
  usageRights: string | null;
  notes: string | null;
  status: OfferStatus;
  createdAt: string;
  respondedAt: string | null;
}

/** A campaign brief as the targeted creator sees it. */
export interface InboundBrief {
  id: string;
  briefId: string;
  status: BriefStatus;
  sentAt: string;
  title: string;
  objective: string;
  briefNote: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string;
  organizationName: string | null;
}

/**
 * One organisation's standing to see a creator's OAuth-derived demographics.
 *
 * Separate from `AccessRequest`, which grants the whole report on a
 * time-limited link. This grants one block, to one organisation, indefinitely
 * and revocably — the shape YouTube's III.E.3.b asks for when Authorized Data
 * reaches anyone other than the creator.
 */
export interface DemographicsGrant {
  id: string;
  organizationId: string;
  organizationName: string | null;
  status: 'pending' | 'approved' | 'revoked';
  requestedAt: string;
  decidedAt: string | null;
  /** Reads since approval, so an approval is not a thing that vanishes. */
  viewCount: number;
  lastViewedAt: string | null;
}

/**
 * The campaign categories an agency can read a creator against.
 *
 * Fixed rather than free text, for the same reason `OPINION_PLATFORMS` is: a
 * matching feature that accepts anything cannot say what it failed to match.
 * These are the buyer's side of the fit question — what the campaign is FOR —
 * and they pair with the creator's own `niche`, which is what the creator IS.
 *
 * `politics` sits here deliberately and is handled unlike the rest. Political
 * advertising carries disclosure obligations that vary by jurisdiction and
 * platform, and a fit read that treats it as one more vertical would be
 * offering a judgement it has no business making — see CATEGORY_CAUTION.
 */
export const CAMPAIGN_CATEGORIES = [
  'beauty',
  'technology',
  'fashion',
  'food_beverage',
  'gaming',
  'finance',
  'health_fitness',
  'travel',
  'home_living',
  'education',
  'entertainment',
  'politics',
] as const;

export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<CampaignCategory, string> = {
  beauty: 'Beauty',
  technology: 'Technology',
  fashion: 'Fashion',
  food_beverage: 'Food & Drink',
  gaming: 'Gaming',
  finance: 'Finance',
  health_fitness: 'Health & Fitness',
  travel: 'Travel',
  home_living: 'Home & Living',
  education: 'Education',
  entertainment: 'Entertainment',
  politics: 'Politics & Advocacy',
};

/**
 * Categories where a fit read must not simply answer the question asked.
 *
 * Finance and health carry advertising rules that outrun anything this report
 * measures, and political advertising adds disclosure duties that differ by
 * country and platform. The summary names the obligation rather than
 * pretending audience data settles it.
 */
export const CATEGORY_CAUTION: Partial<Record<CampaignCategory, string>> = {
  politics:
    'Political and advocacy placements carry disclosure and eligibility rules that vary by country and platform, and several platforms restrict them outright. Audience fit does not settle whether this placement is permitted — check the rules for the markets you are running in.',
  finance:
    'Financial promotions are regulated in most markets and often require licensed copy review. Audience fit is not clearance.',
  health_fitness:
    'Health claims are regulated in most markets. Audience fit is not clearance for what the creative may say.',
};

// ---------------------------------------------------------------------------
// The gatekeeper's verdict
// ---------------------------------------------------------------------------

export type LockedReason =
  /** Ordinary anonymous visitor. */
  | 'no_token'
  /** Token supplied but unknown, still pending, rejected, or for another creator. */
  | 'invalid_token'
  /** The grant was real but its window has closed. */
  | 'expired'
  /** Authorised, but the pipeline hasn't produced a report yet. */
  | 'report_pending'
  /** Pro member, but this creator hasn't opted into the directory. */
  | 'not_directory_visible';

export type AccessMode =
  | { mode: 'locked'; reason: LockedReason }
  /** Track A: a valid time-limited link. */
  | { mode: 'token'; grant: AccessGrant }
  /**
   * Track B: a standing entitlement to the report — but NOT to demographics.
   *
   * Those are Authorized Data, and YouTube's Developer Policies III.E.3.b
   * allow them to be shown only to the authorizing user or agents that user
   * expressly approved. A plan subscription is not that approval, so the
   * demographics block waits on a per-organisation grant while the rest of
   * the report does not.
   */
  | {
      mode: 'pro_agency';
      organization: Pick<Organization, 'id' | 'name'>;
      demographicsGranted: boolean;
    }
  /** The creator looking at their own profile. */
  | { mode: 'owner' };

export type UnlockedMode = Exclude<AccessMode, { mode: 'locked' }>;

export type ProfileView =
  | { creator: Creator; access: Extract<AccessMode, { mode: 'locked' }> }
  | { creator: Creator; access: UnlockedMode; report: AIReport };

export function isUnlocked(
  view: ProfileView,
): view is Extract<ProfileView, { report: AIReport }> {
  return view.access.mode !== 'locked';
}

// ---------------------------------------------------------------------------
// Directory (Track B)
// ---------------------------------------------------------------------------

export interface DirectoryListing {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  niche: string | null;
  isVerified: boolean;
  minimumBudget: number | null;
  totalFollowers: number;
  /** Null for creators with no readable comments — see `AIReport`. */
  sentimentScore: number | null;
  purchaseIntentRate: number | null;
  /**
   * Wilson lower bound on `purchaseIntentRate`. What an intent floor is asked
   * of — a filter is a question about evidence, and 34% drawn from 41 comments
   * must not outrank 22% drawn from twelve thousand. Null on rows written
   * before migration 0013, which fall back to the point estimate.
   */
  purchaseIntentFloor: number | null;
  /**
   * Which denominator `purchaseIntentRate` is a share OF.
   *
   * Carried on the listing because the directory puts these in one sortable
   * column, and a product-basis 18.1% and an all-comments 28.1% are not the
   * same quantity — the second is wider by construction. Without this the
   * column ranks creators partly on which pipeline happened to run for them.
   * Null on rows that have no readable intent at all.
   */
  intentBasis: IntentBasis | null;
  /**
   * The comment-climate label, carried so the directory can show the read
   * rather than a flag count.
   *
   * `raisedFlags`/`checkedFlags` stay on the row — the report still uses them —
   * but as a COLUMN they were misleading in the one place it matters most: a
   * creator whose only pass is the risk census renders "clear", which reads as
   * a clean check, on a section with 180 findings in it. Null means nothing was
   * read, never that it was calm.
   */
  climateLabel: ClimateLabel | null;
  /**
   * Flags raised, and checks run — see `AIReport`.
   *
   * The score was worst here: a sortable column where a creator with too few
   * comments to assess outranked one who had been assessed and come out clean.
   */
  raisedFlags: number | null;
  checkedFlags: number | null;
  engagementRate: number | null;
  adFatigueLevel: AdFatigueLevel | null;
  demographics: Demographics | null;
  /** Null when the creator publishes no minimum budget. */
  estimatedCpm: number | null;
  lastAnalyzedAt: string | null;
}

export interface DirectoryFilters {
  q?: string;
  niche?: string;
  /** Floor on purchase-intent ratio, 0–1. */
  minPurchaseIntent?: number;
  /** Creators at or below this fatigue level. */
  maxAdFatigue?: AdFatigueLevel;
  /** Matches creators whose stated floor is at or below this. */
  maxMinimumBudget?: number;
  /** e.g. `{ dimension: 'ageBands', label: '25–34', minShare: 0.3 }` */
  demographic?: { dimension: keyof Demographics; label: string; minShare: number };
  /** Cost ceiling: only creators whose estimated CPM is at or below this. */
  maxCpm?: number;
  sort?: 'purchase_intent' | 'followers' | 'sentiment' | 'recent' | 'cpm';
}

/** Who is asking. Resolved once per request, in the gatekeeper. */
export interface Viewer {
  userId: string | null;
  organization: Organization | null;
  isProAgency: boolean;
  /** Set when the signed-in user owns a creator profile. */
  creatorId: string | null;
}

// ---------------------------------------------------------------------------
// Long passes
// ---------------------------------------------------------------------------

/**
 * One value per pass that cannot finish inside a request. See migration 0028.
 *
 * `classify_comments` is the risk census (what an ad would sit beside).
 * `classify_intent` is the two-axis pass (what the section is about and wants).
 * They read the same comments and measure different things, so they are two
 * jobs rather than one: either can fail, be retried, or be run alone.
 */
export type AnalysisJobKind = 'classify_comments' | 'classify_intent';

export type AnalysisJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/**
 * A unit of work the product owes a creator.
 *
 * Read by the profile page so an absent figure can say WHICH absence it is —
 * queued, running, failed, or genuinely nothing to measure. Before this, all
 * four rendered as the same silence, and the product's own copy for it ("the
 * AI pipeline runs after the creator connects their accounts") described a
 * pipeline that did not exist.
 */
export interface AnalysisJob {
  id: string;
  kind: AnalysisJobKind;
  status: AnalysisJobStatus;
  attempts: number;
  maxAttempts: number;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Present once the pass has run. Denormalised from the job, not the report. */
  commentsScanned: number | null;
  findings: number | null;
  /**
   * The worker's last error, for a log. NEVER rendered to a creator: a Postgres
   * message or an HTTP body is not a status line, and the states above already
   * say everything a person can act on.
   */
  lastError: string | null;
}
