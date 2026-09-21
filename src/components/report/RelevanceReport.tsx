import { Badge } from '@/components/ui/Badge';
import { RelevantVideoCards } from './RelevantVideoCards';
import { RequirementsMatrix } from './RequirementsMatrix';
import type { ChannelReportView } from '@/lib/channel/report';
import { shortDate } from '@/lib/channel/highlights';
import { FRESHNESS_LABEL, type Freshness } from '@/lib/relevance/fingerprint';
import {
  relevantVideos,
  statusCounts,
  type RelevanceContext,
  type RequirementRow,
} from '@/lib/relevance/requirements';
import type { CandidateFit } from '@/lib/report/candidate-fit';

/**
 * The second report: the same evidence, read for one brand.
 *
 * SEPARATE FROM THE CHANNEL REPORT ON PURPOSE. The channel report is reusable —
 * the same facts answer every brand's first question, and it is what a shared
 * link carries. This is about one brand's product, it is worthless to anybody
 * else, and it contains the customer's own brief, so it never leaves the
 * workspace unless somebody explicitly ticks a box.
 *
 * THE DETERMINISTIC HALF CARRIES THE PAGE. The matrix, the cards and the
 * counts are term matching against retrieved metadata, with every claim citing
 * videos — no model, no gate. The narrative below is the gated model reading,
 * and when it is missing the page is still worth opening. That ordering is
 * deliberate: an analysis that collapses without approval would make the
 * approval the product.
 *
 * NO SCORE, NO PERCENTAGE, NO RANKING. There is no defensible method for one
 * from this evidence, and a number at the top is the only thing anybody would
 * read.
 */

const FRESHNESS_TONE: Record<Freshness, 'emerald' | 'amber' | 'slate'> = {
  current: 'emerald',
  evidence_changed: 'amber',
  brief_changed: 'amber',
  missing: 'slate',
};

