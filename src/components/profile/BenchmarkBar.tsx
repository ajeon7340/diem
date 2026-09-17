import type { Benchmark } from '@/types';
import { cn } from '@/lib/cn';

/**
 * Percentile against the cohort, drawn as a position on a track with the
 * median marked. A raw score is not a decision input — "78.4" means nothing
 * until you know the category median is 64.1.
 */
export function BenchmarkBar({ benchmark, locked }: { benchmark: Benchmark | null; locked: boolean }) {
  const percentile = locked ? 50 : (benchmark?.percentile ?? 50);
  const strong = !locked && percentile >= 75;
  const weak = !locked && percentile < 40;

  return (
    <div className="mt-3">
      <div className="relative h-1 w-full rounded-full bg-paper">
        {/* Cohort median sits at the 50th percentile by definition. */}
        <span
          className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-line-strong"
          style={{ left: '50%' }}
          aria-hidden
        />
        <div
          className={cn(
            'h-full rounded-full',
            strong ? 'bg-emerald' : weak ? 'bg-amber' : 'bg-indigo',
          )}
          style={{ width: `${Math.min(100, Math.max(2, percentile))}%` }}
        />
      </div>
      <p className="tnum mt-1.5 text-[10px] text-ink-faint">
        {locked || !benchmark ? (
          '—'
        ) : (
          <>
            <span className={cn(strong && 'text-emerald', weak && 'text-amber')}>
              {ordinal(benchmark.percentile)} pct
            </span>{' '}
            · median {formatByMetric(benchmark.metric, benchmark.cohortMedian)}
          </>
        )}
      </p>
    </div>
  );
}

function ordinal(value: number): string {
  const n = Math.round(value);
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

function formatByMetric(metric: Benchmark['metric'], value: number): string {
  return metric === 'purchaseIntent' || metric === 'engagement'
    ? `${(value * 100).toFixed(1)}%`
    : value.toFixed(1);
}
