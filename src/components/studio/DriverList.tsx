import type { Driver } from '@/lib/report/drivers';
import { Badge } from '@/components/ui/Badge';
import { compactNumber } from '@/lib/format';
import { cn } from '@/lib/cn';

const TONE: Record<Driver['verdict'], 'emerald' | 'rose' | 'slate' | 'amber'> = {
  raises: 'emerald',
  lowers: 'rose',
  'no effect': 'slate',
  inconclusive: 'amber',
  'not enough posts': 'slate',
};

/**
 * What moves views in one catalogue.
 *
 * Every row prints its two sample sizes, and a row that cannot clear the floor
 * prints why instead of a multiple. That is the whole design: a creator acts on
 * this, so a number that is really noise costs them their next video. The panel
 * would rather say "not enough posts" eight times than be confidently wrong
 * once.
 */
export function DriverList({ drivers }: { drivers: Driver[] }) {
  const readable = drivers.filter((d) => d.verdict === 'raises' || d.verdict === 'lowers');

  return (
    <div>
      {readable.length === 0 ? (
        <p className="mb-3 rounded-md bg-paper px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
          Nothing in this catalogue clears the bar yet. That is a finding, not a gap — it means no
          format tested here reliably beats the others, and the next post is as good a bet as any.
        </p>
      ) : null}

      <ul className="divide-y divide-line border-y border-line">
        {drivers.map((d) => (
          <li key={d.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
            <span className="min-w-[180px] flex-1 text-[13px] text-ink">{d.label}</span>

            <span className="tnum text-[12px] text-ink-faint">
              {d.withN} / {d.withN + d.withoutN}
            </span>

            {d.ratio !== null ? (
              <span
                className={cn(
                  'tnum w-[52px] text-right text-[13px] font-medium',
                  d.verdict === 'raises'
                    ? 'text-emerald'
                    : d.verdict === 'lowers'
                      ? 'text-rose'
                      : 'text-ink-muted',
                )}
              >
                {d.ratio.toFixed(2)}×
              </span>
            ) : (
              <span className="tnum w-[52px] text-right text-[13px] text-ink-faint">—</span>
            )}

            <Badge tone={TONE[d.verdict]}>{d.verdict}</Badge>

            <p className="w-full text-[11px] leading-relaxed text-ink-muted">
              {d.note}
              {d.ratio !== null && d.p !== null ? (
                <span className="tnum text-ink-faint">
                  {' '}
                  · {compactNumber(d.withMedian)} vs {compactNumber(d.withoutMedian)} median views ·
                  p={d.p.toFixed(3)}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Each row compares posts in this catalogue that have the feature against those that do not,
        using a rank test — view counts are too heavy-tailed for averages, where one viral post
        would decide every answer. Both sides need at least 8 posts before a multiple is shown.
      </p>
    </div>
  );
}
