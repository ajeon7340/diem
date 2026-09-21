import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  candidateName,
  CONFIDENCE_LABELS,
  REVIEW_LABELS,
  type CandidateView,
} from '@/lib/campaign/presentation';
import { currency, shortDate } from '@/lib/format';
import { DERIVED_DISCLOSURE, FINANCIAL_DISCLOSURE } from '@/lib/report/policy';

export function ComparisonTable({
  candidates,
  includePrivate = false,
}: {
  candidates: CandidateView[];
  includePrivate?: boolean;
}) {
  const row = (
    label: string,
    content: (view: CandidateView) => ReactNode,
    privateRow = false,
  ) => (
    <tr
      key={label}
      className={`border-t border-line align-top ${privateRow ? 'print:hidden' : ''}`}
    >
      <th
        scope="row"
        className="w-36 bg-paper px-4 py-4 text-xs font-medium text-ink-muted"
      >
        {label}
      </th>
      {candidates.map((view) => (
        <td
          key={view.candidate.id}
          className="px-4 py-4 text-xs leading-relaxed"
        >
          {content(view)}
        </td>
      ))}
    </tr>
  );
  const anyFit =
    includePrivate && candidates.some(({ candidate }) => candidate.fit);
  return (
    <section
      aria-label="Candidate comparison"
      className="overflow-hidden rounded-xl border border-line bg-surface"
    >
      <div className="comparison-scroll overflow-x-auto">
        <table
          className="comparison-table w-full table-fixed text-left"
          style={{ minWidth: 144 + candidates.length * 230 }}
        >
          <caption className="sr-only">
            Selected candidates, side by side
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="w-36 bg-paper px-4 py-4 text-xs font-medium text-ink-muted"
              >
                Compare
              </th>
              {candidates.map((view) => (
                <th
                  scope="col"
                  key={view.candidate.id}
                  className="px-4 py-4 text-sm font-semibold"
                >
                  <Link
                    href={`/channels/${view.candidate.channelId}`}
                    className="text-indigo hover:underline"
                  >
                    {candidateName(view)}
                  </Link>
                  <p className="mt-1 text-[11px] font-normal text-ink-muted">
                    {REVIEW_LABELS[view.candidate.status]}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row('Evidence collected', ({ report, notice }) =>
              report ? (
                <>
                  <p>{report.videos.length} sampled videos</p>
                  <p className="mt-1 text-ink-muted">
                    {shortDate(report.fetchedAt)}
                  </p>
                  <p className="mt-1 text-ink-muted">
                    {shortDate(report.sampledStart)}–{shortDate(report.sampledEnd)}
                  </p>
                  {notice && <p className="mt-1 text-ink-muted">{notice}</p>}
                </>
              ) : (
                (notice ?? 'Not collected')
              ),
            )}
            {anyFit &&
              row(
                'Campaign relevance',
                ({ candidate }) =>
                  candidate.fit ? (
                    <>
                      <p>{candidate.fit.relevance}</p>
                      <p className="mt-2 text-ink-muted">
                        {CONFIDENCE_LABELS[candidate.fit.confidence]}
                      </p>
                    </>
                  ) : (
                    'Not assessed'
                  ),
                true,
              )}
            {row('Content to review', ({ report }) =>
              report?.videos.length ? (
                <ul className="space-y-3">
                  {report.videos.slice(0, 3).map((video) => (
                    <li key={video.id}>
                      <a
                        href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo hover:underline"
                      >
                        {video.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : report ? (
                'No videos in the sample'
              ) : (
                'Not collected'
              ),
            )}
            {row('Disclosed promotions', ({ report }) => {
              if (!report) return 'Not collected';
              const promotions = report.promotions.filter(
                (p) => p.disclosure === 'explicit',
              );
              return promotions.length ? (
                <ul className="space-y-3">
                  {promotions.slice(0, 3).map((p) => (
                    <li key={p.postId}>
                      <a
                        href={`https://www.youtube.com/watch?v=${encodeURIComponent(p.postId)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo hover:underline"
                      >
                        {p.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                'None found in this sample'
              );
            })}
            {anyFit &&
              row(
                'Confirm before deciding',
                ({ candidate }) =>
                  candidate.fit?.beforeYouSign.length ? (
                    <ul className="list-disc space-y-2 pl-4">
                      {candidate.fit.beforeYouSign.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    'No campaign assessment yet'
                  ),
                true,
              )}
            {includePrivate &&
              row(
                'Quoted fee · private',
                ({ candidate }) =>
                  candidate.proposedFee === null
                    ? 'Not provided'
                    : currency(candidate.proposedFee, candidate.feeCurrency),
                true,
              )}
            {row('Evidence deadline', ({ report }) =>
              report
                ? shortDate(
                    new Date(
                      Date.parse(report.fetchedAt) + 30 * 86400000,
                    ).toISOString(),
                  )
                : 'No current report',
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-muted">
        Missing evidence is not a poor fit. Disclosures cover the collected
        sample and do not identify the brand. Confirm product experience,
        availability and rights before choosing.
      </p>
      {/* The two disclosures the derived-metrics amendment requires, each shown
        wherever the thing it qualifies is. DERIVED_DISCLOSURE goes with our own
        measurements; FINANCIAL_DISCLOSURE goes with a PRICE, and the quoted-fee
        row above is one — dropping it while still printing a fee re-breaks the
        permission the whole flag depends on. See lib/report/policy.ts. */}
      {(anyFit || includePrivate) && (
        <details className="border-t border-line px-4 py-3 text-[11px] text-ink-muted print:hidden">
          <summary className="cursor-pointer">About the assessments</summary>
          {anyFit && (
            <p className="mt-2 leading-relaxed">
              {DERIVED_DISCLOSURE} Commenters are not representative of all
              viewers. Product-related language does not establish conversion.
            </p>
          )}
          {includePrivate && (
            <p className="mt-2 leading-relaxed">{FINANCIAL_DISCLOSURE}</p>
          )}
        </details>
      )}
    </section>
  );
}
