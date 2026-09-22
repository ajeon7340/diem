import { compact, exact, percent, shortDate, videoUrl } from '@/lib/channel/highlights';
import type { Composition } from '@/lib/channel/composition';
import type { VideoEvidence } from '@/lib/ingest/analyze';

/**
 * What this creator publishes, as counts.
 *
 * ONE QUESTION, ONE CHART. "What does this creator make?" is the question a
 * buyer opens the report with, and until now nothing in it answered that at
 * all — fifty uploads were described entirely by how many times they had been
 * watched.
 *
 * BARS, NOT A PIE. Six categories at a glance, compared by length, readable in
 * greyscale, and each one sized by a count printed beside it so the bar is a
 * convenience rather than the only way to read the number.
 *
 * FORMATS ONLY. These are mutually exclusive and sum to the sample, so a bar
 * with a percentage beside it means something. The overlapping subject tags
 * are drawn as bubbles in `SubjectBubbles` precisely because they do NOT sum:
 * a stacked bar of them would add past 100% and invite arithmetic that is not
 * true of anything.
 *
 * UNCLASSIFIED IS PRINTED, always, with its share. A classifier that covers
 * 70% of a sample and shows only the 70% is claiming coverage it does not have.
 */
export function CompositionBars({
  composition,
  videos,
  sampled,
}: {
  composition: Composition;
  videos: VideoEvidence[];
  /** The whole sample, which may be larger than what could be classified. */
  sampled?: number;
}) {
  const byId = new Map(videos.map((v) => [v.id, v]));
  const max = Math.max(...composition.formats.map((g) => g.videoIds.length), 1);

  if (composition.sampled === 0) {
    return <p className="text-[12px] text-ink-muted">Nothing was collected, so there is nothing to classify.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {composition.formats.map((group) => {
          const n = group.videoIds.length;
          return (
            <li key={group.format} className="avoid-break">
              <details className="group print-keep-summary">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded py-0.5 hover:bg-paper">
                  <span
                    className={`w-24 shrink-0 text-[12px] leading-snug sm:w-[8.5rem] ${
                      group.format === 'unclassified' ? 'text-ink-faint' : 'text-ink'
                    }`}
                  >
                    {group.label}
                  </span>
                  <span className="min-w-0 flex-1" aria-hidden>
                    <span
                      className={`block h-2.5 rounded-sm ${
                        group.format === 'unclassified' ? 'bg-line-strong' : 'bg-indigo'
                      }`}
                      style={{ width: `${Math.max((n / max) * 100, 2)}%` }}
                    />
                  </span>
                  <span className="tnum w-16 shrink-0 text-right text-[12px] text-ink sm:w-20">
                    {n} <span className="text-ink-faint">{percent(n, composition.sampled)}</span>
                  </span>
                </summary>
                <div className="border-l-2 border-line pb-1.5 pl-3 pt-1.5">
                  <p className="text-[11px] leading-relaxed text-ink-muted">{group.means}</p>
                  <ul className="mt-1 space-y-0.5">
                    {group.videoIds.slice(0, 6).map((id) => {
                      const video = byId.get(id);
                      if (!video) return null;
                      return (
                        <li key={id} className="text-[11px] leading-relaxed">
                          <a
                            href={videoUrl(id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo underline-offset-4 hover:underline"
                          >
                            {video.title}
                          </a>
                          <span className="tnum ml-1.5 text-ink-faint" title={exact(video.views)}>
                            {shortDate(video.publishedAt)} · {compact(video.views)} views
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {group.videoIds.length > 6 ? (
                    <p className="mt-1 text-[11px] text-ink-faint">
                      and {group.videoIds.length - 6} more in the appendix.
                    </p>
                  ) : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      <p className="tnum text-[11px] text-ink-faint">
        {composition.sampled}
        {sampled && sampled !== composition.sampled ? ` of ${sampled}` : ''} classified
      </p>
    </div>
  );
}
