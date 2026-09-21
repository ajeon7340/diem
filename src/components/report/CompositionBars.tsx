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
 * THE TWO CLASSIFICATIONS ARE RENDERED DIFFERENTLY ON PURPOSE. Formats are
 * mutually exclusive and are shown as bars with percentages, because they sum
 * to the sample. Subjects are overlapping tags and are shown as chips with
 * counts and NO percentage, because "12 uploads mention 아이폰" out of 50 is not
 * 24% of anything a reader can add up.
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
                    className={`w-[8.5rem] shrink-0 text-[12px] leading-snug ${
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
                  <span className="tnum w-20 shrink-0 text-right text-[12px] text-ink">
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

      {composition.subjects.length ? (
        <div className="avoid-break border-t border-line pt-2.5">
          <p className="text-[11px] font-medium text-ink">
            Recurring subjects
            <span className="ml-1.5 font-normal text-ink-faint">
              overlapping tags — one upload can carry several, so these do not add up to{' '}
              {composition.sampled}
            </span>
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {composition.subjects.map((subject) => (
              <li key={subject.term}>
                <a
                  href={videoUrl(subject.videoIds[0])}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-baseline gap-1.5 rounded-md border border-line bg-paper px-2 py-0.5 text-[11px] text-ink hover:border-indigo"
                >
                  {subject.term}
                  <span className="tnum text-ink-faint">{subject.videoIds.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-muted">
          No word recurs in three or more sampled titles, so no subject is named. A sample this
          varied is a finding about the sample, not about the channel.
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        {composition.sampled} upload{composition.sampled === 1 ? '' : 's'} classified
        {sampled && sampled !== composition.sampled
          ? ` of ${sampled} sampled — live broadcasts and scheduled premieres are not classified`
          : ''}
        . {composition.basis}{' '}
        A label describes how the creator titled an upload, not what happens in it.
      </p>
    </div>
  );
}
