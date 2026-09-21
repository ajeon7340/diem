import { EvidenceCard } from './EvidenceCard';
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
    <ul className="space-y-2">
      {items.map(({ video, requirement, because }) => (
        <EvidenceCard key={video.id} video={video} reason={because} label="Cited">
          <p className="mt-1 text-[11px] leading-relaxed text-ink">
            <span className="text-ink-faint">Supports:</span> {requirement}
          </p>
        </EvidenceCard>
      ))}
    </ul>
  );
}