export function RelevanceReport({
  report,
  context,
  rows,
  narrative,
  freshness,
  writtenAt,
  writtenAgainst,
}: {
  report: ChannelReportView;
  context: RelevanceContext;
  rows: RequirementRow[];
  /** The gated reading. Null where approval is off or the pass has not run. */
  narrative: CandidateFit | null;
  freshness: Freshness;
  writtenAt: string | null;
  /** The evidence snapshot this was written against. */
  writtenAgainst: string | null;
}) {
  const counts = statusCounts(rows);
  const cards = relevantVideos(report, rows);
  const stale = freshness === 'evidence_changed' || freshness === 'brief_changed';

  return (
    <article className="relevance-report space-y-5">
      <header className="avoid-break border-b border-line pb-4">
        <p className="rail">Brand relevance</p>
        <h1 className="mt-1 break-words text-[22px] font-semibold tracking-tight text-ink">
          {report.title} for {context.brand.name}
        </h1>
        <p className="mt-1 text-[12px] text-ink-muted">
          {context.campaign ? `Campaign: ${context.campaign.name}` : 'Brand-level read — no campaign selected'}
        </p>
      </header>

      {/* The brief, compactly, so a reader knows what question was asked. */}
      <section className="report-section avoid-break rounded-lg border border-indigo/25 bg-indigo-wash/40 p-4">
        <h2 className="text-[13px] font-semibold text-ink">What was asked</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {[
            ['Brand', context.brand.name],
            ['Product', context.campaign?.product ?? context.brand.sells],
            ['Customer problem', context.campaign?.useCase ?? context.brand.customerNeeds],
            ['Objective', context.campaign?.objective ?? null],
            ['Categories', context.brand.categories.join(', ') || null],
          ]
            .filter(([, value]) => Boolean(value))
            .map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-[10px] uppercase tracking-[0.09em] text-ink-faint">{label}</dt>
                <dd className="text-[12px] leading-relaxed text-ink">{value}</dd>
              </div>
            ))}
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={FRESHNESS_TONE[freshness]}>{FRESHNESS_LABEL[freshness]}</Badge>
        {writtenAt ? (
          <span className="tnum text-[11px] text-ink-faint">
            Written {shortDate(writtenAt)}
            {writtenAgainst ? ` against evidence collected ${shortDate(writtenAgainst)}` : ''}
          </span>
        ) : null}
      </div>
      {stale ? (
        <p className="avoid-break rounded-lg border border-amber/30 bg-amber-wash px-3 py-2 text-[12px] leading-relaxed text-ink">
          {freshness === 'evidence_changed'
            ? 'This was written against an older collection. Run it again to read the current evidence.'
            : 'The brief has changed since this was written. Run it again to answer the new question.'}
        </p>
      ) : null}

      <section className="report-section avoid-break rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-ink">Requirements and evidence</h2>
          <p className="tnum text-[11px] text-ink-faint">
            {counts.supported} supported · {counts.partial} partial · {counts.unverified} unverified ·{' '}
            {counts.conflicting} conflicting
          </p>
        </div>
        <div className="mt-2.5">
          <RequirementsMatrix rows={rows} videos={report.videos} />
        </div>
      </section>

      <section className="report-section avoid-break rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold text-ink">Uploads supporting a requirement</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
          Matched on upload titles from the collected sample. adfit has not watched these, and has no
          transcript or scene-level evidence.
        </p>
        <div className="mt-2.5">
          <RelevantVideoCards items={cards} brandName={context.brand.name} />
        </div>
      </section>

      {narrative ? (
        <section className="report-section avoid-break rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[14px] font-semibold text-ink">Reading of the evidence</h2>
            <Badge tone={narrative.confidence === 'supported' ? 'emerald' : narrative.confidence === 'directional' ? 'amber' : 'slate'}>
              {narrative.confidence === 'supported'
                ? 'Supported by evidence'
                : narrative.confidence === 'directional'
                  ? 'Directional'
                  : 'Not enough evidence'}
            </Badge>
          </div>
          {narrative.confidenceReason ? (
            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{narrative.confidenceReason}</p>
          ) : null}
          <dl className="mt-3 space-y-2.5">
            {[
              ['Relevance', narrative.relevance],
              ['What commenters ask', narrative.audienceSignal],
              ['Sponsorship history', narrative.sponsorshipRead],
              ['Brand safety', narrative.brandRisk],
            ]
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <div key={label as string} className="avoid-break">
                  <dt className="text-[10px] uppercase tracking-[0.09em] text-ink-faint">{label}</dt>
                  <dd className="text-[12px] leading-relaxed text-ink">{value}</dd>
                </div>
              ))}
          </dl>

          {narrative.suggestedAngles.length ? (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="text-[12px] font-semibold text-ink">
                Possible approaches
                <span className="ml-1.5 font-normal text-ink-faint">proposals, not findings</span>
              </h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12px] leading-relaxed text-ink">
                {narrative.suggestedAngles.slice(0, 2).map((angle) => (
                  <li key={angle}>{angle}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                Whether the creator would take these on, at what price, and with what rights, is not
                something public data shows. Ask.
              </p>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="report-section avoid-break rounded-lg border border-line bg-surface p-4">
          <h2 className="text-[14px] font-semibold text-ink">Reading of the evidence</h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
            The written reading isn’t available here. The requirements above are matched from
            collected metadata and don’t depend on it.
          </p>
        </section>
      )}

      <section className="report-section avoid-break rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold text-ink">Confirm before contacting them</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-ink">
          {[...new Set([...(narrative?.beforeYouSign ?? []), ...rows.map((r) => r.confirm)])]
            .slice(0, 6)
            .map((question) => (
              <li key={question}>{question}</li>
            ))}
        </ul>
      </section>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        This is an interpretation of public evidence for {context.brand.name}. It states nothing
        about who watches this channel, what they bought, what the creator has used, who has
        sponsored them, or what a collaboration would achieve.
      </p>
    </article>
  );
}
