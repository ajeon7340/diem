/**
 * Assertions for the shared workspace shell.
 *
 *   npm run verify:shell
 *
 * FOUR PAGES THAT WERE FOUR LAYOUTS. Discovery found the shape — controls on
 * the left, work on the right — and `/channels`, `/campaigns`,
 * `/campaigns/[id]` and Settings each kept their own. A customer moving between
 * them re-learned where the primary action lived every time.
 *
 * These pin the parts a plausible tidy-up would undo: the rail's width, that it
 * stacks rather than squeezes on a phone, that it is sticky only where the
 * content it holds is referred to constantly, and — the ones that are not
 * cosmetic at all — that no page invents a status the database does not store,
 * that the three candidate axes stay three, and that the private fields stay
 * out of exports.
 */
import { readFileSync } from 'node:fs';

import { libraryState, matchesQuery, LIBRARY_FILTERS, isLibraryFilter } from '@/lib/channel/library';
import type { AnalysisJob } from '@/types';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}

const read = (path: string) => readFileSync(path, 'utf8');
/** JSX wraps its prose across lines; a copy assertion has to read it as prose. */
const prose = (path: string) => read(path).replace(/\s+/g, ' ');
/** Comments stripped: a header explaining that a page invents no status
 *  contains the word "status". What is asserted is the markup. */
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CHANNELS = 'src/app/channels/page.tsx';
const CAMPAIGNS = 'src/app/campaigns/page.tsx';
const CAMPAIGN = 'src/app/campaigns/[id]/page.tsx';
const SETTINGS = 'src/app/settings/page.tsx';
const SHELL = 'src/components/shell/WorkspaceLayout.tsx';

// ---------------------------------------------------------------------------
// One shell, four pages
// ---------------------------------------------------------------------------

for (const [name, path] of [
  ['channel analysis', CHANNELS],
  ['all campaigns', CAMPAIGNS],
  ['campaign detail', CAMPAIGN],
  ['settings', SETTINGS],
] as const) {
  check(`${name} uses the shared shell`, code(path).includes('<WorkspaceLayout'), true);
  check(`${name} no longer renders its own page frame`, code(path).includes('<SiteHeader'), false);
}

const shell = code(SHELL) + code('src/components/shell/ContextWorkspace.tsx');
check('the rail is inside the 320–360px band', shell.includes('lg:w-[340px]'), true);
check('and does not shrink when the work area grows', shell.includes('lg:shrink-0'), true);
check('the work area cannot be pushed sideways by long content', shell.includes('min-w-0 flex-1'), true);
check('below lg the rail stacks above the work rather than squeezing beside it',
  shell.includes('flex flex-col gap-5 lg:flex-row'), true);
check('the rail keeps the existing top navigation', shell.includes('<SiteHeader />'), true);
check('and is labelled as page controls, not a second navigation',
  shell.includes('aria-label="Page controls"'), true);
check('sticky is opt-in rather than the default', shell.includes('sticky = false'), true);

check('only the campaign decision page pins its rail', /<ContextWorkspace\s+sticky/.test(code('src/components/campaign/CampaignWorkspace.tsx')), true);
check('the campaign list does not', /<WorkspaceLayout[\s\S]{0,120}sticky/.test(code(CAMPAIGNS)), false);
check('nor the report library', /<WorkspaceLayout[\s\S]{0,120}sticky/.test(code(CHANNELS)), false);

// ---------------------------------------------------------------------------
// Report library states
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-20T00:00:00.000Z');
function job(status: string): AnalysisJob {
  return {
    id: 'j', kind: 'collect_channel', status, attempts: 1, maxAttempts: 3,
    queuedAt: '', startedAt: null, finishedAt: null, commentsScanned: null, findings: null,
    lastError: null, progressDone: null, progressTotal: null, progressStage: null,
  } as AnalysisJob;
}
const row = (over: Partial<Parameters<typeof libraryState>[0]> = {}) => ({
  channelId: 'UCx', title: 'A channel', handle: '@x',
  fetchedAt: new Date(NOW - DAY).toISOString(), comments: 600, jobs: [], ...over,
});

