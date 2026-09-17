import 'server-only';

/**
 * Reading the worker's bounds from places that lie about emptiness.
 *
 * Both of these look like one-liners and both were wrong as one-liners, in the
 * same way and for the same reason.
 *
 *   Number(process.env.X ?? 900)
 *
 * `??` only catches undefined. An unset variable in a CI environment is very
 * often the EMPTY STRING — a workflow passing an optional input straight
 * through produces exactly that — and `Number('')` is 0, not NaN. So the
 * fallback never fires and the bound becomes zero:
 *
 *   ADFIT_WORKER_MAX_VIDEOS=''  ->  a census of no videos, which finds no
 *                                   comments, writes an empty rollup and marks
 *                                   the job SUCCEEDED. The creator's report
 *                                   then says the scan ran and found nothing.
 *   ADFIT_WORKER_LEASE=''       ->  a claim that has already expired, so every
 *                                   worker reclaims every job from every other.
 *
 * Zero standing in for absent, which this codebase refuses everywhere else it
 * appears, arriving through a language footgun rather than through a decision.
 */

/** A positive finite number from the environment, or the default. */
export function positiveEnv(
  name: string,
  fallback: number,
  // A plain record, not `NodeJS.ProcessEnv`: the only thing this reads is
  // string-or-absent, and the wider type makes the function awkward to call
  // with a literal in a test.
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    // Said out loud. A misconfigured bound that silently uses the default is
    // how a run gets explained later as "it ignored the setting".
    console.error(`  ${name}="${raw}" is not a positive number — using ${fallback}.`);
    return fallback;
  }
  return value;
}

/**
 * The video bound for one job.
 *
 * `params` is operator-supplied JSON, so it carries the same trap plus nulls:
 * `Number(null)` is 0 as well. Infinity is allowed through deliberately — an
 * unbounded full census is a legitimate thing to queue, and it is the only way
 * to ask for one.
 */
export function jobMaxVideos(
  params: Record<string, unknown> | null | undefined,
  fallback: number,
): number {
  const raw = params?.maxVideos;
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isNaN(value) || value <= 0) return fallback;
  return value;
}
