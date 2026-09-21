import type { ReactNode } from 'react';

import { compact, exact, shortDate, thumbnailUrl, videoUrl } from '@/lib/channel/highlights';
import type { VideoEvidence } from '@/lib/ingest/analyze';

/**
 * One upload, as evidence, in a row rather than a tile.
 *
 * THE TILES WERE THE PAGE. Four evidence cards at 320×180 filled a printed
 * sheet and a half with four thumbnails and twelve lines of text, so the
 * document's most-prominent element was a picture YouTube generated. A row —
 * thumbnail at the left, everything else beside it — fits four to a page and
 * puts the reason for inclusion next to the title where it is read.
 *
 * ONE CARD COMPONENT, TWO REPORTS. The channel report and the relevance
 * analysis both show uploads, and they showed them in two different shapes with
 * two different sets of caveats. The `reason` differs; nothing else should, and
 * now nothing else can.
 *
 * THE THUMBNAIL IS NEVER CROPPED OR OVERLAID — `object-contain` on a tinted
 * tile, so an image YouTube does not serve for this id reads as missing rather
 * than as a broken page.
 */
export function EvidenceCard({
  video,
  reason,
  label,
  disclosed = false,
  titleRepeats = false,
  children,
}: {
  video: VideoEvidence;
  /** Why this upload is here. Factual, and never a verdict on the content. */
  reason: string;
  /** A short tag for the card's purpose, e.g. "Outlier". */
  label?: string;
  /** YouTube's paid-promotion flag, where the metadata reported one. */
  disclosed?: boolean;
  titleRepeats?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="evidence-card avoid-break flex gap-3 rounded-lg border border-line bg-paper p-2.5">
      <a
        href={videoUrl(video.id)}
        rel="noopener noreferrer"
        target="_blank"
        className="shrink-0"
        aria-label={`Watch ${video.title} on YouTube`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl(video.id)}
          alt=""
          width={160}
          height={90}
          loading="lazy"
          className="evidence-thumb h-[3.6rem] w-24 rounded bg-line/40 object-contain sm:h-[4.5rem] sm:w-32"
        />
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <a
            href={videoUrl(video.id)}
            rel="noopener noreferrer"
            target="_blank"
            className="min-w-0 flex-1 break-words text-[12px] font-medium leading-snug text-ink underline-offset-4 hover:underline"
          >
            {video.title}
          </a>
          {label ? (
            <span className="shrink-0 rounded border border-line bg-surface px-1.5 py-px text-[10px] uppercase tracking-[0.06em] text-ink-faint">
              {label}
            </span>
          ) : null}
        </div>
        <p className="tnum mt-1 text-[11px] text-ink-muted">
          {shortDate(video.publishedAt)} ·{' '}
          <span title={exact(video.views)}>{compact(video.views)} views</span> ·{' '}
          {video.format === 'short'
            ? '≤3 min (proxy)'
            : video.format === 'long'
              ? 'Long-form'
              : 'Duration not reported'}
          {video.seconds ? ` · ${Math.max(Math.round(video.seconds / 60), 1)} min` : ''}
          {video.state && video.state !== 'published'
            ? ` · ${video.state === 'live' ? 'live now' : 'scheduled premiere'}`
            : ''}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{reason}.</p>
        {disclosed ? (
          <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
            Carries YouTube’s paid-promotion flag. The flag does not name the sponsor.
          </p>
        ) : null}
        {titleRepeats ? (
          <p className="mt-1 text-[11px] leading-relaxed text-amber">
            Another sampled upload shares this title. They are different videos, not a duplicate.
          </p>
        ) : null}
        {children}
      </div>
    </li>
  );
}
