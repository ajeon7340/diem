import { BRAND_RISK_CATEGORIES } from '@/types';
import type {
  BrandRiskCategory,
  BrandSafety,
  BrandSafetyFlag,
  CommentAxes,
  CommentRisk,
  ModerationState,
  RiskSeverity,
} from '@/types';

export type { BrandSafety };
import { THRESHOLDS } from './sufficiency';

/**
 * Brand safety, reported as flags rather than as a score.
 *
 * There was a 0-100 composite here. It blended a share of comments, a share of
 * sponsored posts and the creator's own conduct into one figure whose movement
 * nobody could attribute — and because flags are derived FROM comments, a thin
 * corpus raised fewer of them and the number ROSE. As a sortable column that
 * was worst of all: a creator with too few comments to assess outranked one who
 * had been assessed and come out clean.
 *
 * What survives is what a buyer can act on. Which categories were checked, how
 * many came back raised, the worst severity among them, and — separately,
 * because it is a different kind of fact — whether the creator wrote any of it
 * themselves.
 */

/** Bump when any weight or saturation point below changes. */
export const SAFETY_RUBRIC_VERSION = 'safety-rubric-1';

const UNSCORED: BrandSafety = {
  raised: 0,
  checked: 0,
  worst: null,
  rubricVersion: SAFETY_RUBRIC_VERSION,
};

/**
 * The most a flag's severity can be, given how widespread it is.
 *
 * Severity arrived from the pipeline as a bare label with nothing behind it,
 * and it was the one judgement in this report with no stated threshold —
 * unlike THRESHOLDS in sufficiency or INTENT_WEIGHTS, both argued in the open. It showed: one creator
 * carried "Authenticity scrutiny · medium" over a comment section that was
 * 2.93% critical and 19.4% praise, a ratio of roughly six to one in her favour.
 * Nothing in the data supported `medium`; it was a vibe, and it cost her
 * fourteen points.
 *
 * So a severity now has to be earned by incidence. A flag may come in LOWER
 * than its band — a classifier seeing something genuinely mild at scale should
 * say so — but it cannot come in higher, because the number underneath it is
 * the only evidence a reader has.
 *
 * The bands are judgement calls about comment sections, stated once:
 * under 10% critical is ordinary internet; a tenth to a quarter is a visible
 * pattern; past a quarter the section is substantially hostile. One table
 * rather than one per category, because over-fitting to the categories that
 * happen to exist today would be a worse kind of arbitrary.
 *
 * WHAT THIS DOES NOT CAP is endorsement. A rare complaint the audience loudly
 * agrees with is a real risk, and `BrandSafetyFlag.endorsement` carries it as
 * its own figure beside the severity rather than inflating a volume rating.
 */
export const SEVERITY_BANDS: { maxIncidence: number; ceiling: RiskSeverity }[] = [
  { maxIncidence: 0.1, ceiling: 'low' },
  { maxIncidence: 0.25, ceiling: 'medium' },
  { maxIncidence: 1, ceiling: 'high' },
];

const SEVERITY_RANK: Record<RiskSeverity, number> = { none: 0, low: 1, medium: 2, high: 3 };

/**
 * A severity no higher than its own evidence supports.
 *
 * Applied to `posts` and `sponsored_posts` bases too, on the same reasoning:
 * two placements out of nine in one category is a fact, and whether it is
 * `medium` should follow from the fraction rather than from how it sounds.
 */
/**
 * Flags whose incidence runs the other way.
 *
 * The cap assumes more of the thing is worse, which holds for profanity,
 * competitor conflict and every other flag here. `Disclosure rate` inverts it:
 * its incidence IS the declaration rate, so a low number is the finding, and
 * capping by it rated a 0.3% declaration rate across a 43% brand-tagged
 * catalogue as `low` — the ceiling rewarding exactly the absence that raised
 * the flag. Listed by name rather than by a field, because this is the only
 * such flag and a general mechanism would invite more of them.
 */
const INVERTED_INCIDENCE = new Set(['Disclosure rate']);

export function cappedSeverity(flag: BrandSafetyFlag): RiskSeverity {
  if (flag.severity === 'none') return 'none';
  if (INVERTED_INCIDENCE.has(flag.category)) return flag.severity;
  const incidence = Number.isFinite(flag.incidence) ? Math.max(0, flag.incidence) : 0;
  const band = SEVERITY_BANDS.find((b) => incidence <= b.maxIncidence) ?? SEVERITY_BANDS[2];
  return SEVERITY_RANK[flag.severity] <= SEVERITY_RANK[band.ceiling] ? flag.severity : band.ceiling;
}

const SEVERITY_ORDER: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2, none: 3 };

/**
 * The score, or null.
 *
 * Two ways to get null, and they are different facts:
 *
 *   - NOTHING WAS CHECKED. An empty flag array is not a clean result. Same
 *     rule as `coveredPlatforms`: silence from a check that never ran must
 *     not render as a finding.
 *   - THE CORPUS CANNOT SUPPORT IT. Most flags are read from comments, so a
 *     thin corpus raises fewer of them and the score goes UP — absence of
 *     evidence rendering as safety, which is the perverse direction. Below the
 *     sufficiency floor the answer is "unassessed", not a flattering number.
 *
 * A clean 100 is a real claim and is allowed to be made: it means every
 * category in `checked` came back clean, and the panel lists them.
 */
