import { Info } from 'lucide-react';

import type { AIReport } from '@/types';
import { assessReport, type ReportSufficiency } from '@/lib/report/sufficiency';
import { currency, exactNumber, percent } from '@/lib/format';
import { LockedPanel } from './LockedPanel';
import { cn } from '@/lib/cn';
import { DERIVED_DISCLOSURE } from '@/lib/report/policy';
import { INTENT_WEIGHTS } from '@/lib/report/intent';

/**
 * The four decisive figures, each against its cohort.
 *
 * This replaced a verdict strip that put a written judgement — "Strong
 * commercial fit", and a sentence restating the tiles — above the numbers. The
 * tiles carry the read on their own; the sentence was interpretation the buyer
 * is better placed to make.
 *
 * What survives alongside them is not commentary: the sufficiency notice says
 * what the sample cannot support, and the risk callout surfaces a flag that
 * would otherwise sit three panels down.
 */
export function MetricsStrip({
  report,
  /**
   * What the product still owes this report, in a sentence, or null.
   *
   * Supplied only to the creator viewing their own profile — see the profile
   * page. It sits with the sufficiency gaps rather than in a banner of its own
   * because it IS a sufficiency gap: the same absence, with the extra fact that
   * something is on its way to filling it.
   */
}: {
  report: AIReport | null;
}) {
  const locked = report === null;
  const sufficiency = report ? assessReport(report) : null;


  const cost = report?.costEfficiency ?? null;
  const perf = report?.sponsoredPerformance ?? null;
  const flags = report?.brandSafetyFlags ?? [];
  const raised = flags.filter((flag) => flag.severity !== 'none');
  // "Assessed" now means checks actually ran, rather than a score existing.
  // Zero flags is not a clean result — it is an absent one, and the tile has
  // to keep saying so now that the score is gone. A census scan counts: it is
  // a check that ran even on a row that carries no named flags.
  const assessed = !locked && report.brandSafety.checked > 0;



  const tiles = [
    {
      label: 'Purchase intent',
      value: locked
        ? '00.0%'
        : report.purchaseIntentRate === null
          ? '—'
          : percent(report.purchaseIntentRate),
      // The denominator, not a ranking. Cross-creator percentiles are off for
      // good (III.E.2), so "No cohort ranking yet" was a standing promise of
      // something that is not coming — and the space is better spent saying
      // what the number is a share OF, which is the question this figure has
      // been misread on more than any other.
      context: locked
        ? '—'
        : report.purchaseIntentRate === null
          ? // FOUR ways for this to be null, and they are four different facts.
            // The tile said "No readable comments" for all of them, which is
            // the only one that blames the audience — and the least likely.
            //
            // The last is the one real data forced: @가재맨's 2,392 comments
            // are fully classified and NOT ONE is about something purchasable,
            // so the product denominator is empty. That is unmeasurable, not
            // zero. A creator who never holds a product does not have an
            // audience that refuses to buy.
            sufficiency?.unclassified
            ? `${exactNumber(report.commentsAnalyzed)} comments read, not yet classified`
            : report.intent?.basis === 'product_comments' && report.intent.commentsScored === 0
              ? `nothing purchasable in ${exactNumber(report.commentsAnalyzed)} comments`
              : 'No readable comments'
          : report.intent && report.intent.commentsScored > 0
            ? report.intent.basis === 'product_comments'
              ? `of ${exactNumber(report.intent.commentsScored)} comments about a product`
              : `of all ${exactNumber(report.intent.commentsScored)} comments scored`
            : 'of all analysed comments',
      tone: undefined,
    },
    {
      label: 'Estimated CPM',
      value: locked ? '$000' : cost ? currency(Math.round(cost.estimatedCpm), cost.currency) : '—',
      context: locked
        ? '—'
        : !cost
          ? 'No published minimum to price from'
          : `from a ${currency(cost.basisBudget, cost.currency)} minimum against ${exactNumber(cost.medianViews)} median views`,
      tone: undefined,
    },
    {
      label: 'Sponsored retention',
      value: locked ? '00%' : perf ? percent(perf.viewRetention, 0) : '—',
      context: locked ? '—' : perf ? 'of organic views' : 'No sponsored history',
      tone: !locked && perf && perf.viewRetention >= 0.9 ? ('emerald' as const) : undefined,
    },
    {
      // COUNT, NOT SCORE. "68.0/100" was the last composite left in the report
      // and it had the same defect as the off-platform sentiment average it
      // outlived: it blended incommensurable things — a share of comments, a
      // share of sponsored posts, a creator's own conduct — into one number
      // whose movement nobody could attribute. A buyer cannot act on 68; they
      // can act on "2 flags raised, one of them disclosure".
      label: 'Comment climate',
      // What was found, not how many. "2" is a score in disguise — it invites
      // comparing creators on a number again, which is the habit the composite
      // was removed to break. The severity says how bad and the categories say
      // what, and between them a buyer can decide without ranking anyone.
      // WHAT IT IS LIKE IN THERE, not what is in there.
      //
      // This tile used to carry the risk categories — "profanity, competitor
      // conflict, disclosure rate · 3 of 4 checks" — which is accurate and is
      // the wrong first thing to say. Six category names do not add up to an
      // impression, so every reader assembled their own, and they did not
      // agree. The categories are still a click away and still the evidence;
      // the headline is now the answer to the question people actually open
      // the report with. NOT A RATING: `hostile` is a different buy, not a
      // worse creator. See src/lib/report/climate.ts.
      value: locked ? '00' : (report.climate.label ?? (assessed ? 'no scan' : '—')),
      context: locked
        ? '—'
        : report.climate.label !== null
          ? [
              `${percent(report.climate.basis.hostileShare ?? 0, 1)} of ${exactNumber(report.climate.basis.scanned ?? 0)} comments read`,
              ...report.climate.traits,
            ].join(' · ')
          : !assessed
            ? 'Not assessed — no comments'
            : raised.length > 0
              ? `${raised.map((f) => f.category.toLowerCase()).join(', ')} · ${raised.length} of ${report.brandSafetyFlags.length} checks`
              : `${report.brandSafety.checked} checks, nothing raised`,
      // Only `warm` earns the positive colour. `ordinary` is not good news,
      // it is no news, and colouring it green would make the absence of a
      // finding look like a finding.
      tone: !locked && report.climate.label === 'warm' ? ('emerald' as const) : undefined,
    },
  ];

  return (
    <LockedPanel
      title="Ad-fit index"
      meta={
        locked
          ? undefined
          : report.benchmarks && sufficiency?.benchmarks !== 'insufficient'
            ? `vs ${report.benchmarks.cohortSize} in cohort`
            : undefined
      }
      locked={locked}
      headline="Quantitative ad-fit metrics are locked"
      detail="Purchase intent, cost per outcome, sponsored performance, and brand safety, each with the size of the sample behind it."
    >
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile, index) => (
          <div
            key={tile.label}
            className={cn(
              'px-5 py-4',
              index % 2 === 0 && 'border-r border-line',
              index < 2 && 'border-b border-line lg:border-b-0',
              'lg:border-r lg:border-line last:lg:border-r-0',
            )}
          >
            <div className="rail">{tile.label}</div>
            <div
              className={cn(
                'tnum mt-2 text-[26px] font-medium leading-none tracking-tight',
                tile.tone === 'emerald' && 'text-emerald',
              )}
            >
              {tile.value}
            </div>
            <p className="tnum mt-2 text-[10px] text-ink-faint">{tile.context}</p>
          </div>
        ))}
      </div>

      {/* The method, printed beside the number.
          Purchase intent is the figure in this report most likely to be
          misread, and every misreading so far has been about the denominator —
          a share of the product conversation taken for a share of the
          audience, or for a forecast of buyers. A reader who can see what was
          divided by what cannot make either mistake, and one who disagrees
          with the weights can say so, which they cannot do if the weights are
          invisible. */}
      {!locked && report.intent && report.intent.rate !== null ? (
        <details className="border-t border-line px-5 py-2.5">
          <summary className="cursor-pointer text-[11px] text-ink-muted marker:text-ink-faint">
            How purchase intent is calculated
          </summary>
          <div className="tnum mt-2 space-y-1.5 text-[11px] leading-relaxed text-ink-faint">
            {report.intent.basis === 'product_comments' ? (
              <p>
                Weighted over the{' '}
                <span className="text-ink">
                  {exactNumber(report.intent.commentsScored)} comments attached to a product
                </span>
                , not all {exactNumber(report.commentsAnalyzed)}. A creator who rarely holds a
                product would otherwise read as an audience that never buys — that measures what
                they film, not who watches.
              </p>
            ) : (
              <p>
                Weighted over{' '}
                <span className="text-ink">
                  all {exactNumber(report.intent.commentsScored)} comments scored
                </span>
                , because no product cross-tab has been recorded for this creator yet. That is a
                wider denominator than a product-basis figure, so it reads lower for the same
                audience and{' '}
                <span className="text-ink">the two are not comparable to each other</span>.
              </p>
            )}
            <p>
              Each comment counts for what it wants:{' '}
              {(report.intent.basis === 'product_comments'
                ? ([
                    ['product:buy', 'asking where to buy'],
                    ['product:ask', 'specs and comparisons'],
                    ['product:request', 'asking for more of it'],
                    ['product:praise', 'admiring it'],
                    ['product:criticise', 'objecting to it'],
                  ] as const)
                : ([
                    ['product:buy', 'asking where to buy'],
                    ['product:ask', 'specs and comparisons'],
                    ['product:request', 'asking for more of it'],
                    ['creator:buy', 'buying because of the creator'],
                    ['product:praise', 'admiring it'],
                    ['content:request', 'asking for more like it'],
                    ['product:criticise', 'objecting to it'],
                  ] as const)
              ).map(([key, label], i) => (
                <span key={key}>
                  {i > 0 ? ', ' : ''}
                  {label} <span className="text-ink">{INTENT_WEIGHTS[key]}</span>
                </span>
              ))}
              .{' '}
              {report.intent.basis === 'product_comments'
                ? 'Reacting to a product counts'
                : 'Everything else counts'}{' '}
              <span className="text-ink">0</span> and stays in the denominator — attention that
              did not convert.
            </p>
            {report.intent.ciLow !== null && report.intent.ciHigh !== null ? (
              <p>
                95% interval{' '}
                <span className="text-ink">
                  {percent(report.intent.ciLow, 1)}–{percent(report.intent.ciHigh, 1)}
                </span>
                . Commenters are a self-selected fraction of viewers, so this compares creators —
                it is not a forecast of how many people will buy.
              </p>
            ) : null}
          </div>
        </details>
      ) : null}

      {/* Required wherever our own figures sit beside YouTube's: III.E.4.h
          wants "a clear and prominent disclosure there that such information,
          data and metrics are not from YouTube and are part of your own
          product". Under the tiles rather than in the page footer, because
          "there" means beside the numbers it describes. */}
      {!locked ? (
        <p className="border-t border-line px-5 py-2.5 text-[10px] leading-relaxed text-ink-faint">
          {DERIVED_DISCLOSURE}
        </p>
      ) : null}

      {/*
        `unclassified` opens this on its own, and has to. `overall` can come
        back 'sufficient' on a corpus that is large and entirely unclassified —
        a channel with plenty of comments and a sponsored history clears every
        threshold this function measures, because none of them look at whether
        the classifier ever ran. The notice would then be hidden and nothing
        would explain why the intent figures are blank.

        This used to key on the JOB, which meant the explanation appeared only
        while a job existed. The gap is a property of the report, not of our
        queue, and it outlives any particular run.
      */}
      {sufficiency && (sufficiency.overall !== 'sufficient' || sufficiency.unclassified) ? (
        <SufficiencyNotice
          sufficiency={sufficiency}
          commentsAnalyzed={report?.commentsAnalyzed ?? 0}
        />
      ) : null}

    </LockedPanel>
  );
}


/** What the sample cannot support, and why. Not commentary — a limit. */
function SufficiencyNotice({
  sufficiency,
  commentsAnalyzed,
}: {
  sufficiency: ReportSufficiency;
  commentsAnalyzed: number;
}) {
  return (
    <div className="border-t border-line bg-surface px-5 py-3.5">
      <p className="flex items-center gap-2 text-[12px] font-medium text-ink">
        <Info className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
        {sufficiency.overall === 'insufficient'
          ? `Provisional — ${exactNumber(commentsAnalyzed)} comments is below our reporting threshold`
          : sufficiency.overall === 'limited'
            ? 'Limited sample — read the figures as directional'
            : // Opened by a pending pass alone. The sample is fine; a pass has
              // not run over it yet, and calling that a "limited sample" would
              // blame the corpus for our own missing work.
              'Still filling in'}
      </p>
      <ul className="mt-2 space-y-1">
        {sufficiency.gaps.map((gap) => (
          <li key={gap} className="text-[11px] leading-relaxed text-ink-muted">
            {gap}
          </li>
        ))}
      </ul>
    </div>
  );
}
