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

// Rejections have to be rejections, not silently-null fields that look
// connected and never fill in.
check('a channel URL by id is refused', ok('https://www.youtube.com/channel/UCabc'), 'REJECTED');
check('two characters is refused', ok('@ab'), 'REJECTED');
check('spaces inside are refused', ok('@two words'), 'REJECTED');
check('another site is refused', ok('https://vimeo.com/@x'), 'REJECTED');
check(
  'the error names the shape wanted',
  parse('@ab').success ? '' : parse('@ab').error!.issues[0].message,
  'Use your @handle, like @jooshica6178',
);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
