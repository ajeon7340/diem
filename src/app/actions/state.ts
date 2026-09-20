import type { CampaignState, CandidateState } from './campaign';
import type { OnboardingState, WorkspaceState } from './onboarding';
import type { TrendingExplainState } from './trending';
import type { ReferenceState } from './reference';
import type { DiscoveryState } from './discovery';
import type { BrandState } from './brand';
import type { MagicLinkState } from '@/lib/auth/actions';

/**
 * Initial `useFormState` values for every server action.
 *
 * They live here, apart from the actions themselves, because a `'use server'`
 * module MAY ONLY EXPORT ASYNC FUNCTIONS. React validates that when the module
 * is evaluated and throws:
 *
 *     A "use server" file can only export async functions, found object.
 *
 * These constants used to sit beside their actions, and the consequence was
 * not a warning. On a production build every action in an offending module
 * returned a 500 — including `submitProposal`, which is the whole of the Track
 * A inbound funnel: a brand clicking "Request access" got a failed POST. It
 * survived review because `next dev` tolerates it and the pages still RENDER
 * fine; only the action call fails, and only in a built server.
 *
 * Types are erased before they reach the runtime module, so `export interface`
 * beside an action is safe and stays where it is. A value is not.
 *
 * Anything added here follows the same rule: if it is not an async function,
 * it does not belong in a file that begins with 'use server'.
 */

export const INITIAL_CAMPAIGN_STATE: CampaignState = { status: 'idle' };
export const INITIAL_CANDIDATE_STATE: CandidateState = { status: 'idle' };
export const INITIAL_ONBOARDING_STATE: OnboardingState = { status: 'idle' };
export const INITIAL_WORKSPACE_STATE: WorkspaceState = { status: 'idle' };
export const INITIAL_TRENDING_EXPLAIN: TrendingExplainState = {
  status: 'idle',
  videoId: null,
  message: '',
  summary: null,
};
// Not under app/actions/, which is how it was missed: the rule is about the
// 'use server' directive, not about the directory.
export const INITIAL_MAGIC_LINK_STATE: MagicLinkState = { status: 'idle' };

export const INITIAL_DISCOVERY: DiscoveryState = {};

export const INITIAL_BRAND: BrandState = { status: 'idle' };

export const INITIAL_REFERENCE: ReferenceState = {
  status: 'idle',
  message: '',
  result: null,
  channelId: null,
  saved: false,
};
