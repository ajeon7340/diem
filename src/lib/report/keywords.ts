import type { BrandRiskCategory } from '@/types';

/**
 * A deterministic first pass over comment text.
 *
 * WHAT THIS IS: a recall tool. It finds comments worth a second look, cheaply,
 * reproducibly, and with a reason you can print. Running 21,330 comments
 * through a model costs 142 requests; running them through this costs nothing
 * and hands the model the few hundred that matter.
 *
 * WHAT THIS IS NOT: a classifier. A keyword match is a candidate and never a
 * finding. Every mistake this file can make is the same mistake — a word
 * appearing in text that means something else — and the whole reason the
 * product survived its own brand-safety rewrite is that criticism of a creator
 * is not a risk to a brand. "This is fucking incredible" and "your editing is
 * terrible" would both match here, and neither is a finding. The model decides;
 * this only decides what the model reads.
 *
 * So `scanKeywords` returns MATCHES, with the term that matched, and nothing
 * calls them flags.
 */

export const KEYWORD_LEXICON_VERSION = 'lexicon-1';

/** What a match suggests looking for. Never what the comment IS. */
export type MatchKind = BrandRiskCategory | 'quality';

export interface KeywordMatch {
  kind: MatchKind;
  /** The term as it appears in the lexicon, for printing a reason. */
  term: string;
}

/**
 * Terms that are worth a second look, grouped by what they hint at.
 *
 * TWO THINGS DELIBERATELY ABSENT.
 *
 * There is no slur list here. Committing one is a maintenance liability and a
 * thing nobody should have to read in a diff, and a good one is regional,
 * contested and constantly moving. `loadExternalTerms` is where a maintained
 * list plugs in; without it the `hate` lens covers structure (targeted "go back
 * to", "all of you people") and leaves vocabulary to the model, which is the
 * half a keyword list is worst at anyway.
 *
 * There is no attempt at exhaustiveness. A lexicon that pretends to be complete
 * invites treating what it misses as absent, and what it misses is most of the
 * interesting cases: coded language, sarcasm, script-mixing, and every term
 * invented after this file was written.
 */
const LEXICON: Record<MatchKind, string[]> = {
  // Common profanity, not slurs. Matching it is nearly always a false positive
  // for risk — it is here because emphasis and abuse share a vocabulary, and
  // the model needs to see the ones that turn out to be abuse.
  harassment: [
    'fuck', 'shit', 'bitch', 'idiot', 'stupid', 'ugly', 'disgusting', 'pathetic',
    'kill yourself', 'kys', 'nobody asked', 'shut up', 'go away', 'cringe',
    '병신', '못생', '꺼져', '죽어', '한심', '역겹',
  ],
  hate: [
    'go back to', 'you people', 'your kind', 'all of them are',
    '너네 나라', '니네 나라',
  ],
  violence: [
    'kill you', 'hunt you', 'find you', 'beat you', 'hope you die', 'should die',
    '죽인다', '패버', '죽여',
  ],
  sexual: [
    'nudes', 'onlyfans', 'hourly', 'escort', 'sugar daddy', 'body count',
    '몸매', '야한',
  ],
  illegal: [
    'crypto', 'forex', 'investment opportunity', 'guaranteed returns',
    'replica', 'counterfeit', 'dm for prices',
  ],
  spam: [
    'check my channel', 'sub for sub', 'follow back', 'click here', 'link in bio',
    'free iphone', 'giveaway winner', 'bit.ly', 'tinyurl', 'triple tap',
    'voice message', 'promo code in my',
  ],
  // NOT a safety category. Product complaints are commercially useful — a
  // brand wants to know that thirty people said the last placement broke — and
  // routing them through brand safety would make "this cleanser irritated my
  // skin" a mark against the creator, which is the exact confusion this report
  // has been pulling apart all along.
  quality: [
    'broke after', 'stopped working', 'waste of money', 'not worth', 'refund',
    'returned it', 'fell apart', 'cheap quality', 'doesn\'t work', 'didn\'t work',
    'overpriced', 'scam product', 'made my skin', 'broke me out', 'irritated',
    '환불', '고장', '별로', '실망', '돈 아까',
  ],
};

/**
 * Normalise before matching.
 *
 * Obfuscation is the point of obfuscation: f*ck, fuk, f.u.c.k and ｆｕｃｋ are
 * one word to a reader and four to a naive matcher. This collapses the common
 * evasions without trying to be clever — an arms race against spelling is not
 * winnable here, and the model is the backstop.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[0@]/g, 'o')
    // `1` and `|` stand in for `i`; `!` does not. Leetspeak uses it, but
    // ordinary text uses it far more, and mapping it turned "f.u.c.k!!" into
    // "fuckii" — an evasion that only ever existed in the normaliser.
    .replace(/[1|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Word-boundary matching, because substring matching is how you flag
 * Scunthorpe.
 *
 * "assassinate" contains a word this lexicon would rather not match, "class"
 * contains another, and a filter that catches them is a filter a creator
 * learns to ignore. Korean has no spaces to anchor to, so CJK terms match as
 * substrings — which is correct for an agglutinative language and is why they
 * are kept short and specific.
 */
