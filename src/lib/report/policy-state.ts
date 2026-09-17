/**
 * Form state for the demographics-grant actions.
 *
 * Apart from the actions themselves because a `'use server'` module may only
 * export async functions — an exported object throws `A "use server" file can
 * only export async functions, found object` and takes every action in the
 * module down with it on a production build. See src/app/actions/state.ts.
 */
export interface DemographicsRequestState {
  status: 'idle' | 'success' | 'error';
  message?: string;
}

export interface GrantReviewState {
  status: 'idle' | 'success' | 'error';
  message?: string;
}

export const INITIAL_DEMOGRAPHICS_REQUEST: DemographicsRequestState = { status: 'idle' };
export const INITIAL_GRANT_REVIEW: GrantReviewState = { status: 'idle' };
