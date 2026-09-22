'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Narrow the report to a slice of the uploads that were collected.
 *
 * THIS COLLECTS NOTHING. Every figure in the report is computed from uploads
 * already read on the collection date; moving these dates re-reads the same
 * sample over a shorter span. It costs no quota, reaches no new video, and
 * cannot show an upload the collection did not find. Widening past the sample's
 * own range therefore adds nothing, which is why the inputs are bounded by it.
 *
 * COLLECTING A DIFFERENT PERIOD IS A DIFFERENT CONTROL — "Refresh" in the
 * actions, which spends quota and replaces the snapshot. Two things that look
 * alike and cost differently must not share a control.
 *
 * THE RANGE IS IN THE URL, so a narrowed report is a link somebody can send,
 * and so the server recomputes every figure over the same filtered set rather
 * than the client hiding rows from charts that were drawn over all of them.
 */
export function ReportRange({
  from,
  to,
  min,
  max,
  shown,
  total,
}: {
  from: string | null;
  to: string | null;
  /** The sample's own earliest and latest publication dates, as YYYY-MM-DD. */
  min: string;
  max: string;
  shown: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function apply(next: { from?: string | null; to?: string | null }) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    start(() => router.replace(`${pathname}?${query}`, { scroll: false }));
  }

  /** Presets read backwards from the LAST UPLOAD, not from today: a report
   *  collected three weeks ago has no uploads in "the last 30 days". */
  function preset(days: number | null) {
    if (days === null) return apply({ from: null, to: null });
    const end = Date.parse(max);
    apply({ from: new Date(end - days * 86_400_000).toISOString().slice(0, 10), to: null });
  }

  const active = Boolean(from || to);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] print:hidden">
      <div className="flex items-center gap-1" role="group" aria-label="Sample period">
        {(
          [
            [null, 'All'],
            [30, '30 days'],
            [90, '90 days'],
          ] as const
        ).map(([days, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => preset(days)}
            aria-pressed={days === null ? !active : false}
            className={`press min-h-8 rounded-[var(--r-md)] px-2.5 font-medium transition-colors duration-150 ${
              days === null && !active
                ? 'bg-indigo text-white'
                : 'text-ink-muted hover:bg-black/[0.04] hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-1.5 text-ink-muted">
        <span className="sr-only sm:not-sr-only">From</span>
        <input
          type="date"
          value={from ?? min}
          min={min}
          max={to ?? max}
          onChange={(event) => apply({ from: event.target.value === min ? null : event.target.value })}
          className="tnum min-h-8 rounded-[var(--r-md)] border border-line bg-surface px-2 text-[12px] text-ink"
        />
      </label>
      <label className="flex items-center gap-1.5 text-ink-muted">
        <span className="sr-only sm:not-sr-only">to</span>
        <input
          type="date"
          value={to ?? max}
          min={from ?? min}
          max={max}
          onChange={(event) => apply({ to: event.target.value === max ? null : event.target.value })}
          className="tnum min-h-8 rounded-[var(--r-md)] border border-line bg-surface px-2 text-[12px] text-ink"
        />
      </label>

      <span className="tnum text-ink-faint" aria-live="polite">
        {pending ? 'Updating…' : shown === total ? `${total} uploads` : `${shown} of ${total} uploads`}
      </span>
    </div>
  );
}
