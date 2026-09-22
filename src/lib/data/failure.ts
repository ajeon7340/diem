import 'server-only';

/**
 * What to tell somebody when a write fails.
 *
 * "PLEASE TRY AGAIN" WAS THE ANSWER TO EVERYTHING, and for the commonest
 * failure it was false: a table that does not exist because a migration was
 * never applied fails identically on every retry, forever. A customer who
 * presses Search, reads "try again", presses it again and reads it again has
 * been told to do the one thing that cannot work — and nothing in the sentence
 * tells them, or whoever administers the workspace, what would.
 *
 * THREE OUTCOMES, because three different people can act on them:
 *
 *   setup      The schema is not there. Nobody using the product can fix it;
 *              whoever deployed it can, in a minute. Say that, without
 *              printing the table name — which is implementation detail — but
 *              log the whole error where an operator will find it.
 *   denied     The row exists and this session may not touch it. Retrying is
 *              also pointless, and the honest answer is that the workspace
 *              does not have access, not that something went wrong.
 *   retry      Genuinely transient: a timeout, a dropped connection. Here
 *              "try again" is true, so it is the only place it is said.
 *
 * NO RAW ERROR REACHES THE CUSTOMER. The codes and messages go to the server
 * log; the sentence returned names what happened and who can act on it.
 */
export type FailureKind = 'setup' | 'denied' | 'retry';

interface Postgrestish {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

/** Undefined table, undefined column, or PostgREST's schema-cache misses. */
const SETUP_CODES = new Set(['42P01', '42703', '42883', '42704', 'PGRST202', 'PGRST204', 'PGRST205']);
/** Insufficient privilege, and the RLS check that returns as a violation. */
const DENIED_CODES = new Set(['42501', 'PGRST301', 'PGRST116']);

export function classifyWriteFailure(error: unknown): FailureKind {
  const code = (error as Postgrestish | null)?.code ?? '';
  if (SETUP_CODES.has(code)) return 'setup';
  if (DENIED_CODES.has(code)) return 'denied';
  // PostgREST reports a missing relation as a 404 with prose when the schema
  // cache is stale, which is the same operator problem by another name.
  const message = ((error as Postgrestish | null)?.message ?? '').toLowerCase();
  if (message.includes('could not find the table') || message.includes('does not exist')) return 'setup';
  return 'retry';
}

/**
 * One sentence, naming what happened and who can act.
 *
 * `subject` completes "Could not ___" — "start this search", "save this brand".
 */
export function describeWriteFailure(error: unknown, subject: string, where: string): string {
  const kind = classifyWriteFailure(error);
  // The whole error, once, where an operator reads logs — never in the UI.
  console.error(`[${where}] write failed (${kind})`, error);

  if (kind === 'setup') {
    return `Could not ${subject}: this workspace is not finished being set up. Nothing you can do from here — whoever deployed adfit needs to finish it. Your filters are unchanged.`;
  }
  if (kind === 'denied') {
    return `Could not ${subject}: this workspace does not have access to that. Trying again will not change it.`;
  }
  return `Could not ${subject}. Please try again.`;
}