export function deriveBrandSafety(
  flags: BrandSafetyFlag[],
  commentsAnalyzed: number,
  /**
   * Only `byCreator` from this reaches the score. Everything else the scan
   * found is reported elsewhere as adjacency and moderation load — see
   * `censusRisk` for why being a target must not cost a creator points.
   */
  risk: CensusRisk | null = null,
): BrandSafety {
  // A census scan is a check that ran, and saying otherwise is the absence
  // rule broken in the direction nobody was watching.
  //
  // Found on real data (@가재맨, 2,384 comments across 5 videos): the scan
  // returned 180 risky comments — 111 harassment, 25 violence, 21 hate, 20
  // sexual, 2 illegal — and because the row carried no `brandSafetyFlags`,
  // this returned UNSCORED and the tile printed "Not assessed — no comments"
  // above a panel listing all 180. Two statements about one creator on one
  // page, one of them false twice over: comments exist, and they were read.
  //
  // The load-bearing rule is untouched. None of those 180 raise anything and
  // none of them move `worst` — only `byCreator` does. What changes is that
  // the report can now say "we looked" without claiming the creator did
  // something, which is exactly the distinction the census was built to make.
  const scanned = risk !== null && risk.scanned > 0;
  if (flags.length === 0) {
    if (!scanned) return UNSCORED;
    return {
      raised: 0,
      // The screen ran over every category the scan classifies. Reporting the
      // count of categories FOUND instead would make a clean section look
      // unchecked and a filthy one look thorough.
      checked: BRAND_RISK_CATEGORIES.length,
      worst: risk.byCreator > 0 ? 'high' : 'none',
      rubricVersion: SAFETY_RUBRIC_VERSION,
    };
  }
  if (commentsAnalyzed < THRESHOLDS.COMMENTS.limited) {
    return { ...UNSCORED, checked: flags.length };
  }

  // Same rule as the census: one occurrence is not a pattern.
  //
  // Flags carry a SHARE rather than a count, so the count is recovered from the
  // denominator where there is one — which for now means the comments basis
  // only. A `posts` or `sponsored_posts` flag cannot be checked this way
  // because deriveBrandSafety is not given those totals, so those are taken at
  // face value. Stated rather than silently half-applied: two sponsored posts
  // out of nine is a real exclusivity finding anyway, and the case this rule
  // exists for is the long tail of comment sections.
  const isSingleton = (flag: BrandSafetyFlag): boolean => {
    if (flag.basis !== 'comments' || commentsAnalyzed <= 0) return false;
    return Math.round(flag.incidence * commentsAnalyzed) <= 1;
  };

  const raisedFlags = flags.filter((flag) => {
    const severity = cappedSeverity(flag);
    if (severity === 'none') return false;
    // A lone occurrence still shows in the panel; it just is not a finding.
    return severity === 'high' || !isSingleton(flag);
  });
  const flagWorst = [...raisedFlags]
    .map(cappedSeverity)
    .sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b])[0];

  // What the creator wrote themselves used to cost points on a scale nobody
  // could read. It is a severity instead: `high`, plainly, because "they
  // posted a slur" is not a quantity and pretending it was is what made the
  // old figure unattributable.
  const worst: RiskSeverity =
    risk && risk.byCreator > 0
      ? 'high'
      : raisedFlags.length === 0 && flags.length > 0
        ? 'none'
        : flagWorst;

  return {
    raised: raisedFlags.length,
    checked: flags.length,
    worst,
    rubricVersion: SAFETY_RUBRIC_VERSION,
  };
}


/**
 * How critical the audience is overall, against how appreciative.
 *
 * The named flags answer "what specifically is wrong"; nothing answered "how
 * negative is this comment section at all", and a buyer had to go back to the
 * Audience chart and read one bar to find out. On one creator that omission
 * carried a whole rating: a flag read `medium` while the section it described
 * was 3.4% critical against 19.4% praise — six to one in her favour, a fact
 * visible nowhere near the risk panel.
 *
 * THE DENOMINATOR IS WHY THIS ONE IS ALLOWED TO BE A SHARE.
 *
 * A creator's own comment section is a CENSUS — every comment on their videos,
 * not a sample of them — so "3.4% of comments" is a true statement about the
 * whole. The off-platform corpus next door is the opposite: assembled by
 * search, no denominator, which is why its themes carry counts and the old
 * "52% of the discussion" was deleted. Same report, same word, opposite
 * epistemics, and the difference is entirely in how the set was assembled.
 *
 * Deliberately NOT scored. The named flags already price the risk, and adding
 * a general criticism penalty on top would charge the authenticity flag twice.
 * This is the context that makes those flags readable, not another one.
 */
export interface AudienceTone {
  criticiseShare: number;
  praiseShare: number;
  /** Praise per unit of criticism. Null when nobody is critical — not Infinity. */
  praiseRatio: number | null;
  total: number;
}

