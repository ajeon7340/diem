/**
 * Assertions for the parsing layer, where form-shape bugs actually live:
 * handle normalisation, reserved-route collisions, the checkbox -> boolean
 * transform, and budget coercion. The database enforces all of this too — this
 * just catches it before a user sees a Postgres error.
 *
 *   npm run verify:schemas
 */
import {
  commentClustersSchema,
  creatorOnboardingSchema,
  businessOnboardingSchema,
  handleSchema,
  emailSchema,
} from '@/lib/schemas';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}

// --- handle normalisation & rules
check('@MarahWoods -> marahwoods', handleSchema.safeParse('@MarahWoods').data, 'marahwoods');
check('reserved "dashboard" rejected', handleSchema.safeParse('dashboard').success, false);
check('reserved "@Directory" rejected', handleSchema.safeParse('@Directory').success, false);
check('too short rejected', handleSchema.safeParse('ab').success, false);
check('trailing dot rejected', handleSchema.safeParse('name.').success, false);
check('dots allowed mid-handle', handleSchema.safeParse('marah.builds').data, 'marah.builds');
check('spaces rejected', handleSchema.safeParse('my name').success, false);

// --- email
check('email lowercased', emailSchema.safeParse('  Jordan@Northbeam.COM ').data, 'jordan@northbeam.com');
check('bad email rejected', emailSchema.safeParse('nope@').success, false);

// --- creator onboarding: exactly the FormData shape the action builds
const unchecked = creatorOnboardingSchema.safeParse({
  handle: '@NewCreator', displayName: 'New Creator', niche: 'Fitness',
  bio: '', budgetMin: '', isDirectoryVisible: null,      // checkbox absent
});
check('unchecked box -> false', unchecked.data?.isDirectoryVisible, false);
check('empty bio -> null', unchecked.data?.bio, null);
check('empty budget -> null', unchecked.data?.budgetMin, null);
check('handle normalised', unchecked.data?.handle, 'newcreator');

const checked = creatorOnboardingSchema.safeParse({
  handle: 'newcreator', displayName: 'New Creator', niche: '',
  bio: 'hi', budgetMin: '15,000', isDirectoryVisible: 'on',  // checkbox present
});
check('checked box -> true', checked.data?.isDirectoryVisible, true);
check('"15,000" -> 15000', checked.data?.budgetMin, 15000);
check('empty niche -> null', checked.data?.niche, null);

check('reserved handle blocked at onboarding',
  creatorOnboardingSchema.safeParse({ handle: 'pricing', displayName: 'X', niche: '', bio: '',
    budgetMin: '', isDirectoryVisible: null }).success, false);

// --- business onboarding
check('org name trimmed', businessOnboardingSchema.safeParse({ organizationName: '  Northbeam  ' }).data?.organizationName, 'Northbeam');
check('1-char org rejected', businessOnboardingSchema.safeParse({ organizationName: 'N' }).success, false);

// ---------------------------------------------------------------------------
// One bad cluster must not delete the rest
//
// `.catch([])` sat on the ARRAY, so a single malformed row discarded every
// cluster in the report — and `safeParse` returned SUCCESS, because the catch
// had already swallowed it. What actually happened: one comment ran to 660
// characters against a 500-character cap on `exampleComment`, and a creator
// with 884 comments and seventeen clusters was told "no readable comments on
// the analysed posts".
// ---------------------------------------------------------------------------
{
  const good = (id: string) => ({
    id,
    label: 'Praise for the creator',
    share: 0.5,
    commentCount: 10,
    intent: 'praise',
    object: 'creator',
    keyphrases: ['channel'],
    comments: [],
    exampleComment: 'nice work',
  });

  check('a healthy pair parses', commentClustersSchema.parse([good('a'), good('b')]).length, 2);

  // The row that broke it: over-long text is a PAYLOAD bound, not a lie about
  // the data, so it truncates rather than invalidating the row.
  const long = { ...good('c'), exampleComment: 'x'.repeat(660) };
  const withLong = commentClustersSchema.parse([good('a'), long, good('b')]);
  check('an over-long example does not drop its row', withLong.length, 3);
  check('and is truncated to the bound', withLong[1].exampleComment.length, 500);

  const longComment = {
    ...good('d'),
    comments: [{
      id: 'x1', text: 'y'.repeat(1200), platform: 'youtube',
      postId: 'v1', postTitle: null, likes: 1, publishedAt: null,
      basis: 'most_liked', url: 'https://www.youtube.com/watch?v=v1',
    }],
  };
  const withLongComment = commentClustersSchema.parse([longComment]);
  check('a long stored comment survives too', withLongComment.length, 1);
  check('truncated at 800', withLongComment[0].comments[0].text?.length, 800);

  // Genuinely malformed rows are dropped — ONE of them, not all of them.
  const broken = { id: '', label: '', share: 'not a number', intent: 'nonsense' };
  const mixed = commentClustersSchema.parse([good('a'), broken, good('b')]);
  check('a malformed row is dropped alone', mixed.length, 2);
  check('and the healthy ones are intact', mixed.map((c) => c.id), ['a', 'b']);

  // The whole-array catch stays as the last resort.
  check('a non-array still yields empty', commentClustersSchema.parse('nope'), []);
}

