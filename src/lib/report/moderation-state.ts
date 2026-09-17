/**
 * Form state for the moderation action.
 *
 * Apart from the action because a `'use server'` module may only export async
 * functions — an exported object takes every action in the module down with it
 * on a production build. See src/app/actions/state.ts.
 */
export interface ModerateState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  /** Which row the message belongs to, so one failure does not shout at all of them. */
  queueId?: string;
}

export const INITIAL_MODERATE_STATE: ModerateState = { status: 'idle' };
