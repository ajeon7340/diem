/**
 * Assertions for what signup derives from a pasted channel.
 *
 *   npm run verify:signup
 *
 * The handle is a permanent URL and it is now proposed rather than typed, so
 * the derivation has to be right about when it CANNOT derive one. A guess here
 * is not a bad default a creator shrugs at — it is their address.
 */
import { CREATOR_NICHES } from '@/types';
import { budgetRange } from '@/lib/format';
import { handleSchema } from '@/lib/schemas';
import { nextHandle, suggestHandle } from '@/lib/report/handle-suggest';

let pass = 0,
  fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.error(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}

// ---------------------------------------------------------------------------
// Derived from the channel
// ---------------------------------------------------------------------------
check('an ASCII handle carries over', suggestHandle({ youtubeHandle: '@jooshica6178' }), 'jooshica6178');
check('case is normalised', suggestHandle({ youtubeHandle: '@MarahWoods' }), 'marahwoods');
check('dots survive', suggestHandle({ youtubeHandle: '@marah.builds' }), 'marah.builds');
check(
  'the title is the fallback',
  suggestHandle({ youtubeHandle: null, title: 'Quiet Circuit' }),
  'quietcircuit',
);
check('accents are folded, not dropped', suggestHandle({ title: 'Café Motors' }), 'cafemotors');

// ---------------------------------------------------------------------------
// When it must NOT derive one
//
// `creators.handle` is ASCII by CHECK constraint. @가재맨 has no ASCII form,
// and romanising it would embed a transliteration nobody asked for in their
// permanent URL — "gajaeman" only if you assume Revised Romanisation and no
// stylisation. Null means the field stays empty and the creator chooses.
// ---------------------------------------------------------------------------
check('Korean yields nothing', suggestHandle({ youtubeHandle: '@가재맨', title: '가재맨' }), null);
check('Japanese yields nothing', suggestHandle({ title: 'ゆっくり実況' }), null);
check('Cyrillic yields nothing', suggestHandle({ title: 'Вдудь' }), null);
check('too short after stripping', suggestHandle({ title: 'A!' }), null);
check('a reserved word is refused', suggestHandle({ title: 'settings' }), null);
check('nothing at all', suggestHandle({}), null);

// Whatever it proposes must satisfy the schema the insert is checked against —
// a suggestion the database would reject is worse than no suggestion.
for (const source of [
  { youtubeHandle: '@jooshica6178' },
  { title: 'Quiet Circuit' },
  { title: 'Café Motors' },
  { youtubeHandle: '@marah.builds' },
]) {
  const suggested = suggestHandle(source);
  check(`"${suggested}" passes handleSchema`, handleSchema.safeParse(suggested).success, true);
}

// ---------------------------------------------------------------------------
// Collisions
// ---------------------------------------------------------------------------
check('the second attempt is numbered', nextHandle('marahwoods', 2), 'marahwoods2');
// Appending to a 30-character handle would produce 31 and be rejected forever,
// which surfaces to the creator as "taken" with no way out.
const long = 'a'.repeat(30);
check('a maximal handle still fits', nextHandle(long, 2).length, 30);
check('and still parses', handleSchema.safeParse(nextHandle(long, 2)).success, true);

// ---------------------------------------------------------------------------
// One price or a range — both are real answers
// ---------------------------------------------------------------------------
const money = (min: number | null, max: number | null, negotiable = false) =>
  budgetRange({ budgetMin: min, budgetMax: max, budgetNegotiable: negotiable });
check('a range reads as a range', money(15_000, 25_000), '$15,000–$25,000');
check('one figure reads as one figure', money(15_000, 15_000), '$15,000');
check('a floor still reads as a floor', money(15_000, null), 'from $15,000');
check('withheld is not the same as absent', money(null, null, true), 'open to offers');
check('and absent is null', money(null, null, false), null);

// ---------------------------------------------------------------------------
// The niche list
// ---------------------------------------------------------------------------
// Every value already in the database must remain choosable. Dropping one
// orphans the creators carrying it: they vanish from their own niche filter
// and cannot reselect it.
for (const existing of [
  'Audio & Listening',
  'Beauty & Lifestyle',
  'Consumer Tech & Workspace',
  'Gaming & Commentary',
  'Outdoor & Gear',
  'Stationery & Paper',
]) {
  check(`"${existing}" is still offered`, CREATOR_NICHES.includes(existing as never), true);
}
check('the list has no duplicates', new Set(CREATOR_NICHES).size, CREATOR_NICHES.length);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
