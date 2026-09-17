import { FINANCIAL_DISCLOSURE } from '@/lib/report/policy';
import type { AdFatigueLevel, CostEfficiency, SponsoredPerformance } from '@/types';
import { Info, ShieldQuestion } from 'lucide-react';

import { Stat } from '@/components/ui/Stat';
import { compactNumber, currency, percent, score } from '@/lib/format';
import { LockedPanel } from './LockedPanel';
import { cn } from '@/lib/cn';

/** Organic → sponsored, as one line rather than a chart. */
function Delta({
  label,
  from,
  to,
  format,
  locked,
}: {
  label: string;
  from: number;
  to: number;
  format: (value: number) => string;
  locked: boolean;
}) {
  const change = from === 0 ? 0 : (to - from) / from;
  const tone = change >= -0.1 ? 'text-emerald' : change < -0.2 ? 'text-rose' : 'text-ink-muted';

  return (
    <div className="px-5 py-4">
      <div className="rail">{label}</div>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="tnum text-[15px] text-ink-muted">{locked ? '—' : format(from)}</span>
        <span className="text-ink-faint" aria-hidden>
          →
        </span>
        <span className="tnum text-[19px] font-medium text-ink">{locked ? '—' : format(to)}</span>
        {!locked ? (
          <span className={cn('tnum text-[12px]', tone)}>
            {change >= 0 ? '+' : ''}
            {(change * 100).toFixed(0)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Cost and sponsored performance, both on screen at once.
 *
 * These were briefly tabbed to save height, which put half the commercial
 * picture one click away from the other half — and the two are read together:
 * what it costs only means something next to whether the money works here.
 * Server component again now that there is no local state.
 */
export function CommercialPanel({
  cost,
  performance,
  engagementRate,
  adFatigueLevel,
  hasMinimumBudget,
  sponsoredConfidence,
  locked,
}: {
  cost: CostEfficiency | null;
  performance: SponsoredPerformance | null;
  engagementRate: number | null;
  adFatigueLevel: AdFatigueLevel | null;
  hasMinimumBudget: boolean;
  /** Set when the sponsored sample is too thin to lean on. */
  sponsoredConfidence: string | undefined;
  locked: boolean;
}) {
  // Never sponsored is a position, not an absence — and it changes what the
  // headline CPM means, because every view behind it is organic.
  const neverSponsored = !locked && performance === null;
  // The creator's OWN retention, not a category median. The median was a
  // cross-owner aggregate — forbidden by III.E.2 and stripped to null, so this
  // read as a permanent blank — and their own figure was always the better
  // one anyway: what a placement costs here depends on how THIS creator's paid
  // posts hold up, not on how the category's do.
  const retention = performance?.viewRetention ?? null;
  const adjustedCpm =
    cost && retention && retention > 0 ? cost.estimatedCpm / retention : null;

  const perf =
    performance ??
    ({
      sponsoredPostsAnalyzed: 0,
      windowDays: 180,
      organicMedianViews: 100,
      sponsoredMedianViews: 72,
      viewRetention: 0.72,
      organicSentiment: 70,
      sponsoredSentiment: 62,
    } satisfies SponsoredPerformance);

  const meta = locked
    ? undefined
    : [
        cost ? `at ${currency(cost.basisBudget, cost.currency)}` : null,
        performance
          ? `${perf.sponsoredPostsAnalyzed} ${perf.sponsoredPostsAnalyzed === 1 ? 'post' : 'posts'} · ${perf.windowDays}d${
              adFatigueLevel ? ` · fatigue ${adFatigueLevel}` : ''
            }`
          : 'never sponsored',
      ]
        .filter(Boolean)
        .join(' · ') || undefined;

  return (
    <LockedPanel
      title="Commercial"
      meta={meta}
      locked={locked}
      headline="Cost and sponsored performance are locked"
      detail="Estimated CPM, and how this creator's paid posts held up against their own organic baseline."
    >
      {!locked && !cost ? (
        <p className="border-b border-line px-5 py-6 text-center text-[12px] leading-relaxed text-ink-muted">
          {hasMinimumBudget
            ? 'Not enough view history yet to derive a CPM.'
            : 'No published minimum budget, so there is no basis to estimate CPM from. Ask for a rate card.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 border-b border-line">
          <Stat
            label="Cost / 1k engaged"
            value={cost ? currency(Math.round(cost.costPerThousandEngaged), cost.currency) : '$0,000'}
            hint={
              engagementRate !== null && !locked
                ? `At a ${percent(engagementRate, 2)} engagement rate`
                : 'CPM adjusted by engagement rate'
            }
            className="border-r border-line"
          />
          {/* Replaces a "Category median CPM" that could only ever be blank.
              This one is computable from the creator's own history and is the
              figure a buyer actually plans against: what a sponsored thousand
              views costs, given that sponsored posts hold fewer of them. */}
          <Stat
            label="Sponsored-adjusted CPM"
            value={adjustedCpm && cost ? currency(Math.round(adjustedCpm), cost.currency) : '—'}
            hint={
              adjustedCpm && retention
                ? `their paid posts hold ${percent(retention, 0)} of organic views`
                : 'No sponsored history to adjust by'
            }
          />
        </div>
      )}

      {/* The derived-metrics amendment requires financial projections to state
          they are not approved by Google. The panel already said this was an
          estimate rather than a rate card; this is the same caveat with the
          wording the policy asks for, stated once in policy.ts. */}
      {!locked && cost ? (
        <p className="border-b border-line px-5 py-2.5 text-[10px] leading-relaxed text-ink-faint">
          {FINANCIAL_DISCLOSURE}
        </p>
      ) : null}

      {neverSponsored && cost ? (
        <p className="flex items-start gap-2 border-b border-line bg-amber-wash px-5 py-2.5 text-[11px] leading-relaxed text-ink-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden />
          <span>
            <strong className="font-medium text-ink">Organic views only.</strong> Every view behind
            this CPM is unsponsored, and sponsored posts retain less. Budget nearer a higher
            effective CPM — how much higher cannot be said until they have run one.
          </span>
        </p>
      ) : null}

      {neverSponsored ? (
        <div className="px-5 py-4">
          <div className="flex items-center gap-2">
            <ShieldQuestion className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
            <h3 className="text-[13px] font-medium text-ink">No sponsorship history</h3>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div>
              <dt className="rail text-emerald">In favour</dt>
              <dd className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                No ad fatigue, no competitor conflict, no exclusivity to clear. The audience has
                not been sold to here.
              </dd>
            </div>
            <div>
              <dt className="rail text-amber">Against</dt>
              <dd className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                Untested under a paid placement. There is no evidence of how this audience reacts
                to the first one, and no organic baseline to measure it against.
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <>
          <div className="grid gap-px bg-line sm:grid-cols-2">
            <div className="bg-surface">
              <Delta
                label="Median views · organic → sponsored"
                from={perf.organicMedianViews}
                to={perf.sponsoredMedianViews}
                format={compactNumber}
                locked={locked}
              />
            </div>
            <div className="bg-surface">
              <Delta
                label="Comment sentiment /100 · organic → sponsored"
                from={perf.organicSentiment}
                to={perf.sponsoredSentiment}
                format={(value) => score(value)}
                locked={locked}
              />
            </div>
          </div>
          {sponsoredConfidence && !locked ? (
            <p className="border-t border-line bg-paper px-5 py-2.5 text-[11px] text-ink-muted">
              {sponsoredConfidence === 'limited sample'
                ? `Only ${perf.sponsoredPostsAnalyzed} sponsored ${perf.sponsoredPostsAnalyzed === 1 ? 'post' : 'posts'} — anecdotal, not a trend.`
                : 'Not enough sponsored history to read as a trend.'}
            </p>
          ) : null}
        </>
      )}
    </LockedPanel>
  );
}
