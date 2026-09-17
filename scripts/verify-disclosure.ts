/**
 * Assertions for the disclosure-rate read.
 *
 * The thing being pinned here is mostly what the module refuses to say. It
 * cannot detect undisclosed sponsorship — nothing can, because no API reports
 * whether money changed hands — and a false accusation of hidden advertising is
 * defamation-shaped rather than a rounding error. These check that the wide gap
 * measured on a real 300-post catalogue produces "this cannot be verified, ask"
 * and never "this creator hides ads".
 *
 *   npm run verify:disclosure
 */
import {
  NOTE_MAX,
  REPEAT_FLOOR,
  assessDisclosure,
  type DisclosureInput,
} from '@/lib/report/disclosure';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}

const brand = (handle: string, posts: number) => ({
  handle, posts, firstAt: '2025-01-29', lastAt: '2025-08-07',
});

// @jooshica6178, read from the API across 300 uploads.
const REAL: DisclosureInput = {
  postsChecked: 300,
  postsTaggingOthers: 129,
  declaredPlacements: 1,
  suspicions: 5,
  commentsScanned: 21330,
  repeatBrands: [brand('@makeupforever', 21), brand('@hudabeauty', 19), brand('@welovecoco', 17)],
};

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------

check('a thin catalogue is not assessed', assessDisclosure({ ...REAL, postsChecked: 19 }), null);
check('and 20 posts is enough to look', assessDisclosure({ ...REAL, postsChecked: 20 }) !== null, true);

// ---------------------------------------------------------------------------
// The rates
// ---------------------------------------------------------------------------

const real = assessDisclosure(REAL)!;
check('tagging rate is measured', Math.round(real.taggingRate * 100), 43);
check('declared rate is measured', Math.round(real.declaredRate * 1000), 3);
check('incidence is the declared rate, over posts', real.flag.basis, 'posts');

// ---------------------------------------------------------------------------
// What it must NOT say
// ---------------------------------------------------------------------------

const note = real.flag.note.toLowerCase();
check('never uses the word undisclosed', note.includes('undisclosed'), false);
check('never says hidden', note.includes('hidden'), false);
check('never asserts posts were paid', note.includes('were paid'), false);
check('states the genre defence explicitly', note.includes('naming products is the content'), true);
check(
  'frames the finding as unverifiable rather than guilty',
  note.includes('cannot separate paid from organic'),
  true,
);

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

check('a wide gap with audience allegations is medium', real.flag.severity, 'medium');
check(
  'the same gap without allegations is only low',
  assessDisclosure({ ...REAL, suspicions: 0 })!.flag.severity,
  'low',
);
check(
  'declarations that track the content are low and say so',
  assessDisclosure({ ...REAL, declaredPlacements: 40 })!.flag.note.includes('track the commercial content'),
  true,
);
check(
  'little commercial surface raises nothing',
  assessDisclosure({ ...REAL, postsTaggingOthers: 9 })!.flag.severity,
  'none',
);

// ---------------------------------------------------------------------------
// Repeat mentions — the strongest signal, and it needs no classifier
// ---------------------------------------------------------------------------

check('repeats below the floor are dropped', 
  assessDisclosure({ ...REAL, repeatBrands: [brand('@x', REPEAT_FLOOR - 1)] })!.repeatBrands.length, 0);
check('repeats at the floor are kept', 
  assessDisclosure({ ...REAL, repeatBrands: [brand('@x', REPEAT_FLOOR)] })!.repeatBrands.length, 1);
check('they rank by frequency', real.repeatBrands[0].handle, '@makeupforever');
check('and the most-named one is cited', real.flag.note.includes('@makeupforever on 21'), true);

// Grammar — a buyer reads this string.
check('one declaration reads "declares"', real.flag.note.includes('1 declares'), true);
check(
  'several read "declare"',
  assessDisclosure({ ...REAL, declaredPlacements: 3 })!.flag.note.includes('3 declare'),
  true,
);

// ---------------------------------------------------------------------------
// The note cap
//
// `brandSafetyFlagsSchema` caps a note at 240 characters and USED to drop the
// whole flags array on a failure, so an over-long sentence rendered the report
// as "Not assessed, no comments" — a clean result manufactured by prose length.
// ---------------------------------------------------------------------------

check('the real note fits the schema cap', real.flag.note.length <= NOTE_MAX, true);
const capCases: Array<[string, DisclosureInput]> = [
  ['no repeats', { ...REAL, repeatBrands: [] }],
  ['no allegations', { ...REAL, suspicions: 0 }],
  ['tracking declarations', { ...REAL, declaredPlacements: 40 }],
  ['low surface', { ...REAL, postsTaggingOthers: 9 }],
  ['a very long handle', { ...REAL, repeatBrands: [brand('@' + 'x'.repeat(29), 21)] }],
];
for (const [label, input] of capCases) {
  check(`${label}: note fits the cap`, assessDisclosure(input)!.flag.note.length <= NOTE_MAX, true);
}
check(
  'the corroboration survives the clamp, since it is what makes it medium',
  real.flag.note.includes('5 comments already ask'),
  true,
);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
