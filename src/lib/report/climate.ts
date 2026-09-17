import type {
  AudienceClimate,
  ClimateLabel,
  ClimateTrait,
  CommentAxes,
  CommentRegister,
  CommentRisk,
} from '@/types';
import type { CensusRisk } from './safety';
import { audienceTone } from './safety';
import { THRESHOLDS } from './sufficiency';

/**
 * What it is LIKE in this comment section.
 *
 * This replaces a row of risk categories as the headline. The categories were
 * correct and stay underneath as the evidence, but they answered the wrong
 * question first: a buyer opening a report does not start from "how many hate
 * comments" — they start from "what kind of room am I putting an ad in", and a
 * list of counts made them assemble that themselves, badly. Six numbers do not
 * add up to an impression, and every reader assembled a different one.
 *
 * THREE RULES CARRY THIS FILE.
 *
 * 1. IT IS NOT A RATING. `hostile` is not a worse creator than `warm`; it is a
 *    different buy. A combative section is where some categories convert and
 *    where most should not go, and saying which is the whole job. The moment
 *    this becomes a ladder it becomes the composite score again, which was
 *    removed for exactly this reason.
 *
 * 2. IT IS NOT ABOUT THE CREATOR. Every figure here describes what strangers
 *    wrote. The creator is answerable for `byCreator` and nothing else — the
 *    same rule the census encodes, restated because a one-word atmosphere
 *    label is far easier to read as a character judgement than a table of
 *    counts was.
 *
 * 3. IT IS NOT AN INFERENCE ABOUT WHO IS WATCHING. The obvious fourth
 *    dimension is "this audience skews older", and it is forbidden twice over:
 *    III.E.4.h(ii) bars using derived metrics to profile on protected
 *    attributes, naming age, and it would be a guess stacked on a guess. What
 *    can be said honestly is how the comments are WRITTEN, which is a property
 *    of the text — see `CommentRegister`.
 */

/** Bump when any band or trait threshold below changes. */
export const CLIMATE_RUBRIC_VERSION = 'climate-rubric-1';

/**
 * Categories that describe the SOCIAL temperature of a room.
 *
 * `spam` and `illegal` are deliberately absent, and leaving them in was the
 * first thing that made this read wrong. @jooshica's section is 3.89% flagged
 * — which sounds combative until you see that 22 of her 31 findings are
 * engagement bots posting emoji chains. Bots are a moderation workload, not an
 * atmosphere; counting them made a section that runs 19.4% praise against 3.4%
 * criticism read as hostile. Interpersonal hostility is what a reader means by
 * a rough room, so it is what the label is computed from.
 */
export const HOSTILE_CATEGORIES = ['hate', 'sexual', 'violence', 'harassment'] as const;

/**
 * The bands, stated once and in the open.
 *
 * Severity used to arrive from the pipeline as a bare label with nothing
 * behind it, and it cost one creator fourteen points on a vibe. The same
 * mistake is available here and would be worse, because a word like "hostile"
 * carries further than a number. So the label is a function of a share with a
 * printed threshold, and a reader who disagrees with where the lines fall can
 * see the line and argue with it.
 *
 * Judgement calls about comment sections, not laws:
 *   under 1.5% interpersonal hostility is ordinary internet — every section of
 *     any size has some;
 *   to 5% is a visible pattern a buyer would notice while scrolling;
 *   past 5% the hostility IS the room.
 * `warm` is not a lower band but an additional claim: appreciative enough that
 * praise clearly outweighs criticism, which is a fact about the other axis.
 */
export const CLIMATE_BANDS: { maxHostileShare: number; label: ClimateLabel }[] = [
  { maxHostileShare: 0.015, label: 'ordinary' },
  { maxHostileShare: 0.05, label: 'rough' },
  { maxHostileShare: 1, label: 'hostile' },
];

/** Praise must outweigh criticism by this much for `ordinary` to become `warm`. */
export const WARM_PRAISE_RATIO = 3;

/**
 * Both sides loud at once.
 *
 * A section can be 20% praise and 8% criticism and be neither warm nor
 * hostile — it is an audience that SPLITS, and that is the risk a launch buyer
 * asks about by name. Averages hide it completely: the same praise-to-
 * criticism ratio describes a room that agrees mildly and a room that is
 * having a fight.
 */
export const POLARISED = { minCriticiseShare: 0.06, minPraiseShare: 0.12 } as const;

/** Above this share of polite/complete writing, the section reads formal. */
const FORMAL_SHARE = 0.35;
/** Above this share of internet shorthand, it reads casual. */
const CASUAL_SHARE = 0.4;

function pct(share: number, digits = 1): string {
  return `${(share * 100).toFixed(digits)}%`;
}

