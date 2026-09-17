import type { BrandSafetyFlag } from '@/types';

/**
 * Disclosure rate — what can honestly be measured about sponsorship.
 *
 * THE CLAIM THIS DOES NOT MAKE.
 *
 * No API reports whether money changed hands, so undisclosed sponsorship is not
 * detectable, by us or by anyone. What is detectable is the gap between how
 * often a creator's posts carry a commercial surface and how often they carry a
 * declaration. That is a weaker claim and it is labelled as one: a false
 * accusation of hidden advertising is defamation-shaped, not a rounding error.
 *
 * WHAT WAS TRIED AND DISCARDED.
 *
 *   - Keyword risk classes. Tested on 21,330 real comments: "severe offensive"
 *     matched three, all three false positives (affection, a joke, an idiom).
 *     Slur matching where terms are reclaimed has near-zero precision.
 *   - Description mining — affiliate links, promo codes, #ad. The obvious
 *     method, and dead on arrival for Shorts creators: median description
 *     length on the channel measured was ZERO characters. Every published
 *     technique built on descriptions would have returned a clean result by
 *     finding nothing to read.
 *   - Pinned-comment links. Zero owner comments across six videos.
 *   - Classifying @mentions as brand vs person. Beauty brands have SMALLER
 *     YouTube channels than the creators they hire — @skims at 59.5K against
 *     @justjully at 578K — and differ on one weak field. Any classifier here
 *     misfires in the direction that accuses someone.
 *
 * WHAT SURVIVED: counting. A mention does not have to be classified to be
 * counted, and a brand named twenty-one times across six months is a
 * relationship whether or not a classifier could have told you it was a brand.
 *
 * AND THE READING IS NOT "THEY ARE HIDING ADS". On a beauty channel, naming the
 * products used IS the content. The finding is that a declaration rate near
 * zero across a catalogue that is 43% brand-tagged carries no information — it
 * cannot separate paid from organic, so a buyer cannot verify disclosure
 * practice from public data and has to ask. That is the useful thing to say.
 */

export interface RepeatBrand {
  handle: string;
  posts: number;
  firstAt: string;
  lastAt: string;
}

export interface DisclosureInput {
  /** Posts the check covered. */
  postsChecked: number;
  /** Posts naming an outside account. The creator's own handles must already be excluded. */
  postsTaggingOthers: number;
  /** Posts carrying YouTube's paid-placement declaration. */
  declaredPlacements: number;
  /** Accounts named repeatedly — evidence, and the strongest signal available. */
  repeatBrands: RepeatBrand[];
  /** Comments alleging a hidden ad. Corroboration only; never the basis. */
  suspicions: number;
  commentsScanned: number;
}

export interface Disclosure {
  flag: BrandSafetyFlag;
  /** Ranked, for the panel to show as checkable evidence. */
  repeatBrands: RepeatBrand[];
  taggingRate: number;
  declaredRate: number;
}

/** Below this the catalogue is too small for either rate to mean anything. */
const MIN_POSTS = 20;

/**
 * The schema caps a flag note at 240 characters, and the first draft of the
 * gap note ran to 391. It did not error — `brandSafetyFlagsSchema` caught the
 * failure and returned an empty array, so every flag on the report vanished
 * and the panel rendered "Not assessed, no comments". A false clean result,
 * produced by prose being too long. The cap is now enforced at both ends.
 */
export const NOTE_MAX = 240;

/** A catalogue tagging less often than this has little commercial surface. */
const LOW_SURFACE = 0.1;

/** Named at least this often before a mention counts as a relationship. */
export const REPEAT_FLOOR = 3;

export function assessDisclosure(input: DisclosureInput): Disclosure | null {
  const {
    postsChecked,
    postsTaggingOthers,
    declaredPlacements,
    repeatBrands,
    suspicions,
    commentsScanned,
  } = input;

  // Nothing checked is absent, never clean.
  if (postsChecked < MIN_POSTS) return null;

  const taggingRate = postsTaggingOthers / postsChecked;
  const declaredRate = declaredPlacements / postsChecked;
  const ranked = [...repeatBrands]
    .filter((b) => b.posts >= REPEAT_FLOOR)
    .sort((a, b) => b.posts - a.posts);

  const base = {
    category: 'Disclosure rate',
    basis: 'posts' as const,
    endorsement: null,
    incidence: declaredRate,
  };

  // Little commercial surface to disclose. A low declaration rate here is
  // consistent with simply not being paid, which is the common case.
  if (taggingRate < LOW_SURFACE) {
    return {
      taggingRate,
      declaredRate,
      repeatBrands: ranked,
      flag: {
        ...base,
        severity: 'none',
        note: `${pct(taggingRate)} of ${postsChecked} posts name an outside account, and ${declaredPlacements} declare a paid placement. Little to disclose either way.`,
      },
    };
  }

  // The declaration tracks the commercial surface. Whatever the true paid rate
  // is, this creator's declarations carry information.
  if (declaredRate >= taggingRate * 0.25) {
    return {
      taggingRate,
      declaredRate,
      repeatBrands: ranked,
      flag: {
        ...base,
        severity: 'low',
        note: `${declaredPlacements} of ${postsChecked} posts declare a paid placement against ${pct(taggingRate)} that name a brand — declarations here track the commercial content.`,
      },
    };
  }

  // The gap. Stated as an inability to verify, not as an allegation.
  const corroborated = suspicions >= 3 && commentsScanned > 0;
  return {
    taggingRate,
    declaredRate,
    repeatBrands: ranked,
    flag: {
      ...base,
      severity: corroborated ? 'medium' : 'low',
      note: clamp(
        `${pct(taggingRate)} of ${postsChecked} posts name a brand; ${declaredPlacements} ` +
          `${declaredPlacements === 1 ? 'declares' : 'declare'} a paid placement.` +
          (ranked.length
            ? ` ${ranked.length} account${ranked.length === 1 ? '' : 's'} recur ${REPEAT_FLOOR}+ times, ${ranked[0].handle} on ${ranked[0].posts}.`
            : '') +
          ' Naming products is the content here, so declarations cannot separate paid from organic.' +
          // The corroboration is what lifts this to `medium`, so it must never
          // be the clause that gets clamped away — the rating would then stand
          // on a sentence the reader cannot see.
          (corroborated ? ` ${suspicions} comments already ask.` : ' Ask before contracting.'),
      ),
    },
  };
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/**
 * Truncate at a sentence rather than mid-word.
 *
 * A note that overruns is a bug in the sentence, not in the data, and the
 * caller should never lose the whole flag over it.
 */
function clamp(note: string): string {
  if (note.length <= NOTE_MAX) return note;
  const cut = note.slice(0, NOTE_MAX);
  const stop = cut.lastIndexOf('. ');
  return stop > 80 ? cut.slice(0, stop + 1) : `${cut.slice(0, NOTE_MAX - 1)}…`;
}
