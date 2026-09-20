/**
 * The sign-up journey, asserted at its decision points.
 *
 * Entry → sign in → workspace → confirm channel → analyse. Every hop carries
 * the channel the visitor typed before they had an account, and every hop can
 * drop it. These are the cheap checks that catch that: the expensive one is a
 * person typing a channel, receiving an email, and landing on an empty form.
 *
 *   npm run verify:onboarding-flow
 */
import { readFileSync } from 'node:fs';

import { channelDestination, channelInput, freshData, nextStep, reportState } from '@/lib/channel/state';
import type { AnalysisJob } from '@/types';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}

const CH = 'https://www.youtube.com/@mkbhd';
const ENC = encodeURIComponent(CH);

// ---------------------------------------------------------------------------
// Returning-user routing
//
// One function, three call sites — the channels page, the onboarding page and
// the post-sign-in dispatcher. They have to agree: a visitor bounces between
// all three in a single sign-up, and disagreement is a redirect loop rather
// than an error anybody sees.
// ---------------------------------------------------------------------------
check('a stranger is sent to sign up', nextStep({ signedIn: false, hasWorkspace: false }, CH), `/join/business?channel=${ENC}`);
check('signed in without a workspace names one', nextStep({ signedIn: true, hasWorkspace: false }, CH), `/onboarding/business?channel=${ENC}`);
check('a returning user SKIPS workspace setup', nextStep({ signedIn: true, hasWorkspace: true }, CH), `/channels?channel=${ENC}`);
check(
  'and a workspace cannot be reached by claiming one while signed out',
  nextStep({ signedIn: false, hasWorkspace: true }, CH),
  `/join/business?channel=${ENC}`,
);

// The channel is optional at every step: somebody who signs in from the header
// has typed nothing, and must not land on `?channel=undefined`.
check('no channel yields a clean path', nextStep({ signedIn: true, hasWorkspace: true }, null), '/channels');
check('and so does an empty one', nextStep({ signedIn: true, hasWorkspace: false }, '   '), '/onboarding/business');

// ---------------------------------------------------------------------------
// Input preservation, including the shapes that break naive round-tripping
// ---------------------------------------------------------------------------
check('a full URL survives encoding', channelDestination(CH), `/channels?channel=${ENC}`);
check('a bare handle survives', channelDestination('@mkbhd'), '/channels?channel=%40mkbhd');
check(
  'a non-ASCII handle survives',
  channelDestination('@가재맨'),
  `/channels?channel=${encodeURIComponent('@가재맨')}`,
);
check('a URL with its own query survives', channelDestination('https://youtube.com/@a?si=x&t=1'), `/channels?channel=${encodeURIComponent('https://youtube.com/@a?si=x&t=1')}`);
check('whitespace is trimmed, not preserved', channelInput('  @mkbhd  '), '@mkbhd');
check('input is bounded', channelInput('x'.repeat(500)).length, 200);
check('a non-string is not a channel', channelInput({ toString: () => '@evil' }), '');

// THE INPUT IS NEVER THE DESTINATION. It arrives from a query string, so a
// value shaped like a path or a host must stay a parameter.
check('a protocol-relative host cannot become the destination', channelDestination('//evil.test'), '/channels?channel=%2F%2Fevil.test');
check('nor an absolute URL', channelDestination('https://evil.test/x'), `/channels?channel=${encodeURIComponent('https://evil.test/x')}`);
check('nor a traversal', channelDestination('../../admin'), `/channels?channel=${encodeURIComponent('../../admin')}`);
check('nor a newline injection', channelDestination('a\r\nLocation: /evil'), `/channels?channel=${encodeURIComponent('a\r\nLocation: /evil')}`);

// ---------------------------------------------------------------------------
// Existing-report reuse
//
// "Current" is what decides whether the confirmation screen offers View report
// or only collection. It is the same predicate the read path uses, so a report
// offered here can always actually be opened.
// ---------------------------------------------------------------------------
const now = Date.now();
check('a report collected today is reusable', freshData(new Date(now - 3_600_000).toISOString(), now), true);
check('at 29 days it is still reusable', freshData(new Date(now - 29 * 86_400_000).toISOString(), now), true);
check('at 31 days it is not', freshData(new Date(now - 31 * 86_400_000).toISOString(), now), false);
check('a channel never collected is not', freshData(null, now), false);
check('and neither is a future timestamp', freshData(new Date(now + 60_000).toISOString(), now), false);

