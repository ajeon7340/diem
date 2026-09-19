import type { BriefFormState } from './campaign-brief';
import type { OfferFormState, OfferDecisionState } from './offer';
import type { OnboardingState } from './onboarding';
import type { ProposalFormState } from './request-access';
import type { ReviewState } from './review-request';
import type { SettingsState, RevokeState } from './settings';
import type { TrendingExplainState } from './trending';
import type { ExplainState } from './studio';
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

export const INITIAL_BRIEF_STATE: BriefFormState = { status: 'idle' };
export const INITIAL_OFFER_STATE: OfferFormState = { status: 'idle' };
export const INITIAL_OFFER_DECISION: OfferDecisionState = { status: 'idle' };
export const INITIAL_ONBOARDING_STATE: OnboardingState = { status: 'idle' };
export const INITIAL_PROPOSAL_STATE: ProposalFormState = { status: 'idle' };
export const INITIAL_REVIEW_STATE: ReviewState = { status: 'idle' };
export const INITIAL_SETTINGS_STATE: SettingsState = { status: 'idle' };
export const INITIAL_REVOKE_STATE: RevokeState = { status: 'idle' };
export const INITIAL_TRENDING_EXPLAIN: TrendingExplainState = {
  status: 'idle',
  videoId: null,
  message: '',
  summary: null,
};
export const INITIAL_EXPLAIN: ExplainState = {
  status: 'idle',
  message: '',
  result: null,
  comments: null,
  summary: null,
  summaryModel: null,
};
// Not under app/actions/, which is how it was missed: the rule is about the
// 'use server' directive, not about the directory.
export const INITIAL_MAGIC_LINK_STATE: MagicLinkState = { status: 'idle' };
