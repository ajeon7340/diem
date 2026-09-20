/**
 * One bounded, read-only discovery run against the real API.
 *
 *   npm run discovery:check -- --mode criteria --q "hand grinder"
 *   npm run discovery:check -- --mode similar  --channel @veritasium
 *
 * WHY THIS IS SEPARATE FROM `npm run verify`. The verify suite runs on
 * fixtures: deterministic, offline, free. This spends real quota against a real
 * key, and a check that costs money must be asked for rather than ridden along
 * with everything else. It also WRITES NOTHING — no database, no job, no cache.
 * It proves the one thing fixtures cannot: that the parameters we send are
 * parameters YouTube accepts, and that what comes back has the shape the
 * pipelines read.
 *
 * The bound is deliberately smaller than the product's own: two searches.
 */
import { runCollaborations } from '@/lib/discovery/competitors';
import { runCriteria } from '@/lib/discovery/criteria';
import { runSimilar } from '@/lib/discovery/similar';
import { discoveryLimits } from '@/lib/discovery/limits';
import { liveRetriever } from '@/lib/discovery/retriever-live';
import { criteriaSchema, similarSchema } from '@/lib/discovery/schemas';
import { QuotaLedger, SEARCH_COST_SOURCE, searchUnitCost } from '@/lib/youtube/quota';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';

function arg(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
}

async function main() {
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('  YOUTUBE_API_KEY is not set. Run through npm so --env-file=.env.local applies.');
    process.exit(1);
  }

  const mode = arg('mode') ?? 'criteria';
  const limits = { ...discoveryLimits(), searchCalls: 2, queries: 2, candidates: 15, units: 20 };
  const retriever = liveRetriever(new QuotaLedger({ units: limits.units, searchCalls: limits.searchCalls }));

  console.log(`\n  live check · ${mode} · ≤${limits.searchCalls} searches · ≤${limits.units} units`);
  console.log(`  search billed at ${searchUnitCost()} unit(s) — source: ${SEARCH_COST_SOURCE.url} (${SEARCH_COST_SOURCE.readAt})`);
  console.log(`  derived analysis ${AMENDMENT_ACCEPTED ? 'CONFIGURED' : 'gated'} — ranking ${AMENDMENT_ACCEPTED ? 'on' : 'off'}\n`);

  const started = Date.now();
  const result =
    mode === 'competitor'
      ? // A brand typed on the command line is confirmed by the act of typing
        // it. This bypasses no gate: `runCollaborations` takes confirmed brands
        // and the database is what refuses an unconfirmed one in the product.
        await runCollaborations(retriever, [{ name: arg('brand') ?? 'Comandante', products: [] }], limits)
      : mode === 'similar'
      ? await runSimilar(
          retriever,
          similarSchema.parse({ channel: arg('channel') ?? '@veritasium', dimensions: [] }),
          limits,
        )
      : await runCriteria(
          retriever,
          criteriaSchema.parse({ keywords: arg('q') ?? 'hand grinder', product: null, formats: [] }),
          limits,
        );

  if (result.reference) {
    console.log(`  reference  ${result.reference.title} (${result.reference.handle ?? 'no handle'})`);
    console.log(`             ${result.reference.sampleSize} uploads sampled\n`);
  }

  console.log(`  queries    ${result.coverage.queries.map((q) => `"${q}"`).join(', ') || 'none'}`);
  console.log(`  spent      ${result.coverage.searchCalls} searches · ${result.coverage.otherCalls} reads · ${result.coverage.unitsSpent} units`);
  console.log(`  read       ${result.coverage.resultsSeen} results`);
  console.log(`  stopped    ${result.coverage.stoppedBecause}`);
  console.log(`  candidates ${result.candidates.length}${result.emptyReason ? ` (${result.emptyReason})` : ''}\n`);

  for (const candidate of result.candidates.slice(0, 5)) {
    const subs =
      candidate.subscribers === null
        ? candidate.hiddenSubscribers
          ? 'subscribers hidden'
          : 'subscribers not reported'
        : `${candidate.subscribers.toLocaleString('en-US')} subscribers`;
    console.log(`  · ${candidate.title}  ${candidate.handle ?? ''}  ${subs}`);
    console.log(`    ${candidate.reason}`);
    console.log(
      `    evidence: ${candidate.evidence.length} video(s)` +
        (candidate.relevance
          ? ` · ${candidate.relevance.band} · ${Math.round(candidate.relevance.evidenceCoverage * 100)}% of signals measured`
          : ' · not ranked (approval not configured)'),
    );
  }

  for (const candidate of result.candidates.slice(0, 5)) {
    for (const record of candidate.collaborations.slice(0, 2)) {
      console.log(`\n    ${record.classification.toUpperCase()}  ${record.brand}  "${record.videoTitle}"`);
      console.log(`    ${record.ambiguity}`);
    }
  }

  for (const note of result.notes) console.log(`\n  note: ${note}`);
  console.log(`\n  ${Math.round((Date.now() - started) / 1000)}s. Nothing was written.`);
}

main().catch((err) => {
  console.error('\n  live check failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