function count(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Interpersonal hostility as a share of what the RISK SCAN read.
 *
 * `risk.scanned` and `axes.total` are different denominators and mixing them
 * is the defect this codebase has now found six times. The scan may cover five
 * videos while the clustering pass covered fifty; dividing one pass's findings
 * by another pass's corpus is a share of something nobody measured.
 */
export function hostileShare(risk: CensusRisk | null): number | null {
  if (!risk || risk.scanned <= 0) return null;
  const hostile = risk.categories
    .filter((c: CommentRisk) => (HOSTILE_CATEGORIES as readonly string[]).includes(c.category))
    .reduce((sum, c) => sum + c.count, 0);
  return hostile / risk.scanned;
}

const UNREAD: AudienceClimate = {
  label: null,
  traits: [],
  summary: 'Not enough of the comment section has been read to describe it.',
  basis: {
    hostileShare: null,
    scanned: null,
    criticiseShare: null,
    praiseShare: null,
    praiseRatio: null,
    classified: null,
  },
  rubricVersion: CLIMATE_RUBRIC_VERSION,
};

/**
 * The climate, or an explicit "not read".
 *
 * Null label rather than `ordinary`, and the distinction is the usual one: a
 * section nobody screened is not a calm section. Defaulting to the middle
 * would make every unscanned creator read as pleasantly unremarkable, which is
 * the flattering-absence bug that the brand safety score was deleted over.
 */
export function audienceClimate(
  axes: CommentAxes | null,
  risk: CensusRisk | null,
  register: CommentRegister | null = null,
): AudienceClimate {
  const tone = audienceTone(axes);
  const hostile = hostileShare(risk);

  // The label needs the risk scan; the traits and the sentence can be enriched
  // by the axes. Without a scan there is no temperature to report, however
  // much clustering was done — criticism is not hostility.
  if (hostile === null || !risk) return UNREAD;
  if (risk.scanned < THRESHOLDS.COMMENTS.limited) {
    return {
      ...UNREAD,
      summary: `Only ${count(risk.scanned)} comments have been read — too few to describe the section.`,
      basis: { ...UNREAD.basis, hostileShare: hostile, scanned: risk.scanned },
    };
  }

  const band = CLIMATE_BANDS.find((b) => hostile <= b.maxHostileShare) ?? CLIMATE_BANDS[2];
  const warm =
    band.label === 'ordinary' && tone !== null && (tone.praiseRatio ?? 0) >= WARM_PRAISE_RATIO;
  const label: ClimateLabel = warm ? 'warm' : band.label;

  const traits: ClimateTrait[] = [];
  if (
    tone !== null &&
    tone.criticiseShare >= POLARISED.minCriticiseShare &&
    tone.praiseShare >= POLARISED.minPraiseShare
  ) {
    traits.push('polarised');
  }
  // Formal and casual are not opposites of one another — a section can be
  // neither — so they are tested independently and both can be absent.
  if (register && register.scanned > 0) {
    if (register.formalShare >= FORMAL_SHARE) traits.push('formal');
    if (register.slangShare >= CASUAL_SHARE) traits.push('casual');
  }

  return {
    label,
    traits,
    summary: climateSummary(label, traits, hostile, risk, tone),
    basis: {
      hostileShare: hostile,
      scanned: risk.scanned,
      criticiseShare: tone?.criticiseShare ?? null,
      praiseShare: tone?.praiseShare ?? null,
      praiseRatio: tone?.praiseRatio ?? null,
      classified: tone?.total ?? null,
    },
    rubricVersion: CLIMATE_RUBRIC_VERSION,
  };
}

const OPENING: Record<ClimateLabel, string> = {
  warm: 'Appreciative and low-conflict',
  ordinary: 'Ordinary and low-conflict',
  rough: 'Blunt and combative in places',
  hostile: 'Combative — the hostility is the room, not an edge case',
};

/**
 * The sentence, built from the figures rather than written by a model.
 *
 * The fit read is where argued prose belongs, and it is verified claim by
 * claim at render precisely because a model wrote it. This one is a template
 * over measured numbers: it cannot invent a figure, it renders with no API
 * key, and two readers of the same report get the same sentence — which for a
 * line that is going to be quoted into a pitch deck matters more than style.
 */
function climateSummary(
  label: ClimateLabel,
  traits: ClimateTrait[],
  hostile: number,
  risk: CensusRisk,
  tone: ReturnType<typeof audienceTone>,
): string {
  const parts: string[] = [];
  parts.push(
    `${OPENING[label]}: ${pct(hostile)} of the ${count(risk.scanned)} comments read carry an insult, a slur, a threat or something sexual.`,
  );

  if (tone) {
    const ratio =
      tone.praiseRatio === null
        ? 'with nothing critical at all'
        : `about ${tone.praiseRatio >= 10 ? Math.round(tone.praiseRatio) : tone.praiseRatio.toFixed(1)}:1`;
    parts.push(
      `Across ${count(tone.total)} classified comments it runs ${pct(tone.praiseShare)} appreciative against ${pct(tone.criticiseShare)} critical, ${ratio}.`,
    );
  }

  if (traits.includes('polarised')) {
    parts.push('Both sides are loud, so this is an audience that splits rather than agrees.');
  }
  if (traits.includes('formal')) {
    parts.push('It is written formally, in complete sentences more often than not.');
  }
  if (traits.includes('casual')) {
    parts.push('It is written in fast internet shorthand.');
  }

  // Said every time, not only when the number is bad. The label is one word
  // and one word is what gets remembered; without this it is remembered as a
  // verdict on the creator.
  parts.push(
    risk.byCreator === 0
      ? 'None of it was written by the creator. It describes the audience and what an ad would sit beside, not the creator.'
      : `${count(risk.byCreator)} of it was written by the creator, which is the only part that reflects on them.`,
  );

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// The register pass
//
// Cheap text statistics over the same comments the risk scan already fetched.
// No model call: these are shapes, not meanings, and a shape is exactly what a
// regex is good for. Running it here rather than asking the classifier also
// keeps it honest — a model asked "does this audience sound older" would
// happily answer, and that answer is the one thing this file may not produce.
// ---------------------------------------------------------------------------

/**
 * Korean polite endings and Latin complete-sentence shape.
 *
 * Korean carries formality in the verb ending, which is why this is worth
 * measuring at all: 존댓말 versus 반말 is a real, visible property of a comment
 * section and it has no English equivalent short of punctuation. Both are
 * tested because a section can be mixed, and most are.
 */
/**
 * Trailing 요 is the general 해요체 marker, and listing endings one at a time
 * missed most of them: 어요 / 아요 / 워요 / 려요 are all polite and none of them
 * were in the first version of this list, so a section was measured at 4.3%
 * formal when the honest figure is higher. One rule instead of a vocabulary,
 * for the same reason the keyword lens is a recall tool and not a classifier.
 */
const KO_FORMAL = /요\s*[.!?~ㅎㅋ]*\s*$/u;
const KO_FORMAL_ANYWHERE = /(?:습니다|입니다|세요|십시오|드립니다|합니다)/u;
/** A capitalised opener, a terminal mark, and enough length to be a sentence. */
const EN_FORMAL = /^[A-Z][^]*[.!?]$/u;

/**
 * Internet shorthand. Korean consonant-only forms carry most of it — ㅋㅋ, ㅇㅇ,
 * ㄹㅇ, ㅈㄴ — and they are jamo, a block Latin slang never touches, so a single
 * range does the work of a word list.
 */
const KO_JAMO_RUN = /[ㄱ-ㆎ]{2,}/u;
const EN_SLANG = /\b(?:lol|lmao|lmfao|omg|idk|tbh|ngl|fr|imo|af|wtf|bruh|deadass)\b/iu;
const STRETCH = /(.)\1{3,}/u;
const EMOJI = /\p{Extended_Pictographic}/u;

/**
 * Measure how a set of comments is written.
 *
 * `scanned` is its own denominator and is returned alongside the shares, so a
 * reader can never divide these by the clustering corpus by mistake — the
 * mistake this repo has now made six times in six different places.
 */
export function measureRegister(texts: string[]): CommentRegister | null {
  const usable = texts.map((t) => t.trim()).filter((t) => t.length > 0);
  if (usable.length === 0) return null;

  let formal = 0;
  let slang = 0;
  let emoji = 0;
  const lengths: number[] = [];

  for (const text of usable) {
    lengths.push(text.length);
    if (KO_FORMAL.test(text) || KO_FORMAL_ANYWHERE.test(text) || EN_FORMAL.test(text)) formal += 1;
    if (KO_JAMO_RUN.test(text) || EN_SLANG.test(text) || STRETCH.test(text)) slang += 1;
    if (EMOJI.test(text)) emoji += 1;
  }

  lengths.sort((a, b) => a - b);
  const mid = Math.floor(lengths.length / 2);
  // Median, not mean. One 4,000-character essay in a section of one-word
  // reactions moves a mean enough to describe the wrong room.
  const medianLength =
    lengths.length % 2 === 0 ? (lengths[mid - 1] + lengths[mid]) / 2 : lengths[mid];

  return {
    scanned: usable.length,
    formalShare: formal / usable.length,
    slangShare: slang / usable.length,
    emojiShare: emoji / usable.length,
    medianLength,
  };
}
