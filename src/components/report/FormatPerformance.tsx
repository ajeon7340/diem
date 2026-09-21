import { compact, exact } from '@/lib/channel/highlights';
import { performance, type Performance } from '@/lib/channel/report';
import type { VideoEvidence } from '@/lib/ingest/analyze';

/**
 * What a typical sampled upload received, by duration group.
 *
 * WHAT THIS ANSWERS: "if they publish one of these, what did the last ones
 * get?" A median alone cannot answer it — a median of 678K over uploads
 * spanning 182K to 3.1M is a different proposition from the same median over
 * uploads spanning 600K to 750K, and the old table printed both identically.
 * So the middle 50% is drawn where the sample supports one, the full range sits
 * behind it as secondary, and the median is the tick.
 *
 * THE MIDDLE 50% IS WITHHELD BELOW EIGHT REPORTING UPLOADS. Quartiles over five
 * values are two videos wide and read as a precision the sample has not earned;
 * `performance()` returns null for them and this renders the values themselves
 * instead, which is more honest and, at that size, more useful.
 *
 * NO ADJECTIVES. Nothing here is called strong, consistent, stable, reliable or
 * predictable. Those are claims about a process, this is one bounded sample
 * read once, and a single snapshot cannot support any of them.
 *
 * THE GROUPS ARE DURATION, AND THE LABELS SAY SO. Public metadata does not
 * identify a Short; three minutes or less is a proxy and is named as one
 * everywhere it appears.
 */

const GROUP_LABEL: Record<VideoEvidence['format'], string> = {
  long: 'Long-form, over 3 min',
  short: 'Short, 3 min or less (duration proxy)',
  unknown: 'Duration not reported',
};

export function FormatPerformance({
  videos,
  collectedAt,
  only = 'all',
}: {
  videos: VideoEvidence[];
  collectedAt: string;
  /** A format filter from the page, or 'all'. */
  only?: string;
}) {
  const now = Date.parse(collectedAt);
  const groups = (['long', 'short', 'unknown'] as const)
    .filter((f) => only === 'all' || only === f)
    .map((format) => ({ format, videos: videos.filter((v) => v.format === format) }))
    .filter((g) => g.videos.length > 0)
    .map((g) => ({ ...g, p: performance(g.videos, now) }));

  if (groups.length === 0) {
    return <p className="text-[12px] text-ink-muted">No sampled upload reported a duration or a view count.</p>;
  }

  // One scale across every group, or a long-form bar and a short bar that look
  // the same length would mean different things.
  const ceiling = Math.max(...groups.map((g) => g.p.max ?? 0), 1);

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {groups.map(({ format, p }) => (
          <li key={format} className="avoid-break">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-[12px] font-medium text-ink">{GROUP_LABEL[format]}</p>
              <p className="tnum text-[11px] text-ink-faint">
                {p.sampled} sampled
                {p.n !== p.sampled ? ` · ${p.n} reported a view count` : ''}
              </p>
            </div>
            {p.median === null ? (
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                None of these reported a view count, so there is no median. Unknown, not zero.
              </p>
            ) : (
              <>
                <Strip p={p} ceiling={ceiling} />
                {/* A GROUP OF ONE HAS NO DISTRIBUTION. "15.1K median, range
                    15.1K–15.1K, too few to quote a middle 50%" is one number
                    said three times; the honest rendering is the number. */}
                {p.n === 1 ? (
                  <p className="tnum mt-1 text-[11px] text-ink-muted">
                    One upload, at <span className="text-ink" title={exact(p.median)}>{compact(p.median)} views</span>.
                    A single upload is not a distribution.
                  </p>
                ) : (
                  <p className="tnum mt-1 text-[11px] text-ink-muted">
                    <span className="text-ink" title={exact(p.median)}>
                      {compact(p.median)} median
                    </span>
                    {p.p25 !== null && p.p75 !== null ? (
                      <> · middle 50% {compact(p.p25)}–{compact(p.p75)}</>
                    ) : null}
                    <span className="text-ink-faint"> · range {compact(p.min)}–{compact(p.max)} over {p.n}</span>
                  </p>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-relaxed text-ink-muted">
        Views as measured on the collection date, over uploads of different ages — a recent upload
        has had less time to accumulate. Public metadata does not identify Shorts; three minutes or
        less is a duration <strong className="font-medium">proxy</strong> and can include non-Shorts.
        {groups.some((g) => g.p.n >= 2 && g.p.p25 === null)
          ? ' A middle 50% is quoted only where at least eight uploads reported a count.'
          : ''}
        {groups.some((g) => g.p.excludedLive + g.p.excludedUpcoming > 0)
          ? ' Live broadcasts and scheduled premieres are excluded.'
          : ''}
      </p>
    </div>
  );
}

/**
 * Range behind, middle 50% in front, median as a tick.
 *
 * Nothing is clipped. A group whose maximum is twenty times its median draws a
 * very long thin line and a very small box, which is the honest picture of that
 * group and the reason the box exists at all.
 */
function Strip({ p, ceiling }: { p: Performance; ceiling: number }) {
  const pct = (value: number) => `${Math.min((value / ceiling) * 100, 100)}%`;
  const min = p.min ?? 0;
  const max = p.max ?? 0;
  const box = p.p25 !== null && p.p75 !== null ? { from: p.p25, to: p.p75 } : null;

  return (
    <div className="relative mt-1.5 h-4" aria-hidden>
      {/* Full range. */}
      <span
        className="absolute top-1/2 h-px -translate-y-1/2 bg-line-strong"
        style={{ left: pct(min), width: pct(Math.max(max - min, ceiling * 0.004)) }}
      />
      {box ? (
        <span
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-indigo/25"
          style={{ left: pct(box.from), width: pct(Math.max(box.to - box.from, ceiling * 0.004)) }}
        />
      ) : null}
      {(p.median !== null ? [p.median] : []).map((value) => (
        <span
          key={value}
          className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-indigo"
          style={{ left: pct(value) }}
        />
      ))}
    </div>
  );
}
