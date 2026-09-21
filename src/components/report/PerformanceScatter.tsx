'use client';

import { useMemo, useState } from 'react';

import { compact, exact, shortDate, thumbnailUrl, videoUrl } from '@/lib/channel/highlights';
import { comparable, performance, setAside } from '@/lib/channel/report';
import type { VideoEvidence } from '@/lib/ingest/analyze';

/**
 * Every sampled upload: when it was published, and how many views it had ON THE
 * DAY THE COLLECTION RAN.
 *
 * THIS IS NOT A TIME SERIES, and the distinction is the whole reason the chart
 * needs a caption. Each point is one video's CURRENT view count plotted at its
 * PUBLICATION date. Read carelessly it looks like growth over time — it is not,
 * and it says nothing about subscribers. A video published last week has had a
 * week to accumulate; one from three months ago has had three months, which is
 * most of what any downward slope to the right actually shows.
 *
 * NOTHING IS CLIPPED. One upload at twenty times the median squashes everything
 * else against the axis, and that is the honest picture — an axis quietly
 * truncated at the 95th percentile hides the single video carrying the channel.
 * The scale is linear and the caption names the maximum.
 *
 * SHAPE AND LABEL, NOT COLOUR. Format is a circle, a triangle or a square, each
 * named in the legend, so the chart survives being printed in grey and being
 * read by somebody who cannot distinguish the two accents.
 *
 * A CHART IS NOT THE ONLY WAY IN. Every point is a focusable control, arrow
 * keys move between them, and the same data sits underneath as a table that
 * needs no pointer, no colour and no JavaScript.
 */

const W = 640;
const H = 260;
const PAD = { top: 16, right: 14, bottom: 34, left: 52 };

type Marker = 'circle' | 'triangle' | 'square';
const MARKER: Record<VideoEvidence['format'], Marker> = {
  long: 'circle',
  short: 'triangle',
  unknown: 'square',
};
const FORMAT_LABEL: Record<VideoEvidence['format'], string> = {
  long: 'Long-form',
  short: 'Short, 3 min or less (duration proxy)',
  unknown: 'Duration not reported',
};