// ---------------------------------------------------------------------------
// Work that has not run is never a poor result
//
// The requirement this encodes: nothing unrun may render as a low score or as
// insufficient evidence. Those are conclusions; "we have not looked" is not.
// ---------------------------------------------------------------------------
const job = (status: AnalysisJob['status']) => ({ status }) as AnalysisJob;
check('nothing queued and nothing stored is Not started', reportState([], false, 0), 'Not started');
check('queued is queued', reportState([job('queued')], false, 0), 'Queued');
check('running is running', reportState([job('running')], false, 0), 'Running');
check('running wins over a queued sibling', reportState([job('queued'), job('running')], false, 0), 'Running');
check('a failure with nothing stored is Failed, not empty', reportState([job('failed')], false, 0), 'Failed');
check('a failure beside a stored report is partial', reportState([job('failed')], true, 10), 'Partially completed');
check(
  'insufficient evidence requires a report to have been collected',
  reportState([], true, 0),
  'Completed with insufficient evidence',
);
check('a complete report with a sample is complete', reportState([], true, 10), 'Completed');
// The distinction that matters most, stated as one assertion: an unrun pass and
// a pass that ran and found nothing must never share a label.
check(
  'unrun and empty-result never collide',
  reportState([], false, 0) === reportState([], true, 0),
  false,
);

// ---------------------------------------------------------------------------
// Workspace settings: the two answers signup asks for, and only those
//
// Asserted against the source because the constraint is a GRANT, not a type.
// 0001 grants `update (name)` and 0037 grants `update (customer_type)`; every
// other column on `organizations` is unreachable from a client, `billing_plan`
// most of all. A field added to this form that is not one of those two fails
// at the database rather than being silently ignored, so the form and the
// grants have to be kept in step deliberately.
// ---------------------------------------------------------------------------
{
  const action = readFileSync('src/app/actions/onboarding.ts', 'utf8');
  const updateBody = action.slice(action.indexOf('export async function updateWorkspace'));
  const updated = [...updateBody.matchAll(/\.update\(\{([^}]*)\}\)/g)].map((m) => m[1]).join(' ');

  check('the workspace update writes the name', /name,?/.test(updated), true);
  check('and the customer type', /customer_type/.test(updated), true);
  for (const column of ['billing_plan', 'stripe_customer_id', 'id']) {
    check(`and never ${column}`, updated.includes(column), false);
  }
  check(
    'it refuses a customer type outside the vocabulary',
    /customerType !== 'brand' && customerType !== 'agency'/.test(updateBody),
    true,
  );
  check('and bounds the name', /length < 2 \|\| name\.length > 120/.test(updateBody), true);
  check(
    'a member who may not edit is not told what they are missing',
    /Only a workspace owner or admin can/.test(updateBody),
    true,
  );

  // The form offers exactly the editable pair, prefilled.
  const form = readFileSync('src/components/settings/WorkspaceForm.tsx', 'utf8');
  const named = [...form.matchAll(/name="([a-zA-Z_]+)"/g)].map((m) => m[1]);
  check('the settings form posts only those two fields', [...new Set(named)].sort(), [
    'customerType',
    'organizationName',
  ]);
  check('the name is prefilled, not blank', /defaultValue=\{name\}/.test(form), true);
  check('and the stored type is preselected', /defaultChecked=\{customerType === type\}/.test(form), true);
}

// ---------------------------------------------------------------------------
// The customer type has to be used, or requiring it is asking for nothing
// ---------------------------------------------------------------------------
{
  const campaignForm = readFileSync('src/components/campaign/CampaignForm.tsx', 'utf8');
  check(
    'an agency names the client on the brand field',
    /customerType === 'agency' \? 'Client brand' : 'Brand'/.test(campaignForm),
    true,
  );
  check(
    'and is told each campaign can name a different one',
    /Each campaign can name a different one/.test(campaignForm),
    true,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
