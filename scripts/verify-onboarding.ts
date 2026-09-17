/**
 * Assertions for the creator onboarding handle field.
 *
 *   npm run verify:onboarding
 */
import { youtubeHandleSchema } from '@/lib/schemas';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}
const parse = (v: unknown) => youtubeHandleSchema.safeParse(v);
const ok = (v: unknown) => (parse(v).success ? parse(v).data : 'REJECTED');

// A creator will paste whatever is in front of them.
check('bare @handle', ok('@jooshica6178'), '@jooshica6178');
check('no at sign', ok('jooshica6178'), '@jooshica6178');
check('full channel URL', ok('https://www.youtube.com/@jooshica6178'), '@jooshica6178');
check('URL with a tab on the end', ok('https://youtube.com/@jooshica6178/videos'), '@jooshica6178');
check('surrounding whitespace', ok('  @jooshica6178  '), '@jooshica6178');
check('dots and dashes are legal in handles', ok('@marah.builds-x'), '@marah.builds-x');

// Optional: a creator with no channel still has to be able to finish signing up.
check('empty is allowed', ok(''), null);
check('absent is allowed', ok(undefined), null);
check('null is allowed', ok(null), null);

// ---------------------------------------------------------------------------
// Handles that are not ASCII
//
// `\w` is [A-Za-z0-9_]. The URL match used it, so every non-Latin handle on
// YouTube fell through as an unmatched URL and was rejected with "Use your
// @handle" — advice that cannot be followed when the handle is the thing being
// refused. @가재맨 is one of the two real channels this product was built
// against and could not be typed into its own signup form.
// ---------------------------------------------------------------------------
check('a Korean handle', ok('@가재맨'), '@가재맨');
check('a Korean handle in a URL', ok('https://www.youtube.com/@가재맨'), '@가재맨');
check('with a tab on the end', ok('https://www.youtube.com/@가재맨/videos'), '@가재맨');
check('Japanese', ok('https://youtube.com/@ゆっくり実況'), '@ゆっくり実況');
check('Cyrillic', ok('@Вдудь'), '@Вдудь');
check('mixed script', ok('@k팝star'), '@k팝star');

// ---------------------------------------------------------------------------
// The other URL YouTube hands out
//
// /channel/UC… carries an id, not a handle, and no local transform can turn
// one into the other — the lookup does that. The id passes through and
// `resolveChannel` calls channels.list with `id` instead of `forHandle`.
// ---------------------------------------------------------------------------
check(
  'a channel-id URL keeps the id',
  ok('https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA'),
  'UCX6OQ3DkcsbYNE6H8uQQuVA',
);
check('a bare channel id', ok('UCX6OQ3DkcsbYNE6H8uQQuVA'), 'UCX6OQ3DkcsbYNE6H8uQQuVA');
check('a query string does not become part of it', ok('https://www.youtube.com/@fernpress?sub_confirmation=1'), '@fernpress');

// Rejections have to be rejections, not silently-null fields that look
// connected and never fill in.
check('a malformed channel id is refused', ok('https://www.youtube.com/channel/UCabc'), 'REJECTED');
check('two characters is refused', ok('@ab'), 'REJECTED');
check('spaces inside are refused', ok('@two words'), 'REJECTED');
check('another site is refused', ok('https://vimeo.com/@x'), 'REJECTED');
// 30 is YouTube's maximum; 31 must not squeak through on a Unicode class.
check('31 characters is refused', ok('@' + 'a'.repeat(31)), 'REJECTED');
check('31 Korean characters is refused', ok('@' + '가'.repeat(31)), 'REJECTED');
check(
  'the error names both shapes now accepted',
  parse('@ab').success ? '' : parse('@ab').error!.issues[0].message,
  'Paste your channel URL or your @handle, like youtube.com/@jooshica6178',
);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