export function PerformanceScatter({
  videos,
  collectedAt,
}: {
  videos: VideoEvidence[];
  collectedAt: string;
}) {
  const eligible = useMemo(() => comparable(videos), [videos]);
  const plotted = useMemo(
    () =>
      eligible
        .filter((v) => v.views !== null && Number.isFinite(Date.parse(v.publishedAt)))
        .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt)),
    [eligible],
  );
  // Kept out of the plot and named underneath rather than drawn at zero: an
  // upload whose view count was not reported has not been watched zero times.
  const unreported = eligible.filter((v) => v.views === null);
  // A live broadcast is still accumulating and a premiere has not been watched
  // at all. Plotting either one at its current count draws a point that means
  // something different from every other point on the chart.
  const aside = useMemo(() => setAside(videos), [videos]);
  const bands = useMemo(() => performance(videos, Date.parse(collectedAt)).ageBands, [videos, collectedAt]);
  const [selected, setSelected] = useState<string | null>(null);

  if (plotted.length === 0) {
    return (
      <p className="text-[12px] text-ink-muted">
        No sampled upload reports both a publication date and a view count, so there is nothing to
        plot. {unreported.length ? `${unreported.length} report no view count.` : ''}
      </p>
    );
  }

  const times = plotted.map((v) => Date.parse(v.publishedAt));
  const views = plotted.map((v) => v.views ?? 0);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const maxV = Math.max(...views);
  const spanT = Math.max(maxT - minT, 86_400_000);

  const x = (t: number) => PAD.left + ((t - minT) / spanT) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / Math.max(maxV, 1)) * (H - PAD.top - PAD.bottom);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxV * f));
  const active = plotted.find((v) => v.id === selected) ?? null;

  const byViews = [...plotted].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const annotations: { video: VideoEvidence; anchor: 'high' | 'low' }[] =
    byViews.length >= 4 && byViews[0].id !== byViews.at(-1)!.id
      ? [
          { video: byViews[0], anchor: 'high' },
          { video: byViews.at(-1)!, anchor: 'low' },
        ]
      : [];

  function move(direction: 1 | -1) {
    const index = plotted.findIndex((v) => v.id === selected);
    const next = plotted[Math.min(Math.max((index < 0 ? 0 : index) + direction, 0), plotted.length - 1)];
    if (next) setSelected(next.id);
  }

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="report-chart h-auto w-full min-w-[480px]"
          role="img"
          aria-label={`Views of ${plotted.length} sampled uploads, plotted against publication date, as measured on ${shortDate(collectedAt)}.`}
        >
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="currentColor" className="text-line-strong" />
          <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="currentColor" className="text-line-strong" />

          {ticks.map((value) => (
            <g key={value}>
              <line x1={PAD.left} y1={y(value)} x2={W - PAD.right} y2={y(value)} stroke="currentColor" className="text-line" strokeDasharray="2 3" />
              <text x={PAD.left - 6} y={y(value) + 3} textAnchor="end" className="fill-ink-faint text-[9px]">
                {compact(value)}
              </text>
            </g>
          ))}
          {[minT, maxT].map((t, i) => (
            <text key={t} x={i === 0 ? PAD.left : W - PAD.right} y={H - PAD.bottom + 14} textAnchor={i === 0 ? 'start' : 'end'} className="fill-ink-faint text-[9px]">
              {shortDate(new Date(t).toISOString())}
            </text>
          ))}
          <text x={(W - PAD.left) / 2 + PAD.left} y={H - 4} textAnchor="middle" className="fill-ink-faint text-[9px]">
            Publication date
          </text>

          {/* TWO ANNOTATIONS, NOT TWENTY. The extremes are the points a reader
              is trying to identify, and labelling only those keeps the chart
              readable where labelling every point would not. Both are also in
              the table underneath, which is the accessible route to the same
              fact. */}
          {annotations.map(({ video, anchor }) => {
            const cx = x(Date.parse(video.publishedAt));
            const cy = y(video.views ?? 0);
            const flip = cx > W * 0.62;
            return (
              <text
                key={`note-${video.id}`}
                x={flip ? cx - 9 : cx + 9}
                y={cy + (anchor === 'high' ? -8 : 13)}
                textAnchor={flip ? 'end' : 'start'}
                className="fill-ink-faint text-[8.5px]"
              >
                {anchor === 'high' ? 'highest ' : 'lowest '}
                {compact(video.views)}
              </text>
            );
          })}

          {plotted.map((video) => {
            const cx = x(Date.parse(video.publishedAt));
            const cy = y(video.views ?? 0);
            const on = video.id === selected;
            const shape = MARKER[video.format];
            return (
              <g
                key={video.id}
                tabIndex={0}
                role="button"
                aria-label={`${video.title}, ${exact(video.views)} views, published ${shortDate(video.publishedAt)}, ${FORMAT_LABEL[video.format]}`}
                aria-pressed={on}
                onClick={() => setSelected(video.id)}
                onFocus={() => setSelected(video.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(1); }
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
                }}
                className="cursor-pointer outline-none [&:focus-visible>*]:stroke-indigo"
              >
                {/* A generous invisible target, so a finger can hit it. */}
                <circle cx={cx} cy={cy} r={14} fill="transparent" />
                {shape === 'circle' ? (
                  <circle cx={cx} cy={cy} r={on ? 6 : 4} className={on ? 'fill-indigo' : 'fill-ink-muted'} strokeWidth={2} />
                ) : shape === 'triangle' ? (
                  <polygon
                    points={`${cx},${cy - (on ? 7 : 5)} ${cx + (on ? 6 : 4.5)},${cy + (on ? 5 : 3.5)} ${cx - (on ? 6 : 4.5)},${cy + (on ? 5 : 3.5)}`}
                    className={on ? 'fill-indigo' : 'fill-ink-muted'}
                    strokeWidth={2}
                  />
                ) : (
                  <rect x={cx - (on ? 5 : 4)} y={cy - (on ? 5 : 4)} width={on ? 10 : 8} height={on ? 10 : 8} className={on ? 'fill-indigo' : 'fill-ink-faint'} strokeWidth={2} />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <figcaption className="mt-2 space-y-1">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
          {(['long', 'short', 'unknown'] as const)
            .filter((f) => plotted.some((v) => v.format === f))
            .map((f) => (
              <li key={f} className="flex items-center gap-1.5">
                <svg width="10" height="10" aria-hidden className="shrink-0">
                  {MARKER[f] === 'circle' ? <circle cx="5" cy="5" r="4" className="fill-ink-muted" /> : MARKER[f] === 'triangle' ? <polygon points="5,0 10,9 0,9" className="fill-ink-muted" /> : <rect x="1" y="1" width="8" height="8" className="fill-ink-faint" />}
                </svg>
                {FORMAT_LABEL[f]}
              </li>
            ))}
        </ul>
        <p className="text-[11px] leading-relaxed text-ink-muted">
          Views as measured on {shortDate(collectedAt)} — not a history. Newer uploads have had less
          time to accumulate, so the left of the chart is not growth. Nothing here shows subscribers.
          Highest in the sample: {compact(maxV)}.
          {unreported.length
            ? ` ${unreported.length} upload${unreported.length === 1 ? '' : 's'} report${unreported.length === 1 ? 's' : ''} no view count and ${unreported.length === 1 ? 'is' : 'are'} not plotted — that is unknown, not zero.`
            : ''}
          {aside.live || aside.upcoming
            ? ` ${[
                aside.live ? `${aside.live} live broadcast${aside.live === 1 ? '' : 's'}` : null,
                aside.upcoming ? `${aside.upcoming} scheduled premiere${aside.upcoming === 1 ? '' : 's'}` : null,
              ]
                .filter(Boolean)
                .join(' and ')} ${aside.live + aside.upcoming === 1 ? 'is' : 'are'} excluded — neither is a comparable result.`
            : ''}
        </p>
        {/* AGE GROUPS, BECAUSE THE SLOPE IS MOSTLY AGE. A month-old upload has
            had a month to accumulate; grouping the medians by age says that
            with numbers instead of asking the reader to infer it. These are
            medians of one snapshot — nothing here is a first-week figure, which
            would need repeat collections this product does not make. */}
        {bands.some((band) => band.n > 0) ? (
          <p className="tnum text-[11px] leading-relaxed text-ink-muted">
            Median by upload age:{' '}
            {bands
              .filter((band) => band.n > 0)
              .map((band) => `${band.label} ${compact(band.median)} (${band.n})`)
              .join(' · ')}
          </p>
        ) : null}
      </figcaption>

      {active ? (
        <div className="mt-3 flex gap-3 rounded-lg border border-line bg-paper p-2.5 print:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnailUrl(active.id)} alt="" width={112} height={63} className="h-16 w-28 shrink-0 rounded bg-line/40 object-contain" />
          <div className="min-w-0">
            <a href={videoUrl(active.id)} target="_blank" rel="noopener noreferrer" className="block break-words text-[12px] font-medium text-indigo underline-offset-4 hover:underline">
              {active.title}
            </a>
            <p className="tnum mt-1 text-[11px] text-ink-muted">
              {shortDate(active.publishedAt)} · <span title={exact(active.views)}>{compact(active.views)} views</span> ·{' '}
              {active.seconds ? `${Math.round(active.seconds / 60)} min` : 'duration not reported'} ·{' '}
              {FORMAT_LABEL[active.format]}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-ink-faint print:hidden">
          Select a point, or use the table below.
        </p>
      )}

      <details className="mt-3 report-chart-table">
        <summary className="cursor-pointer text-[12px] text-ink-muted underline-offset-4 hover:text-ink hover:underline">
          Chart data as a table ({videos.length} uploads)
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <caption className="sr-only">
              Every sampled upload with its publication date, duration, format and view count as
              measured on {shortDate(collectedAt)}
            </caption>
            <thead className="text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              <tr>
                <th scope="col" className="py-1 font-medium">Upload</th>
                <th scope="col" className="py-1 font-medium">Published</th>
                <th scope="col" className="py-1 font-medium">Format</th>
                <th scope="col" className="py-1 font-medium">Views</th>
              </tr>
            </thead>
            <tbody>
              {[...plotted, ...unreported, ...videos.filter((v) => v.state && v.state !== 'published')].map((video) => (
                <tr key={video.id} className="avoid-break border-t border-line">
                  <td className="py-1 pr-2">
                    <a href={videoUrl(video.id)} target="_blank" rel="noopener noreferrer" className="text-indigo underline-offset-4 hover:underline">
                      {video.title}
                    </a>
                  </td>
                  <td className="tnum py-1 pr-2 text-ink-muted">{shortDate(video.publishedAt)}</td>
                  <td className="py-1 pr-2 text-ink-muted">
                    {FORMAT_LABEL[video.format]}
                    {video.state && video.state !== 'published'
                      ? ` · ${video.state === 'live' ? 'live now' : 'scheduled'}`
                      : ''}
                  </td>
                  <td className="tnum py-1 text-ink" title={exact(video.views)}>{compact(video.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
