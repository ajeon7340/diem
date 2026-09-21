import { compact, exact, shortDate, thumbnailUrl, videoUrl } from '@/lib/channel/highlights';
import type { RelevantVideo } from '@/lib/relevance/requirements';

/**
 * The uploads that support a requirement, and which requirement each supports.
 *
 * WHEN NOTHING MATCHES, NOTHING IS SHOWN. The tempting fallback is the channel's
 * most-viewed uploads, which would put unrelated popular content under a
 * heading reading "relevant" — the single most misleading thing this section
 * could do. An empty state that says so is more use than three cards that are
 * not evidence of anything.
 *
 * EVERY CARD SAYS WHAT THE EVIDENCE IS. Metadata. A title naming a product is
 * not a viewing, not usage, and not an endorsement, and no card here implies
 * that adfit watched anything or read a transcript, because it did not.
 */
export function RelevantVideoCards({
  items,
  brandName,
}: {
  items: RelevantVideo[];
  brandName: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-ink-muted">
        No sampled upload matches what {brandName} sells or the campaign asks for. The sample is
        bounded and titles are not the whole video — but nothing here is evidence, so nothing is
        shown as though it were.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {items.map(({ video, requirement, because }) => (
        <li key={video.id} className="evidence-card avoid-break rounded-lg border border-line bg-paper p-2.5">
          <a href={videoUrl(video.id)} target="_blank" rel="noopener noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl(video.id)}
              alt=""
              width={320}
              height={180}
              loading="lazy"
              className="mb-2 aspect-video w-full rounded bg-line/40 object-contain"
            />
            <span className="block break-words text-[12px] font-medium leading-snug text-ink">
              {video.title}
            </span>
          </a>
          <p className="tnum mt-1 text-[11px] text-ink-muted">
            {shortDate(video.publishedAt)} · <span title={exact(video.views)}>{compact(video.views)} views</span> ·{' '}
            {video.format === 'short' ? '3 min or less (proxy)' : video.format === 'long' ? 'Long-form' : 'Duration not reported'}
          </p>
          <p className="mt-1.5 border-t border-line pt-1.5 text-[11px] leading-relaxed text-ink">
            <span className="text-ink-faint">Supports:</span> {requirement}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{because}</p>
        </li>
      ))}
    </ul>
  );
}
