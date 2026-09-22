/**
 * Every export of a `'use server'` module must be an async function.
 *
 * React validates this when the module is evaluated and throws
 *
 *     A "use server" file can only export async functions, found object.
 *
 * which is a 500 on the action call and NOTHING ELSE. The page still renders,
 * `next dev` tolerates it, `next build` compiles it, `tsc` is happy and every
 * GET returns 200 — so a build that is broken for every form on three pages
 * looks completely healthy from the outside.
 *
 * This has now happened twice. The first time it took down `submitProposal`,
 * the whole inbound funnel, and the fix was a comment in
 * `src/app/actions/state.ts` saying never do this again. The comment did not
 * stop it: `INITIAL_EXPLAIN` was added to `app/actions/studio.ts` afterwards,
 * and `INITIAL_MAGIC_LINK_STATE` had been sitting in `lib/auth/actions.ts` the
 * whole time — outside `app/actions/`, where nobody thought to look. That one
 * broke sign-in, /join/creator and /join/business at once: enter an email,
 * press the button, get "Application error: a server-side exception has
 * occurred". Which is how it was finally found — in production, by the user.
 *
 * A convention that only lives in a comment is not enforced. This is the check.
 *
 *   npm run verify:actions
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0;
let fail = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** The directive has to be the first statement, but comments may precede it. */
function isUseServer(source: string): boolean {
  const withoutComments = source
    .replace(/^﻿/, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return /^\s*(['"])use server\1\s*;?/.test(withoutComments);
}

/**
 * Types are erased before the module reaches the runtime, so an exported
 * interface or type alias is safe and stays beside its action. A VALUE is not.
 */
const ALLOWED = [
  /^export\s+async\s+function\s/,
  /^export\s+interface\s/,
  /^export\s+type\s/,
  /^export\s+default\s+async\s+function\s/,
];

const files = walk('src');
const serverModules = files.filter((f) => isUseServer(readFileSync(f, 'utf8')));

check(
  'the scan found the server-action modules',
  serverModules.length >= 4,
  `found ${serverModules.length}`,
);

const offenders: string[] = [];
for (const file of serverModules) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!/^export\b/.test(line)) return;
    if (ALLOWED.some((re) => re.test(line))) return;
    offenders.push(`${file}:${i + 1}  ${line.trim()}`);
  });
}

check(
  'no non-async export in any "use server" module',
  offenders.length === 0,
  offenders.join('\n       '),
);

// The two that shipped broken, pinned by name so a revert is loud.
const authSource = readFileSync('src/lib/auth/actions.ts', 'utf8');
check(
  'INITIAL_MAGIC_LINK_STATE is not exported beside sendMagicLink',
  !authSource.includes('export const INITIAL_MAGIC_LINK_STATE'),
);
// `INITIAL_EXPLAIN` went with the Studio action when the creator half was
// removed. The rule it proved is still pinned by the scan above and by
// INITIAL_MAGIC_LINK_STATE below; naming a file that no longer exists would
// only make this suite fail for the wrong reason.

// And they still exist somewhere, or the forms have no initial state.
const stateSource = readFileSync('src/app/actions/state.ts', 'utf8');
check(
  'it still has a home',
  stateSource.includes('INITIAL_MAGIC_LINK_STATE'),
);
check(
  'and that home is not itself a "use server" module',
  !isUseServer(stateSource),
);


// ---------------------------------------------------------------------------
// "Please try again" is only said where trying again could work
//
// It was the answer to every write failure, and for the commonest one it was
// false: a table that does not exist because a migration was never applied
// fails identically on every retry, forever. Somebody who presses Search,
// reads "try again", presses it again and reads it again has been told to do
// the one thing that cannot work.
// ---------------------------------------------------------------------------

const read = (path: string) => readFileSync(path, 'utf8');
const failure = read('src/lib/data/failure.ts');
check('a missing table is classified as setup, not as transient', failure.includes("'42P01'"));
check('and so is PostgREST missing it from its schema cache', failure.includes("'PGRST205'"));
check('a permission failure is its own outcome', failure.includes("'42501'"));
check('the raw error goes to the log, not the customer', failure.includes('console.error('));
check(
  'and the customer is told who can act on it',
  failure.includes('whoever deployed adfit needs to finish it'),
);
check(
  'no table name reaches the customer',
  !/discovery_searches|channel_analyses|public\./.test(
    failure.slice(failure.indexOf('export function describeWriteFailure')),
  ),
);

for (const path of [
  'src/app/actions/discovery.ts',
  'src/app/actions/channel.ts',
  'src/app/actions/campaign.ts',
  'src/app/actions/brand.ts',
  'src/app/actions/onboarding.ts',
  'src/app/actions/relevance.ts',
]) {
  const src = read(path);
  const name = path.split('/').pop();
  check(`${name} classifies its write failures`, src.includes('describeWriteFailure('));
  check(
    `${name} no longer says "try again" unconditionally`,
    !/message: 'Could not [^']*Please try again\.'/.test(src),
  );
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
