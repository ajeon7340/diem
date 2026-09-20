import Link from 'next/link';

import type { CandidateRow } from '@/lib/report/candidate-compare';
import type { Candidate } from '@/lib/data/campaigns';
import { DERIVED_DISCLOSURE, FINANCIAL_DISCLOSURE } from '@/lib/report/policy';
import { STATUS_LABEL } from '@/lib/channel/state';

/**
 * Candidates side by side.
 *
 * A COLUMN THAT SAYS THE SAME THING IN EVERY ROW IS NOT A COLUMN. This had
 * six, and four of them printed an identical fallback sentence for every
 * candidate whenever no fit read existed — "Confirm deliverables and product
 * use case" five times down one column, "Product experience, availability,
 * rights and pricing" five times down another. With derived analysis gated,
 * which is the default, that is the entire table: forty words per row of
 * placeholder arranged to look like findings, and a reader scanning for a
 * difference between candidates finds none because there is none being shown.
 *
 * So the analytical columns appear only when at least one candidate actually
 * has a read, the shared guidance is stated once underneath instead of per
 * row, and a cell with nothing to say is a dash. The table gets narrower as it
 * learns less, which is the honest direction.
 */
export function ComparisonTable({
  rows,
  candidates = [],
}: {
  rows: CandidateRow[];
  candidates?: Candidate[];
}) {
  const fitOf = (id: string) => candidates.find((c) => c.id === id)?.fit ?? null;
  // One read anywhere is enough to make the comparison worth its width.
  const anyFit = rows.some((r) => fitOf(r.id));

  const headers = anyFit
    ? ['Channel', 'Relevance', 'Sponsorship', 'Confirm before signing']
    : ['Channel', 'Status', 'Sponsorship'];

  return (
    <section className="rounded-lg border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 p-5">
        <h2 className="font-semibold">Compare candidates</h2>
        <p className="text-xs text-ink-muted">
          {rows.length} of 5 · no automatic ranking
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="border-t p-5 text-sm text-ink-muted">
          Add a channel report to start comparing.
        </p>
      ) : (
        <div className="comparison-scroll overflow-x-auto border-t">
          <table className="comparison-table w-full min-w-[620px] text-left text-xs">
            <thead>
              <tr className="border-b">
                {headers.map((h) => (
                  <th key={h} className="p-3 align-top font-medium text-ink-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const fit = fitOf(row.id);
                return (
                  <tr key={row.id} className="border-t align-top">
                    <td className="p-3">
                      <Link className="font-medium text-indigo" href={`/channels/${row.channelId}`}>
                        {row.title}
                      </Link>
                      {anyFit ? (
                        <p className="mt-1 text-ink-muted">{STATUS_LABEL[row.status]}</p>
                      ) : null}
                    </td>

                    {anyFit ? (
                      <td className="p-3">
                        {fit ? (
                          <>
                            {fit.relevance}
                            <p className="mt-1 text-ink-muted">Evidence: {fit.confidence}</p>
                          </>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                    ) : (
                      <td className="p-3">{STATUS_LABEL[row.status]}</td>
                    )}

                    <td className="p-3">
                      {row.missing ? (
                        <span className="text-ink-faint">—</span>
                      ) : row.disclosedPromotions ? (
                        `${row.disclosedPromotions} disclosed`
                      ) : (
                        'None found'
                      )}
                    </td>

                    {anyFit ? (
                      <td className="p-3">
                        {fit?.beforeYouSign.slice(0, 2).join(' · ') ?? (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Said once, not once per row. */}
      <p className="border-t px-5 py-3 text-xs text-ink-muted">
        A dash is a measurement that has not run — not a poor fit. Whatever the read says, confirm
        product experience, availability, rights and pricing with the creator before signing.
      </p>

      <details className="border-t p-5 print:hidden">
        <summary className="cursor-pointer text-sm">Reach and private pricing</summary>
        <div className="mt-3 space-y-2 text-sm">
          {rows.map((r) => (
            <p key={r.id}>
              <span className="font-medium">{r.title}</span>{' '}
              {r.subscribers?.toLocaleString('en-US') ?? 'Unknown'} subscribers ·{' '}
              {r.medianViews?.toLocaleString('en-US') ?? 'Not measured'} median views · Fee{' '}
              {r.fee ? `${r.fee.currency} ${r.fee.amount}` : 'not supplied'}
            </p>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Median views mix uploads of different ages; see the age breakdown in each report.{' '}
          {FINANCIAL_DISCLOSURE}
        </p>
      </details>

      <p className="border-t p-4 text-xs text-ink-muted">
        {DERIVED_DISCLOSURE} Commenters are not representative of all viewers. Product-related
        language does not establish conversion.
      </p>
    </section>
  );
}
