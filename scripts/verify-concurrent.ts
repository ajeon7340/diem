/**
 * Assertions for bounded concurrency.
 *
 *   npm run verify:concurrent
 *
 * The batch passes run in parallel now, and `labels` is parallel to `comments`
 * BY POSITION — `rollUpAxes` and `buildClusters` both read it that way. Results
 * arriving out of order and being pushed as they land would put every label on
 * a different comment: a plausible report about the wrong things, with no error
 * anywhere. Order is the contract this file exists to hold.
 */
import { mapConcurrent } from '@/lib/ingest/concurrent';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.error(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Deliberately inverted timings: the last item finishes first. Pushing on
  // completion would reverse the list.
  const items = [40, 30, 20, 10, 1];
  const ordered = await mapConcurrent(items, 3, async (ms) => {
    await sleep(ms);
    return ms;
  });
  check('results keep input order, not finish order', ordered, items);

  // The bound is a bound.
  let inFlight = 0, peak = 0;
  await mapConcurrent(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
    inFlight++; peak = Math.max(peak, inFlight);
    await sleep(5);
    inFlight--;
  });
  check('never exceeds the limit', peak <= 4, true);
  check('and actually uses it', peak, 4);

  // Everything runs exactly once.
  const seen: number[] = [];
  await mapConcurrent([1, 2, 3, 4, 5, 6, 7], 3, async (n) => { seen.push(n); });
  check('every item is worked once', seen.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);

  // A failure stops the run rather than paying for the rest. ClaimLostError
  // means another worker holds the job; finishing the in-flight batches would
  // buy answers nobody will store.
  let started = 0;
  let thrown: unknown = null;
  try {
    await mapConcurrent(Array.from({ length: 30 }, (_, i) => i), 2, async (n) => {
      started++;
      await sleep(2);
      if (n === 1) throw new Error('claim lost');
    });
  } catch (error) { thrown = error; }
  check('the original error reaches the caller', (thrown as Error)?.message, 'claim lost');
  check('and the rest are not started', started < 30, true);

  check('an empty list is fine', await mapConcurrent([], 4, async () => 1), []);
  check('a limit below one still runs', await mapConcurrent([1, 2], 0, async (n) => n * 2), [2, 4]);

  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
