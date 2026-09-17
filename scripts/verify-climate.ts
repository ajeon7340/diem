/**
 * Assertions for the comment-climate read.
 *
 * This replaced a row of risk categories as the headline, and a one-word
 * atmosphere is a far more dangerous thing to get wrong than a table of counts
 * — it is short enough to be remembered and repeated, and short enough to be
 * read as a verdict on a person who wrote none of it.
 *
 * So what is pinned here is mostly what the label must NOT do: it must not be
 * driven by spam, it must not default to the middle when nothing was read, it
 * must not move when the corpus is too thin, and it must never let a figure
 * computed over one pass's corpus be divided by another's.
 *
 *   npm run verify:climate
 */
import {
  CLIMATE_BANDS,
  CLIMATE_RUBRIC_VERSION,
  HOSTILE_CATEGORIES,
  POLARISED,
  WARM_PRAISE_RATIO,
  audienceClimate,
  hostileShare,
  measureRegister,
} from '@/lib/report/climate';
import { censusRisk } from '@/lib/report/safety';
import { THRESHOLDS } from '@/lib/report/sufficiency';
import type { CommentAxes, CommentRisk, ModerationState } from '@/types';

let pass = 0,
  fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}\n       got  ${a}\n       want ${e}`);
  }
}

const risk = (rows: Partial<CommentRisk>[], scanned: number) =>
  censusRisk(
    rows.map((r) => ({
      category: 'harassment',
      count: 0,
      byCreator: 0,
      hidden: 0,
      example: '',
      ...r,
    })) as CommentRisk[],
    {
      commentsScanned: scanned,
      foundTotal: rows.reduce((s, r) => s + (r.count ?? 0), 0),
      visibleTotal: rows.reduce((s, r) => s + (r.count ?? 0), 0),
      hiddenTotal: 0,
      lastModeratedAt: null,
    } as ModerationState,
    scanned,
  );

const axes = (praise: number, criticise: number, total: number): CommentAxes => ({
  object: [],
  cells: [],
  intent: [
    { key: 'praise', count: praise },
    { key: 'criticise', count: criticise },
  ],
  total,
});

// ---------------------------------------------------------------------------
// Absence
// ---------------------------------------------------------------------------
check('no scan means no label', audienceClimate(null, null).label, null);
check('and no traits invented', audienceClimate(null, null).traits, []);
// The whole reason this is nullable. A section nobody screened is not a calm
// section, and defaulting to the middle would make every unscanned creator read
// as pleasantly unremarkable — the flattering-absence bug the composite score
// was deleted over.
check(
  'clustering alone is not a climate',
  audienceClimate(axes(4_000, 700, 20_000), null).label,
  null,
);
const thin = audienceClimate(null, risk([{ count: 1 }], THRESHOLDS.COMMENTS.limited - 1));
check('below the sufficiency floor there is no label', thin.label, null);
check('and the thin case says how little was read', /Only \d/.test(thin.summary), true);

// ---------------------------------------------------------------------------
// Spam must not set the temperature
// ---------------------------------------------------------------------------
check('spam is not a social temperature', HOSTILE_CATEGORIES.includes('spam' as never), false);
check('nor is illegal', HOSTILE_CATEGORIES.includes('illegal' as never), false);
// @jooshica, measured: 797 comments, 31 flagged — but 22 of them are engagement
// bots posting emoji chains. Counting those made a section running 19.4% praise
// against 3.4% criticism read as combative, which is how this was caught.
const botty = risk(
  [
    { category: 'spam', count: 22 },
    { category: 'harassment', count: 6 },
    { category: 'sexual', count: 2 },
    { category: 'hate', count: 1 },
  ],
  797,
);
check('bots do not count toward hostility', Math.round(hostileShare(botty)! * 10_000), 113);
check(
  'a bot-heavy but appreciative section is not rough',
  audienceClimate(axes(4_130, 725, 21_330), botty).label,
  'warm',
);

// ---------------------------------------------------------------------------
// The bands, on real data
// ---------------------------------------------------------------------------
// @가재맨, measured: 2,392 comments, 180 flagged — 111 harassment, 25 violence,
// 21 hate, 20 sexual, 2 illegal, 1 spam, and none written by the creator. 177
// of the 180 are interpersonal, which is 7.4% and past every band.
const gj = risk(
  [
    { category: 'harassment', count: 111 },
    { category: 'violence', count: 25 },
    { category: 'hate', count: 21 },
    { category: 'sexual', count: 20 },
    { category: 'illegal', count: 2 },
    { category: 'spam', count: 1 },
  ],
  2_392,
);
check('7.4% interpersonal hostility', Math.round(hostileShare(gj)! * 1_000) / 10, 7.4);
const gjClimate = audienceClimate(null, gj);
check('past 5% the hostility is the room', gjClimate.label, 'hostile');
check('bands are ordered and closed', CLIMATE_BANDS[CLIMATE_BANDS.length - 1].maxHostileShare, 1);
// Said on every report, not only the bad ones. The label is one word and one
// word is what gets remembered; without this it is remembered as a verdict.
check(
  'the sentence says it is not about the creator',
  /not the creator/.test(gjClimate.summary),
  true,
);
check('and it names its own denominator', /2,392 comments read/.test(gjClimate.summary), true);

// A creator who wrote some of it is a different fact, and the sentence changes.
const gjOwn = risk(
  [
    { category: 'harassment', count: 111, byCreator: 3 },
    { category: 'violence', count: 25 },
    { category: 'hate', count: 21 },
    { category: 'sexual', count: 20 },
  ],
  2_392,
);
check(
  'what the creator wrote is called out instead',
  /written by the creator, which is the only part that reflects on them/.test(
    audienceClimate(null, gjOwn).summary,
  ),
  true,
);

// ---------------------------------------------------------------------------
// warm is an extra claim, not a lower band
// ---------------------------------------------------------------------------
const calm = risk([{ count: 2 }], 2_000);
check('calm and appreciative is warm', audienceClimate(axes(4_000, 500, 20_000), calm).label, 'warm');
check(
  'calm without appreciation is only ordinary',
  audienceClimate(axes(400, 380, 20_000), calm).label,
  'ordinary',
);
check(
  'calm with no axes at all cannot be warm',
  audienceClimate(null, calm).label,
  'ordinary',
);
check('the warm bar is stated', WARM_PRAISE_RATIO, 3);

// ---------------------------------------------------------------------------
// polarised: both sides loud at once
// ---------------------------------------------------------------------------
// An average hides this completely — the same praise-to-criticism ratio
// describes a room agreeing mildly and a room having a fight.
const split = audienceClimate(axes(3_000, 1_600, 20_000), calm);
check('a split audience is flagged', split.traits.includes('polarised'), true);
check('a quiet one is not', audienceClimate(axes(4_000, 500, 20_000), calm).traits, []);
check('thresholds are stated', [POLARISED.minCriticiseShare, POLARISED.minPraiseShare], [0.06, 0.12]);

// ---------------------------------------------------------------------------
// Register: a property of the text, never an inference about the reader
// ---------------------------------------------------------------------------
const ko = measureRegister([
  '안녕하세요 영상 정말 잘 봤습니다',
  '항상 응원하고 있습니다',
  'ㅋㅋㅋㅋ 이거 레전드네',
  'ㅇㅇ 인정',
  '진짜 재밌어요',
])!;
check('폰댓말 endings are counted as formal', Math.round(ko.formalShare * 100), 60);
check('consonant-only shorthand is counted as casual', Math.round(ko.slangShare * 100), 40);
check('an empty corpus has no register', measureRegister([]), null);
check('whitespace-only comments do not count', measureRegister(['   ', '\n'])!, null);
// Median, not mean: one 4,000-character essay in a section of one-word
// reactions moves a mean enough to describe the wrong room.
check('length is a median', measureRegister(['a', 'bb', 'c'.repeat(4_000)])!.medianLength, 2);

const en = measureRegister(['This is a complete sentence.', 'lol same', 'yooooo'])!;
check('Latin sentences count as formal too', Math.round(en.formalShare * 100), 33);
check('Latin slang counts as casual', Math.round(en.slangShare * 100), 67);

// Its own denominator, always. The register pass and the clustering pass can
// cover different sets, and a share of the wrong corpus is the defect this
// repo has now found in six separate places.
check('the register reports what it read', ko.scanned, 5);

// ---------------------------------------------------------------------------
// Traits are independent of the label and of each other
// ---------------------------------------------------------------------------
const formalSection = audienceClimate(null, calm, {
  scanned: 1_000,
  formalShare: 0.6,
  slangShare: 0.1,
  emojiShare: 0.05,
  medianLength: 80,
});
check('a formal section is labelled formal', formalSection.traits, ['formal']);
check(
  'a hostile section can still be formal',
  audienceClimate(null, gj, {
    scanned: 1_000,
    formalShare: 0.6,
    slangShare: 0.1,
    emojiShare: 0.05,
    medianLength: 80,
  }).label,
  'hostile',
);
// Neither formal nor casual is a real state and must be representable.
check(
  'a section can be neither',
  audienceClimate(null, calm, {
    scanned: 1_000,
    formalShare: 0.1,
    slangShare: 0.1,
    emojiShare: 0.05,
    medianLength: 40,
  }).traits,
  [],
);

check('the rubric is versioned', CLIMATE_RUBRIC_VERSION, 'climate-rubric-1');
check('and every read carries the version', gjClimate.rubricVersion, CLIMATE_RUBRIC_VERSION);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