/**
 * Inflections a term should still match.
 *
 * Deliberately a list rather than `\\w*`. An open suffix makes "fucking" match,
 * which is wanted, and "shitake" match, which is not — and the second is how a
 * filter teaches a creator to ignore it. A leading boundary is always required,
 * which is what keeps "class" and "assassinate" out.
 */
const INFLECTIONS = '(?:s|es|ed|d|ing|in|er|ers|y)?';

/**
 * Variants a censor bar produces.
 *
 * "f*ck" normalises to "fck", because a star is not a letter and nothing can
 * tell which letter it stood for. Dropping each vowel in turn covers the common
 * case without guessing — and these terms are short and specific enough that
 * the de-vowelled forms do not collide with ordinary words.
 */
function censoredForms(term: string): string[] {
  const out = new Set<string>();
  for (let i = 0; i < term.length; i++) {
    if ('aeiou'.includes(term[i])) out.add(term.slice(0, i) + term.slice(i + 1));
  }
  return [...out];
}

function matches(haystack: string, term: string): boolean {
  if (/[\p{Script=Hangul}\p{Script=Han}]/u.test(term)) return haystack.includes(term);
  const forms = term.includes(' ') ? [term] : [term, ...censoredForms(term)];
  return forms.some((form) => {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}${INFLECTIONS}(?:\\s|$)`, 'u').test(haystack);
  });
}

/**
 * Every lens a comment trips. Empty means nothing matched, which is a reason
 * not to spend a model call on it — never a statement that the comment is fine.
 */
export function scanKeywords(text: string, extra: Partial<Record<MatchKind, string[]>> = {}): KeywordMatch[] {
  const h = normalise(text);
  if (!h) return [];

  const out: KeywordMatch[] = [];
  const seen = new Set<MatchKind>();

  // Shape first: it costs one regex each and catches what no word list can.
  for (const rule of STRUCTURAL) {
    if (!seen.has(rule.kind) && rule.test(text)) {
      out.push({ kind: rule.kind, term: rule.term });
      seen.add(rule.kind);
    }
  }

  for (const [kind, terms] of Object.entries(LEXICON) as [MatchKind, string[]][]) {
    if (seen.has(kind)) continue;
    const all = [...terms, ...(extra[kind] ?? [])];
    for (const term of all) {
      if (matches(h, normalise(term))) {
        out.push({ kind, term });
        seen.add(kind);
        break; // One hit per lens is enough to earn a second look.
      }
    }
  }
  return out;
}

/**
 * Shapes, not words.
 *
 * Added after the lens was measured against a real corpus and found 9 of 810
 * comments while a human reading the same 810 found 31. The 22 it missed were
 * all one thing: engagement bots whose text is ordinary praise carrying a long
 * emoji run — "I came across this by accident, and I'm glad I did.❤😊❤😊❤".
 * There is no keyword in that. There is a shape.
 *
 * Structure is what a lexicon is worst at and regexes are best at, so the two
 * belong in the same pass rather than in the same list.
 */
const STRUCTURAL: { kind: MatchKind; term: string; test: (raw: string) => boolean }[] = [
  {
    kind: 'spam',
    term: 'emoji run',
    // Four or more emoji in a row. Enthusiasm reaches three; the bot templates
    // in the measured corpus ran to a dozen and repeated the pair.
    test: (raw) => /(?:\p{Extended_Pictographic}\uFE0F?){4,}/u.test(raw),
  },
  {
    kind: 'spam',
    term: 'alternating emoji pair',
    // Two DIFFERENT emoji repeating — the ❤😊❤😊 signature. Requiring them to
    // differ is what keeps 😍😍😍 out: three of the same is enthusiasm, and a
    // filter that flags enthusiasm is one a creator stops reading.
    test: (raw) =>
      /(\p{Extended_Pictographic})(?!\1)(\p{Extended_Pictographic})\1\2/u.test(raw),
  },
  {
    kind: 'spam',
    term: 'fake player widget',
    // The "voice message" bait draws a progress bar out of box characters.
    test: (raw) => /[─━▬▶️◁❚↻]{3,}|\d:\d\d\s*[─━▬]/u.test(raw),
  },
  {
    kind: 'illegal',
    term: 'contact handoff',
    test: (raw) => /\b(?:wa|whats ?app|telegram|t\.me|kakao)\b/iu.test(raw),
  },
];

/** Did anything at all trip? The pre-filter's only question. */
export function isCandidate(text: string, extra?: Partial<Record<MatchKind, string[]>>): boolean {
  return scanKeywords(text, extra).length > 0;
}

/**
 * Where a maintained slur list plugs in.
 *
 * Kept out of the repository on purpose — see the note on LEXICON. Returns
 * nothing when unset, and the pre-filter runs without it rather than failing
 * closed: a missing list should cost recall on one lens, not stop the scan.
 */
export function loadExternalTerms(): Partial<Record<MatchKind, string[]>> {
  const raw = process.env.ADFIT_EXTRA_TERMS;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<Record<MatchKind, string[]>>;
  } catch {
    console.warn('[keywords] ADFIT_EXTRA_TERMS is not valid JSON — running without it');
    return {};
  }
}
