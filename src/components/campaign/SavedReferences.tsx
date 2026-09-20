import type { CampaignReference } from '@/lib/data/references';
import { Panel } from '@/components/ui/Panel';
import { compactNumber, percent, shortDate } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * References this campaign has filed, with the reading frozen as it was taken.
 *
 * Every row prints `analysed_at`, and that is not housekeeping: the channel
 * median a multiple was measured against moves with every upload, so a figure
 * saved in March describes a baseline that no longer exists. Re-deriving on
 * display would quietly change what the saved number meant; showing the date
 * lets a reader decide whether it is still worth anything.
 */
export function SavedReferences({
  references,
  candidates,
}: {
  references: CampaignReference[];
  candidates: Array<{ id: string; title: string }>;
}) {
  if (references.length === 0) return null;

  const nameOf = (id: string | null) =>
    id ? (candidates.find((c) => c.id === id)?.title ?? 'a candidate') : null;

  return (
    <Panel title="Saved references" meta={`${references.length}`}>
      <ul className="divide-y divide-line">
        {references.map((r) => {
          const against = nameOf(r.candidateId);
          return (
            <li key={r.id} className="px-5 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <a
                  href={`https://www.youtube.com/watch?v=${r.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] leading-snug text-ink hover:text-indigo hover:underline"
                >
                  {r.title}
                </a>
                <span
                  className={cn(
                    'tnum text-[13px] font-medium',
                    r.multiple === null
                      ? 'text-ink-faint'
                      : r.multiple >= 1.5
                        ? 'text-emerald'
                        : r.multiple < 0.8
                          ? 'text-rose'
                          : 'text-ink',
                  )}
                >
                  {r.multiple === null ? '—' : `${r.multiple.toFixed(2)}×`}
                </span>
              </div>

              <p className="tnum mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
                <span className="text-ink-muted">{r.channelTitle}</span>
                {r.views !== null ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{compactNumber(r.views)} views</span>
                  </>
                ) : null}
                {r.channelMedianViews !== null ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      vs their median {compactNumber(r.channelMedianViews)} over {r.sampleSize}
                    </span>
                  </>
                ) : null}
                {r.engagementRate !== null ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{percent(r.engagementRate, 2)} engagement</span>
                  </>
                ) : null}
              </p>

              {r.note ? (
                <p className="mt-1.5 border-l-2 border-line pl-3 text-[12px] leading-relaxed text-ink-muted">
                  {r.note}
                </p>
              ) : null}

              <p className="tnum mt-1.5 text-[11px] text-ink-faint">
                {against ? `Filed against ${against} · ` : 'Filed to the campaign · '}
                read {shortDate(r.analysedAt)}
                {' — figures are as they were that day; their median has moved since.'}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