check('a fresh completed report is Ready', libraryState(row(), NOW).label, 'Ready');
check('and its bucket is ready', libraryState(row(), NOW).bucket, 'ready');
check('a running job reads as Collecting', libraryState(row({ jobs: [job('running')] }), NOW).label, 'Collecting');
check('a queued one as Queued', libraryState(row({ jobs: [job('queued')] }), NOW).label, 'Queued');
check(
  'a report past 30 days needs a refresh',
  libraryState(row({ fetchedAt: new Date(NOW - 31 * DAY).toISOString() }), NOW).label,
  'Refresh needed',
);
check(
  'and a refresh already running outranks the staleness',
  libraryState(row({ fetchedAt: new Date(NOW - 31 * DAY).toISOString(), jobs: [job('running')] }), NOW).bucket,
  'progress',
);
check(
  'a stale report is NOT filed as a failure — expiry is a deadline, not a fault',
  libraryState(row({ fetchedAt: new Date(NOW - 31 * DAY).toISOString() }), NOW).bucket,
  'stale',
);
check(
  'a failed collection with nothing stored needs attention',
  libraryState(row({ title: null, fetchedAt: null, comments: null, jobs: [job('failed')] }), NOW).label,
  'Collection failed',
);
check(
  'a pass that ran and read nothing is its own state, not a clean one',
  libraryState(row({ comments: 0 }), NOW).label,
  'No readable evidence',
);
check(
  'a saved channel with nothing queued is not "in progress"',
  libraryState(row({ title: null, fetchedAt: null, comments: null }), NOW).bucket,
  'needs',
);
check('every filter id is recognised', LIBRARY_FILTERS.every((f) => isLibraryFilter(f.id)), true);
check('and an arbitrary one is not', isLibraryFilter('anything'), false);

check('search matches a title', matchesQuery(row(), 'chan'), true);
check('and a handle', matchesQuery(row(), '@x'), true);
check('and the id, which is all a pending row has', matchesQuery(row({ title: null, handle: null }), 'ucx'), true);
check('an empty query matches everything', matchesQuery(row(), '   '), true);

const channels = code(CHANNELS);
check(
  'the library never prints the same generic sentence for every pending row',
  channels.includes('Open pending or expired channel report'),
  false,
);
check('a row falls back to its handle or id, so rows stay distinguishable',
  channels.includes('row.title ?? row.handle ?? row.channelId'), true);
check('the table is scrollable rather than overflowing the page', channels.includes('overflow-x-auto'), true);
check('and carries a caption for screen readers', channels.includes('<caption'), true);
check('the entry flow lives in the rail', /panel=\{[\s\S]*?<ChannelEntry/.test(channels), true);

// ---------------------------------------------------------------------------
// The campaign list invents nothing
// ---------------------------------------------------------------------------

const campaigns = code(CAMPAIGNS);
check(
  'no campaign lifecycle is invented — nothing stores "active" or "draft"',
  /'(active|draft|paused|archived)'/i.test(campaigns),
  false,
);
check('filters are built from what a campaign actually holds',
  campaigns.includes("{ id: 'shortlisted'") && campaigns.includes("{ id: 'empty'"), true);
check('the list shows the candidate count against the real limit', campaigns.includes('of 5'), true);
check('an unlinked legacy brand is shown as unlinked rather than hidden',
  campaigns.includes('unlinked'), true);
check('the brand filter comes from saved brands', campaigns.includes('getBrands'), true);
check('and an agency sees its clients named as clients', campaigns.includes("'All clients'"), true);

// ---------------------------------------------------------------------------
// The campaign decision page
// ---------------------------------------------------------------------------

// Candidate interactions now live in CampaignWorkspace and are exercised in the
// browser (selection, dialogs, draft persistence, mobile and print privacy).
// State semantics have behavioral checks rather than pinning JSX copy/layout.
import './verify-campaign-review';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const settings = code(SETTINGS);
check('sections are named for customers', settings.includes("'Brand profiles'") && settings.includes("'Sharing and reports'"), true);
check('the rail shows the workspace and its type', settings.includes('viewer.organization.name'), true);
check('an unset account type says so rather than defaulting to brand',
  settings.includes("'Account type not set'"), true);
check('no operator configuration is exposed', /ADFIT_|operator|environment variable/i.test(settings), false);
check('and nothing here could enable restricted analysis', /AMENDMENT_ACCEPTED/.test(settings), false);
check('sharing keeps revoke and expiry', settings.includes('revokeShare') && settings.includes('Expires'), true);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