export function audienceTone(axes: CommentAxes | null): AudienceTone | null {
  if (!axes || axes.total <= 0) return null;
  const count = (key: string) => axes.intent.find((i) => i.key === key)?.count ?? 0;
  const criticise = count('criticise');
  const praise = count('praise');
  return {
    criticiseShare: criticise / axes.total,
    praiseShare: praise / axes.total,
    praiseRatio: criticise > 0 ? praise / criticise : null,
    total: axes.total,
  };
}


/**
 * What the comment census found, split by who it reflects on.
 *
 * THE RULE THIS ENCODES: a creator is not marked down for being a target.
 *
 * Strangers post slurs under people, and the more visible the creator the more
 * of it arrives. Scoring a creator on what was done TO them rewards obscurity
 * and punishes reach — and it is the same mistake as rendering a
 * comments-disabled channel as 0/100, which this codebase already refuses to
 * make. What a creator is answerable for is what they said and what they
 * endorsed, which is `byCreator`.
 *
 * The rest is still reported, because a brand genuinely needs it — their ad
 * sits next to those comments whoever wrote them. It just lands as an
 * ADJACENCY AND MODERATION figure rather than as a character rating, in its
 * own place, addressed to the buyer's placement decision instead of to the
 * creator's worth.
 */
/**
 * Categories where a single occurrence is already a finding.
 *
 * One of anything else is not a pattern. In a 797-comment section one spam
 * post is the internet, one blunt insult is a Tuesday, and counting either as
 * "raised" turns a clean channel into a flagged one on evidence nobody would
 * act on — which is the same error as the old composite, arriving from the
 * other direction.
 *
 * These three are different, and not because they are statistically more
 * common. They are asymmetric: a screenshot of a brand's ad beside a slur, a
 * threat, or a fraud offer is a story at any base rate, and a buyer would want
 * to know about the one. Volume changes how bad the others are; for these it
 * only changes how often.
 */
export const MATERIAL_AT_ONE: readonly BrandRiskCategory[] = ['hate', 'violence', 'illegal'];

/**
 * Does this category clear the bar to count as raised?
 *
 * The threshold is deliberately the smallest one that means anything — more
 * than one. It is not a confidence interval and does not pretend to be; it
 * says only that a single instance is not a pattern, which is true and is all
 * that is being claimed.
 */
export function isMaterial(risk: CommentRisk): boolean {
  if (risk.count === 0) return false;
  // What the creator wrote is material at one whatever the category. A slur
  // they posted is not noise at any volume.
  if (risk.byCreator > 0) return true;
  return risk.count > 1 || MATERIAL_AT_ONE.includes(risk.category);
}

export interface CensusRisk {
  /** Risky comments anywhere in the section. An ad-adjacency and workload figure. */
  adjacent: number;
  /** Of those, still visible. What a placement would actually sit beside today. */
  visible: number;
  /** Already cleaned up. Credited rather than ignored — see ModerationState. */
  hidden: number;
  /**
   * Written or endorsed by the creator. The only part that touches their
   * rating, and non-zero here is a finding rather than a percentage point.
   */
  byCreator: number;
  /** Comments the risk scan read — the denominator `adjacentShare` uses. */
  scanned: number;
  /** Share of what was scanned that is risky, 0–1. A census, so a share is honest. */
  adjacentShare: number | null;
  /** Every category found. Singletons included — they are reported, not raised. */
  categories: CommentRisk[];
  /**
   * The categories that actually count as findings.
   *
   * Separate from `categories` on purpose: a lone spam comment is still worth
   * showing a creator in their moderation queue, and still worth nothing as a
   * signal to a buyer. Dropping it from the report entirely would hide a real
   * comment; counting it as raised would invent a pattern.
   */
  raisedCategories: CommentRisk[];
}

export function censusRisk(
  risks: CommentRisk[],
  moderation: ModerationState | null,
  /**
   * Fallback denominator for rows written before the scan recorded its own.
   * `moderation.commentsScanned` wins whenever it is present: the risk scan and
   * the clustering pass can cover different sets, and dividing one pass's
   * findings by another's corpus is a share of something nobody scanned.
   */
  commentsAnalyzed: number,
): CensusRisk | null {
  // Empty is "not scanned", never "clean" — the coveredPlatforms rule again.
  if (risks.length === 0) return null;

  const adjacent = risks.reduce((sum, r) => sum + r.count, 0);
  const hidden = moderation?.hiddenTotal ?? risks.reduce((sum, r) => sum + r.hidden, 0);
  const byCreator = risks.reduce((sum, r) => sum + r.byCreator, 0);

  return {
    adjacent,
    visible: moderation?.visibleTotal ?? Math.max(0, adjacent - hidden),
    hidden,
    byCreator,
    scanned: moderation?.commentsScanned || commentsAnalyzed || 0,
    adjacentShare:
      (moderation?.commentsScanned || commentsAnalyzed) > 0
        ? adjacent / (moderation?.commentsScanned || commentsAnalyzed)
        : null,
    categories: [...risks].sort((a, b) => b.count - a.count),
    raisedCategories: [...risks].filter(isMaterial).sort((a, b) => b.count - a.count),
  };
}

