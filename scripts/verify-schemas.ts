/**
 * Assertions for the parsing layer, where form-shape bugs actually live:
 * handle normalisation, reserved-route collisions, the checkbox -> boolean
 * transform, and budget coercion. The database enforces all of this too — this
 * just catches it before a user sees a Postgres error.
 *
 *   npm run verify:schemas
 */
import {
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

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
