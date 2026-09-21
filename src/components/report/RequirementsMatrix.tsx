import { Check, CircleHelp, CircleSlash, TriangleAlert } from 'lucide-react';

import { videoUrl } from '@/lib/channel/highlights';
import { STATUS_LABEL, type RequirementRow, type RequirementStatus } from '@/lib/relevance/requirements';
import type { VideoEvidence } from '@/lib/ingest/analyze';

/**
 * Requirement, status, evidence, what to confirm — one row each.
 *
 * COLOUR IS NEVER THE SIGNAL. Every status carries a word and a shape as well
 * as a tint, because a matrix read in grey, in print, or by somebody who does
 * not separate red from green has to say the same thing.
 *
 * "UNVERIFIED" IS NOT A FAILURE and is styled so it does not look like one.
 * Public data cannot answer some of these at all; a sample that did not happen
 * to cover something has not found evidence against it. A buyer who reads an
 * unverified row as a red mark makes exactly the wrong decision, so the label
 * says "unverified" and the confirm column says what to ask.
 *
 * EVERY SUPPORTED OR CONFLICTING ROW CITES VIDEOS, and those citations are
 * links. A claim whose evidence cannot be opened is a claim nobody can check.
 */

const STATUS_STYLE: Record<RequirementStatus, { icon: typeof Check; tone: string; chip: string }> = {
  supported: { icon: Check, tone: 'text-emerald', chip: 'border-emerald/30 bg-emerald-wash' },
  partial: { icon: CircleSlash, tone: 'text-amber', chip: 'border-amber/30 bg-amber-wash' },
  unverified: { icon: CircleHelp, tone: 'text-ink-muted', chip: 'border-line bg-paper' },
  conflicting: { icon: TriangleAlert, tone: 'text-rose', chip: 'border-rose/30 bg-rose-wash' },
};

export function RequirementsMatrix({
  rows,
  videos,
}: {
  rows: RequirementRow[];
  videos: VideoEvidence[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[12px] text-ink-muted">
        This brand has no product description, categories or campaign brief yet, so there is nothing
        to check the evidence against.
      </p>
    );
  }
  const byId = new Map(videos.map((v) => [v.id, v]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-[12px]">
        <caption className="sr-only">
          Each requirement from the brand or campaign, its evidence status, the uploads supporting
          it, and what to confirm
        </caption>
        <thead className="text-[10px] uppercase tracking-[0.08em] text-ink-faint">
          <tr>
            <th scope="col" className="py-1.5 pr-3 font-medium">Requirement</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Evidence</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Supporting uploads</th>
            <th scope="col" className="py-1.5 font-medium">Confirm</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const style = STATUS_STYLE[row.status];
            const Icon = style.icon;
            return (
              <tr key={row.id} className="avoid-break border-t border-line align-top">
                <th scope="row" className="py-2.5 pr-3 font-medium text-ink">
                  {row.requirement}
                  <span className="mt-0.5 block text-[10px] font-normal uppercase tracking-[0.08em] text-ink-faint">
                    from {row.source}
                  </span>
                </th>
                <td className="py-2.5 pr-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${style.chip} ${style.tone}`}>
                    <Icon size={12} aria-hidden />
                    {STATUS_LABEL[row.status]}
                  </span>
                  <p className="mt-1 leading-relaxed text-ink-muted">{row.finding}</p>
                </td>
                <td className="py-2.5 pr-3">
                  {row.evidence.length === 0 ? (
                    <span className="text-ink-faint">None</span>
                  ) : (
                    <ul className="space-y-1">
                      {row.evidence.map((id) => (
                        <li key={id}>
                          <a
                            href={videoUrl(id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo underline-offset-4 hover:underline"
                          >
                            {byId.get(id)?.title ?? id}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2.5 leading-relaxed text-ink-muted">{row.confirm}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
        “Supported” means the evidence supports that one requirement — not that the creator is right
        for the campaign. “Unverified” means this sample cannot answer it, which is different from
        evidence against.
      </p>
    </div>
  );
}