// ---------------------------------------------------------------------------
// A price range that runs downwards
//
// `budgetRange` prints "$25,000-$15,000" for it and a creator reads a number
// they did not mean to say. The settings form has always refused this; signup
// did not, because the field only became a range later.
// ---------------------------------------------------------------------------
{
  const base = {
    handle: 'someone', displayName: 'Someone', niche: 'Music',
    youtubeHandle: '', bio: null, budgetNegotiable: null, isDirectoryVisible: 'on',
  };
  const parse = (over: Record<string, unknown>) => creatorOnboardingSchema.safeParse({ ...base, ...over });
  check('a rising range is fine', parse({ budgetMin: '15000', budgetMax: '25000' }).success, true);
  check('equal ends are a single price', parse({ budgetMin: '15000', budgetMax: '15000' }).success, true);
  check('a falling range is refused', parse({ budgetMin: '25000', budgetMax: '15000' }).success, false);
  check(
    'and the error points at the field',
    parse({ budgetMin: '25000', budgetMax: '15000' }).error?.issues[0]?.path.join('.'),
    'budgetMin',
  );
  // One figure and no figure both stay legal: the range is optional.
  check('one figure alone is fine', parse({ budgetMin: '15000', budgetMax: '' }).success, true);
  check('no figure at all is fine', parse({ budgetMin: '', budgetMax: '' }).success, true);
}

// ---------------------------------------------------------------------------
// `optional` has to mean optional over FORMDATA
//
// `formData.get()` never returns undefined. It returns NULL for a field the
// markup does not render and for an unticked radio. `.optional()` alone
// accepts only undefined, so an optional field the form simply did not have
// failed the whole schema:
//
//     industry: Invalid input: expected string, received null
//
// Business onboarding read an `industry` the form never rendered, so every
// submission through a browser died on an invisible field with "Check the
// highlighted fields" and nothing highlighted. It passed only from tests that
// posted the key by hand. Both forms are now fed exactly what a browser sends.
// ---------------------------------------------------------------------------
{
  const asFormData = (present: Record<string, unknown>, optional: string[]) => ({
    ...present,
    ...Object.fromEntries(optional.map((k) => [k, null])),
  });

  const business = businessOnboardingSchema.safeParse(
    asFormData({ organizationName: 'Northwind Audio', categories: [], objectives: [] }, [
      'industry', 'sells', 'audience', 'climatePreference',
    ]),
  );
  check('business parses with every optional absent', business.success, true);
  check(
    'and every absent field lands as null',
    business.success ? [business.data.industry, business.data.sells, business.data.audience, business.data.climatePreference] : null,
    [null, null, null, null],
  );

  const creator = creatorOnboardingSchema.safeParse(
    asFormData({ handle: 'someone', displayName: 'Someone' }, [
      'niche', 'bio', 'youtubeHandle', 'budgetMin', 'budgetMax', 'budgetNegotiable', 'isDirectoryVisible',
    ]),
  );
  check('creator parses with every optional absent', creator.success, true);

  // An unticked checkbox group arrives as [] from getAll, not as null.
  check(
    'an empty checkbox group is empty, not invalid',
    businessOnboardingSchema.safeParse(
      asFormData({ organizationName: 'Xy', categories: [], objectives: [] }, ['industry', 'sells', 'audience', 'climatePreference']),
    ).success,
    true,
  );
  // And the one required field is still required.
  check(
    'the company name is still required',
    businessOnboardingSchema.safeParse(
      asFormData({ organizationName: '', categories: [], objectives: [] }, ['industry', 'sells', 'audience', 'climatePreference']),
    ).success,
    false,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
