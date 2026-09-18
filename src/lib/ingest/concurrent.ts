import 'server-only';

/**
 * Run bounded work in parallel, preserving order.
 *
 * The batch passes were sequential and the batches are independent: 31 model
 * calls at ~19 seconds each is 596 seconds of mostly waiting on a socket, from
 * a signup that says the figures appear shortly.
 *
 * ORDER IS THE WHOLE CONTRACT. `labels` is parallel to `comments` BY POSITION
 * — `rollUpAxes` and `buildClusters` both read it that way — so results are
 * written into a preallocated slot rather than pushed as they land. Pushing
 * would shuffle every label onto a different comment under concurrency, which
 * is the kind of defect that produces a plausible report about the wrong
 * things and no error anywhere.
 *
 * A REJECTION STOPS THE RUN. `ClaimLostError` means another worker holds the
 * job and this one must not keep spending; letting the remaining in-flight
 * batches settle first would pay for answers nobody will store.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed: unknown = null;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      if (failed !== null) return;
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        // First failure wins and the rest stop claiming work. Rethrown by the
        // caller below so the original error reaches the worker unchanged.
        if (failed === null) failed = error;
        return;
      }
    }
  });

  await Promise.all(runners);
  if (failed !== null) throw failed;
  return results;
}
