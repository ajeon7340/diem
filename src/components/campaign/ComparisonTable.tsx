import Link from 'next/link';

import { Panel } from '@/components/ui/Panel';
import type { CandidateRow } from '@/lib/report/candidate-compare';
import { MIN_SCORED, comparability } from '@/lib/report/candidate-compare';
import { DERIVED_DISCLOSURE, FINANCIAL_DISCLOSURE } from '@/lib/report/policy';
import { cn } from '@/lib/cn';

/** A figure, or a dash that means NOT MEASURED and never zero. */
function Cell({
  value,
  title,
  className,
}: {
  value: string | null;
  title?: string;
  className?: string;
}) {
  if (value === null) {
    return (
      <td className={cn('px-3 py-2.5 text-right text-ink-faint', className)} title={title}>
        —
      </td>
    );
  }
  return <td className={cn('tnum px-3 py-2.5 text-right text-ink', className)}>{value}</td>;
}

const NUM = (n: number | null) => (n === null ? null : n.toLocaleString('en-US'));
const PCT = (n: number | null, digits = 1) => (n === null ? null : `${(n * 100).toFixed(digits)}%`);

/**
 * Every candidate on one standard.
 *
 * The columns are chosen so that each is a thing we actually measured, and
 * each header says what it is over. "Comments read" is a denominator, not a
 * quality score, and it sits beside the figures derived from it because a
 * sentiment over 80 comments and one over 6,000 are not the same claim.
 *
 * WHAT IS NOT A COLUMN: anything about who watches. No age, no gender, no
 * location, no conversion. None of it is knowable from public data, and a
 * column is an invitation to fill it in.
 */
export function ComparisonTable({ rows }: { rows: CandidateRow[] }) {
  const state = comparability(rows);

  return (
    <Panel
      title="Candidates on this campaign's standard"
      meta={rows.length === 0 ? undefined : `${rows.length}`}
    >
      {state.note ? (
        <p className="border-b border-line bg-paper px-5 py-2.5 text-[11px] leading-relaxed text-ink-muted">
          {state.note}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-[12px] text-ink-muted">
          Add a channel above and its public figures appear here within a few seconds.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line text-ink-faint">
                <th className="px-3 py-2 text-left font-medium">Channel</th>
                <th className="px-3 py-2 text-right font-medium">Subs</th>
                <th className="px-3 py-2 text-right font-medium">Median views</th>
                <th className="px-3 py-2 text-right font-medium">Engagement</th>
                <th className="px-3 py-2 text-right font-medium">Comments read</th>
                <th className="px-3 py-2 text-right font-medium">Climate</th>
                {/* Named as language, in the header, because this is the
                    single figure most likely to be read as a conversion rate. */}
                <th className="px-3 py-2 text-right font-medium">Purchase language</th>
                <th className="px-3 py-2 text-right font-medium">Disclosed ads</th>
                <th className="px-3 py-2 text-right font-medium">Fee</th>
                <th className="px-3 py-2 text-right font-medium">Est. CPM</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`#candidate-${row.id}`}
                      className="font-medium text-ink underline-offset-4 hover:underline"
                    >
                      {row.title}
                    </Link>
                    {row.status !== 'considering' ? (
                      <span
                        className={cn(
                          'ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          row.status === 'shortlisted'
                            ? 'bg-emerald-wash text-emerald'
                            : 'bg-paper text-ink-faint',
                        )}
                      >
                        {row.status}
                      </span>
                    ) : null}
                    {row.missing ? (
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        No public read stored yet
                      </p>
                    ) : null}
                  </td>
                  <Cell value={NUM(row.subscribers)} title="The channel hides its subscriber count" />
                  <Cell value={NUM(row.medianViews)} />
                  <Cell value={PCT(row.engagementRate, 2)} />
                  <Cell value={row.missing ? null : NUM(row.commentsAnalysed)} />
                  <Cell
                    value={row.sentiment === null ? null : `${row.sentiment.toFixed(0)}/100`}
                    title="Not classified yet — this is an absent measurement, not a low score"
                  />
                  {/* The rate and what it is over, in one cell. A percentage
                      alone is not comparable between rows, and this column is
                      the one a reader sorts by. */}
                  {row.purchaseLanguageRate === null ? (
                    <Cell
                      value={null}
                      title="Not classified yet. This is the share of comments containing purchase-related language — not a conversion rate."
                    />
                  ) : (
                    <td className="px-3 py-2.5 text-right">
                      <span className="tnum text-ink">{PCT(row.purchaseLanguageRate)}</span>
                      {row.purchaseLanguageBasis ? (
                        <span
                          className={cn(
                            'tnum block text-[10px]',
                            row.purchaseLanguageBasis.scored < MIN_SCORED
                              ? 'text-amber'
                              : 'text-ink-faint',
                          )}
                          title={
                            row.purchaseLanguageBasis.basis === 'product_comments'
                              ? 'Of the comments attached to something purchasable'
                              : 'Of every comment read'
                          }
                        >
                          of {row.purchaseLanguageBasis.scored.toLocaleString('en-US')}
                        </span>
                      ) : null}
                    </td>
                  )}
                  <Cell
                    value={row.missing ? null : String(row.disclosedPromotions)}
                    title="Uploads carrying YouTube's own paid-placement disclosure"
                  />
                  <Cell
                    value={
                      row.fee === null
                        ? null
                        : `${row.fee.currency} ${row.fee.amount.toLocaleString('en-US')}`
                    }
                    title="No fee supplied. We never estimate one."
                  />
                  <Cell
                    value={
                      row.cpm === null
                        ? null
                        : `${row.cpm.currency} ${row.cpm.value.toFixed(2)}`
                    }
                    title={
                      row.cpm === null
                        ? 'Needs a fee you were quoted and a median view figure'
                        : `${row.cpm.formula} — an estimate over ${row.cpm.basis}`
                    }
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Both constants are RENDERED, not paraphrased. Accepting YouTube's
          derived-metrics amendment is what permits the sentiment and
          purchase-language columns to exist at all, and it carries two
          obligations: say the derived figures are ours and not YouTube's, and
          say a financial projection is not approved by Google. A constant that
          exists and is never rendered satisfies neither — which is why
          `verify:policy` asserts these exact expressions appear here. */}
      <div className="space-y-1.5 border-t border-line px-5 py-2.5 text-[11px] leading-relaxed text-ink-faint">
        <p>{DERIVED_DISCLOSURE}</p>
        <p>{FINANCIAL_DISCLOSURE}</p>
        <p>
          Comment figures describe the people who commented, who are a small self-selected slice
          of who watched. Nothing here measures conversion, sales, or who the viewers are.
        </p>
      </div>
    </Panel>
  );
}
