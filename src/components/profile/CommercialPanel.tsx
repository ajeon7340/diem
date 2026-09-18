import { sponsorshipState } from '@/lib/report/sponsorship';
import { FINANCIAL_DISCLOSURE } from '@/lib/report/policy';
import type { AdFatigueLevel, CostEfficiency, SponsoredPerformance } from '@/types';
import { Info, ShieldQuestion } from 'lucide-react';

import { Stat } from '@/components/ui/Stat';
import { compactNumber, currency, percent, score } from '@/lib/format';
import { LockedPanel } from './LockedPanel';
import { cn } from '@/lib/cn';

/** Organic → sponsored, as one line rather than a chart. */
/**
 * A before/after pair, or an explicit "not measured".
 *
 * `from` and `to` used to be required numbers, and the fallout was the sharpest
 * version of the rule this report is built on. A creator with no sentiment pass
 * carried 0 and 0; `change` was computed as `from === 0 ? 0 : ...`, so it came
 * out as no change; no change is coloured EMERALD. The panel rendered
 * "0.0 → 0.0 +0%" in green, on a 0-100 scale where 0 is the worst score
 * there is — a confident, flat, healthy result for a figure nobody measured.
 *
 * Null is a first-class input now, and there is no arithmetic to do on it.
 */
function Delta({
  label,
  from,
  to,
  format,
  locked,
  unmeasured = 'Not measured.',
}: {
  label: string;
  from: number | null;
  to: number | null;
  format: (value: number) => string;
  locked: boolean;
  /** What to say instead of a number. Never a bare dash — that reads as a bug. */
  unmeasured?: string;
}) {
  if (!locked && (from === null || to === null)) {
    return (
      <div className="px-5 py-4">
        <div className="rail">{label}</div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">{unmeasured}</p>
      </div>
    );
  }

  const a = from ?? 0;
  const b = to ?? 0;
  // A zero baseline has no percentage change — the division is undefined, not
  // zero — so the chip is withheld rather than printed as +0%.
  const change = a === 0 ? null : (b - a) / a;
  const tone =
    change === null
      ? 'text-ink-faint'
      : change >= -0.1
        ? 'text-emerald'
        : change < -0.2
          ? 'text-rose'
          : 'text-ink-muted';

  return (
    <div className="px-5 py-4">
      <div className="rail">{label}</div>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="tnum text-[15px] text-ink-muted">{locked ? '—' : format(a)}</span>
        <span className="text-ink-faint" aria-hidden>
          →
        </span>
        <span className="tnum text-[19px] font-medium text-ink">{locked ? '—' : format(b)}</span>
        {!locked && change !== null ? (
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
  disclosedPromotions = 0,
  locked,
}: {
  cost: CostEfficiency | null;
  performance: SponsoredPerformance | null;
  engagementRate: number | null;
  adFatigueLevel: AdFatigueLevel | null;
  hasMinimumBudget: boolean;
  /**
   * Paid placements the promotions scan actually found.
   *
   * Separate from `performance` because the two answer different questions:
   * this one is whether the creator has EVER been sponsored, and that one is
   * whether we could MEASURE how a sponsorship performed. A channel that runs
   * a sponsor segment on every upload has no organic video left in the window
   * to measure against, so the second is null while the first is 25.
   */
  disclosedPromotions?: number;
  /** Set when the sponsored sample is too thin to lean on. */
  sponsoredConfidence: string | undefined;
  locked: boolean;
}) {
  // Never sponsored is a position, not an absence — and it changes what the
  // headline CPM means, because every view behind it is organic.
  //
  // It is NOT the same as having no measurement, and conflating them printed
  // the worst sentence this report has produced: "No sponsorship history — the
  // audience has not been sold to here", on a channel whose own panel two
  // sections down read "25 posts · 25 disclosed". Every upload in the window
  // carried YouTube's own paid-placement flag, which left no organic video to
  // compute a baseline from — so `performance` came back null and was read as
  // "never".
  //
  // A buyer acts on that. It is the difference between an untouched audience
  // and one that sees a sponsor segment every week.
  const state = sponsorshipState(performance, disclosedPromotions);
  const neverSponsored = !locked && state === 'never';
  const sponsoredButUnmeasured = !locked && state === 'unmeasurable';
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
          : disclosedPromotions > 0
            ? `${disclosedPromotions} disclosed · not measurable`
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
            ? // Was "Not enough view history yet", which blamed the creator's
              // catalogue — it said that on a channel with 667 uploads and a
              // 6,614-view median, because nothing computed the figure at all.
              // Now that something does, this can only mean the channel
              // analysis has not produced a median yet, and says so.
              'A CPM needs a median view count and the channel analysis has not produced one yet.'
            : 'No published price, so there is no basis to estimate CPM from. Ask for a rate card.'}
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
                : // Same distinction as the panel below. Saying "no sponsored
                  // history" beside a count of 25 disclosed placements is the
                  // contradiction, not the missing number.
                  sponsoredButUnmeasured
                  ? 'No organic post in the window to adjust against'
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

      {sponsoredButUnmeasured ? (
        <div className="px-5 py-4">
          <div className="flex items-center gap-2">
            <ShieldQuestion className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
            <h3 className="text-[13px] font-medium text-ink">
              Sponsored, but the lift cannot be measured
            </h3>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div>
              <dt className="rail">What we found</dt>
              <dd className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                {disclosedPromotions} paid {disclosedPromotions === 1 ? 'placement' : 'placements'},
                disclosed on YouTube by the creator. This is an audience that is sold to.
              </dd>
            </div>
            <div>
              <dt className="rail text-amber">Why there is no figure</dt>
              <dd className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                Every upload we read carried a paid placement, so there is no organic post left in
                the window to measure them against. A sponsored-versus-organic number needs both
                halves, and inventing the missing one would be the whole claim.
              </dd>
            </div>
          </dl>
        </div>
      ) : neverSponsored ? (
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
                unmeasured="The sentiment pass has not run on the sponsored posts, so there is nothing to compare against. Not a flat result, an absent one."
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
