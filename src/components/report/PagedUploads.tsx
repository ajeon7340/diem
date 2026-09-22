'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { EvidenceCard } from './EvidenceCard';
import type { VideoEvidence } from '@/lib/ingest/analyze';

/**
 * One column of uploads, three at a time.
 *
 * EVERY UPLOAD IS IN THE DOM. The pager hides the pages you are not on with
 * `hidden`, and print shows all of them — a printed report that stopped at
 * page one of a list would be a report with evidence missing from it, and the
 * reader on paper has no Next button.
 *
 * NO PAGER WHEN THERE IS NOTHING TO PAGE. Three or fewer uploads render as a
 * plain list; controls that are always disabled are furniture.
 */
export function PagedUploads({
  items,
  emptyNote,
  perPage = 3,
}: {
  /*
   * REASONS ARRIVE AS STRINGS, NOT AS A FUNCTION.
   *
   * This is a client component and the caller is a server one, so a
   * `reasonFor` callback cannot cross the boundary — React refuses to
   * serialise it and the page throws at render. The server knows why each
   * upload is here; it says so once and passes the sentence.
   */
  items: { video: VideoEvidence; reason: string | null }[];
  emptyNote: string;
  perPage?: number;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(Math.ceil(items.length / perPage), 1);
  const from = page * perPage;

  if (items.length === 0) {
    return <p className="text-[12px] leading-relaxed text-ink-muted">{emptyNote}</p>;
  }

  return (
    <div>
      <ul className="space-y-2">
        {items.map(({ video, reason }, index) => (
          <EvidenceCard
            key={video.id}
            video={video}
            reason={reason}
            // Off-page cards stay rendered so the export carries all of them.
            className={index >= from && index < from + perPage ? undefined : 'hidden print:flex'}
          />
        ))}
      </ul>

      {pages > 1 ? (
        <div className="mt-2 flex items-center justify-between gap-2 print:hidden">
          <span className="tnum text-[11px] text-ink-faint">
            {from + 1}–{Math.min(from + perPage, items.length)} of {items.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              disabled={page === 0}
              aria-label="Previous uploads"
              className="press flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] border border-line text-ink-muted hover:bg-paper disabled:opacity-40"
            >
              <ChevronLeft size={14} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(p + 1, pages - 1))}
              disabled={page >= pages - 1}
              aria-label="More uploads"
              className="press flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] border border-line text-ink-muted hover:bg-paper disabled:opacity-40"
            >
              <ChevronRight size={14} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
