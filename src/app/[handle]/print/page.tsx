import { OFF_PLATFORM_PANEL } from '@/lib/report/policy';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BadgeCheck, Lock } from 'lucide-react';

import { resolveProfileAccess } from '@/lib/access/gatekeeper';
import { assessReport } from '@/lib/report/sufficiency';
import { RESIDUAL_ID, orderClusters, withResidual } from '@/lib/report/clusters';

/** Short forms — a print row has roughly forty characters to work with. */
const PRINT_OBJECT: Record<string, string> = {
  creator: 'creator',
  content: 'video',
  product: 'product',
  unclassified: 'unreadable',
};
const PRINT_INTENT: Record<string, string> = {
  buy: 'buy',
  request: 'request',
  ask: 'ask',
  praise: 'praise',
  criticise: 'criticise',
  react: 'react',
  unclassified: 'unclassified',
};
const PRINT_AXIS = { object: PRINT_OBJECT, intent: PRINT_INTENT } as const;
import { isUnlocked, type AIReport, type Creator, type SocialPlatform } from '@/types';
import {
  SENTIMENT_SCALE,
  axisLabel,
  axisMax,
  compactNumber,
  currency,
  linkHost,
  exactNumber,
  largestRemainder,
  percent,
  score,
  shortDate,
  signedSentiment, budgetRange } from '@/lib/format';
import { PrintToolbar } from './PrintToolbar';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Report', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
};

const SEVERITY_RANK = { high: 3, medium: 2, low: 1, none: 0 } as const;

function Box({
  title,
  meta,
  className,
  children,
}: {
  title: string;
  meta?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('sheet-box', className)}>
      <header className="sheet-head flex items-baseline justify-between gap-2">
        <h2 className="rail">{title}</h2>
        {meta ? <span className="tnum text-[5.8pt] text-ink-faint">{meta}</span> : null}
      </header>
      <div className="sheet-body">{children}</div>
    </section>
  );
}

/** Label / value line — the sheet's only repeating primitive. */
function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[1.5px]">
      <span className="truncate text-ink-muted">{label}</span>
      <span className={cn('tnum shrink-0 font-medium', tone ?? 'text-ink')}>{value}</span>
    </div>
  );
}

/** Drawn against an axis set above the peak — see `axisMax`. */
function Bar({ share, max, tone = 'bg-indigo' }: { share: number; max: number; tone?: string }) {
  const width = Math.min(100, (share / (max || 1)) * 100);
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-paper">
      <div className={cn('h-full rounded-full', tone)} style={{ width: `${width}%` }} />
    </div>
  );
}

/**
 * One-page export of the full report.
 *
 * A separate route rather than print rules over the profile, for one reason:
 * the interactive panels hide most of their content behind tabs, so printing
 * the profile would emit a quarter of the demographics and one comment quote.
 * Here everything is expanded and laid out for A4.
 *
 * Entitlement runs through the same gatekeeper as the profile — if you cannot
 * read the report you cannot print it — and the sheet records who it was issued
 * to, so a leaked PDF is traceable to a grant.
 */
export default async function PrintReportPage({
  params,
  searchParams,
}: {
  params: { handle: string };
  searchParams: { token?: string | string[]; auto?: string };
}) {
  const view = await resolveProfileAccess(params.handle, searchParams.token);
  if (!view) notFound();

  const { creator, access } = view;

  if (!isUnlocked(view)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface">
          <Lock className="h-4 w-4 text-ink-faint" aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">
          This report is locked
        </h1>
        <p className="mt-2 text-[13px] text-ink-muted">
          Printing needs the same access as reading. Request access on{' '}
          {creator.displayName}&apos;s profile first.
        </p>
      </main>
    );
  }

  const report = view.report;
  const issuedTo =
    access.mode === 'token'
      ? access.grant.companyName
      : access.mode === 'pro_agency'
        ? access.organization.name
        : 'the creator';

  return (
    <>
      <PrintToolbar auto={searchParams.auto === '1'} />
      <div className="sheet-frame">
        <div className="sheet">
          <Sheet creator={creator} report={report} issuedTo={issuedTo} />
        </div>
      </div>
    </>
  );
}

function Sheet({
  creator,
  report,
  issuedTo,
}: {
  creator: Creator;
  report: AIReport;
  issuedTo: string;
}) {
  const sufficiency = assessReport(report);
  const cost = report.costEfficiency;
  const perf = report.sponsoredPerformance;
  // Same switch as the web report — a PDF that carries a panel the page has
  // stopped serving is how two surfaces start disagreeing about what the
  // product says.
  const opinion = OFF_PLATFORM_PANEL ? report.publicOpinion : null;
  const output = report.outputStats;

  const intentPct =
    sufficiency.benchmarks === 'insufficient'
      ? null
      : (report.benchmarks?.metrics.find((m) => m.metric === 'purchaseIntent')?.percentile ?? null);

  // Every bucket, ordered by share with the residual last. The screen panel
  // used to filter `off_topic` out while keeping the full denominator; the
  // print-out did the same, and a PDF is the copy that gets forwarded without
  // anyone able to ask what the missing 54% was.
  const clusters = orderClusters(
    withResidual(report.topCommentClusters, report.commentsAnalyzed ?? 0),
  );
  const clusterShares = largestRemainder(clusters.map((c) => c.share));
  const axes = report.commentAxes;
  const clusterAxis = axisMax(Math.max(...clusters.map((c) => c.share), 0.01));
  const flags = [...report.brandSafetyFlags].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );

  return (
    <>
      {/* Masthead */}
      <header className="flex items-end justify-between gap-4 border-b-[0.8pt] border-ink pb-2">
        <div>
          <p className="rail">adfit · verified ad-fit report</p>
          <h1 className="mt-1 flex items-center gap-1.5 text-[15pt] font-semibold leading-none tracking-tight">
            {creator.displayName}
            {creator.isVerified ? (
              <BadgeCheck className="h-3.5 w-3.5 text-emerald" aria-label="Verified" />
            ) : null}
          </h1>
          <p className="tnum mt-1 text-ink-muted">
            @{creator.handle}
            {creator.niche ? ` · ${creator.niche}` : ''} · {compactNumber(creator.totalFollowers)}{' '}
            audience
            {budgetRange(creator) ? ` · ${budgetRange(creator)}` : ''}
          </p>
        </div>
        <div className="tnum shrink-0 text-right text-[6pt] text-ink-faint">
          <p>Issued to {issuedTo}</p>
          <p>Analysed {shortDate(report.lastAnalyzedAt)}</p>
          <p>{exactNumber(report.commentsAnalyzed)} comments</p>
        </div>
      </header>

      {/* Headline figures */}
      <div className="sheet-box mt-2 border-[0.5pt] border-line bg-paper px-2.5 py-2">
        <div className="grid grid-cols-4 gap-2">
          {[
            {
              l: 'Purchase intent',
              v: report.purchaseIntentRate === null ? '—' : percent(report.purchaseIntentRate),
              c: intentPct === null ? 'no ranking' : `${Math.round(intentPct)}th pct`,
            },
            {
              l: 'Est. CPM',
              v: cost ? currency(Math.round(cost.estimatedCpm), cost.currency) : '—',
              c: cost?.cohortMedianCpm
                ? `median ${currency(Math.round(cost.cohortMedianCpm))}`
                : 'no median',
            },
            {
              l: 'Sponsored retention',
              v: perf ? percent(perf.viewRetention, 0) : '—',
              c: perf ? `${perf.sponsoredPostsAnalyzed} posts` : 'no history',
            },
            {
              l: 'Brand safety',
              v:
                report.raisedFlags === null
                  ? '—'
                  : report.raisedFlags === 0
                    ? `clear of ${report.checkedFlags ?? 0}`
                    : `${report.raisedFlags} of ${report.checkedFlags ?? 0} raised`,
              c: `${flags.filter((f) => f.severity !== 'none').length} flags`,
            },
          ].map((tile) => (
            <div key={tile.l}>
              <div className="rail">{tile.l}</div>
              <div className="tnum text-[11pt] font-medium leading-none">{tile.v}</div>
              <div className="tnum text-[5.8pt] text-ink-faint">{tile.c}</div>
            </div>
          ))}
        </div>
        {sufficiency.overall !== 'sufficient' ? (
          <p className="mt-1.5 border-t-[0.4pt] border-line pt-1.5 text-[6pt] leading-snug text-ink-muted">
            <strong className="font-medium text-ink">
              {sufficiency.overall === 'insufficient' ? 'Provisional' : 'Limited sample'}
            </strong>{' '}
            — {sufficiency.gaps.join(' ')}
          </p>
        ) : null}
      </div>

      {/* Body: two columns, audience left, commercial and risk right. */}
      <div className="mt-[7px] grid grid-cols-2 gap-[7px]">
        <div className="flex flex-col gap-[7px]">
          <Box
            title="Audience"
            meta={report.demographics ? 'share of audience' : 'not connected'}
          >
            {report.demographics ? (
              <>
                <div className="grid grid-cols-2 gap-x-3">
                  <div>
                    <p className="rail mb-1">Age</p>
                    {report.demographics.ageBands.map((b) => (
                      <Line key={b.label} label={b.label} value={percent(b.share, 0)} />
                    ))}
                  </div>
                  <div>
                    <p className="rail mb-1">Gender</p>
                    {report.demographics.genderSplit.map((b) => (
                      <Line key={b.label} label={b.label} value={percent(b.share, 0)} />
                    ))}
                  </div>
                </div>
                <p className="rail mb-1 mt-2">Top geographies</p>
                {report.demographics.topCountries.slice(0, 5).map((b) => (
                  <Line key={b.label} label={b.label} value={percent(b.share, 0)} />
                ))}
              </>
            ) : (
              <p className="text-ink-muted">
                Needs the creator&apos;s analytics authorisation. Nothing public substitutes.
              </p>
            )}
          </Box>

          {axes ? (
            <Box title="Comment corpus, both axes" meta={`${exactNumber(axes.total)} comments`}>
              {(['object', 'intent'] as const).map((axis) => {
                const ranked = [...axes[axis]]
                  .filter((s) => s.count > 0)
                  .sort((a, b) => b.count - a.count);
                const pct = largestRemainder(ranked.map((s) => s.count));
                return (
                  <Line
                    key={axis}
                    label={axis === 'object' ? 'About' : 'Wants'}
                    value={ranked
                      .map((s, i) => `${PRINT_AXIS[axis][s.key] ?? s.key} ${pct[i]}%`)
                      .join(' · ')}
                  />
                );
              })}
            </Box>
          ) : null}

          <Box
            title="Comment perspectives"
            meta={
              axes
                ? `share ${axisLabel(clusterAxis)} · count · about / wants`
                : `share ${axisLabel(clusterAxis)} · count · ${SENTIMENT_SCALE}`
            }
          >
            {clusters.map((cluster, index) => (
              <div key={cluster.id} className="mb-[5px] last:mb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{cluster.label}</span>
                  <span className="tnum shrink-0 text-ink-faint">
                    {clusterShares[index]}% ·{' '}
                    {exactNumber(
                      cluster.commentCount ||
                        Math.round(cluster.share * (report.commentsAnalyzed ?? 0)),
                    )}{' '}
                    {/* Under a two-axis pass the object and intent labels carry
                        the meaning and `sentiment` is null by design; older rows
                        still print their score. */}
                    {cluster.object || cluster.intent ? (
                      <>
                        {' · '}
                        {cluster.object ? `${PRINT_OBJECT[cluster.object]} / ` : ''}
                        {cluster.intent ? PRINT_INTENT[cluster.intent] : 'mixed'}
                      </>
                    ) : null}
                    {cluster.sentiment !== null && cluster.id !== RESIDUAL_ID
                      ? ` · ${signedSentiment(cluster.sentiment)}`
                      : ''}
                  </span>
                </div>
                <div className="mt-[2px]">
                  <Bar
                    share={cluster.share}
                    max={clusterAxis}
                    tone={
                      cluster.object === 'product' || cluster.intent === 'buy'
                        ? 'bg-emerald'
                        : 'bg-line-strong'
                    }
                  />
                </div>
                {(() => {
                  const sample = cluster.comments[0];
                  return (
                    <>
                      <p className="mt-[2px] text-[6pt] italic leading-snug text-ink-faint">
                        “{sample ? sample.text : cluster.exampleComment}”
                      </p>
                      {sample ? (
                        <p className="tnum text-[5.4pt] leading-snug text-ink-faint">
                          {sample.postTitle ?? sample.platform}
                          {sample.publishedAt ? ` · ${shortDate(sample.publishedAt)}` : ''}
                          {sample.likes !== null ? ` · ${exactNumber(sample.likes)} likes` : ''}
                        </p>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            ))}
          </Box>

          {output.length > 0 ? (
            <Box title="Output & engagement" meta={`last ${output[0].windowDays}d`}>
              <div className={output.length > 1 ? 'grid grid-cols-2 gap-x-3' : undefined}>
                {output.map((o) => {
                  const commercial = report.platformBreakdown.find(
                    (p) => p.platform === o.platform,
                  );
                  return (
                    <div key={o.platform}>
                      <p className="font-medium">
                        {PLATFORM_LABEL[o.platform]}{' '}
                        <span className="tnum font-normal text-ink-faint">
                          {o.cadencePerWeek.toFixed(1)}/wk
                        </span>
                      </p>
                      <Line
                        label={`Total ${o.unit}`}
                        value={`${exactNumber(o.totalPosts)} · ${o.postsInWindow} in window`}
                      />
                      <Line
                        label="Views avg / med / peak"
                        value={`${compactNumber(o.avgViews)} · ${compactNumber(o.medianViews)} · ${compactNumber(o.peakViews)}`}
                      />
                      <Line
                        label="Likes avg / peak"
                        value={
                          o.avgLikes === null || o.peakLikes === null
                            ? '—'
                            : `${compactNumber(o.avgLikes)} · ${compactNumber(o.peakLikes)}`
                        }
                      />
                      <Line
                        label="Avg comments"
                        value={o.avgComments === null ? '—' : exactNumber(Math.round(o.avgComments))}
                      />
                      <Line
                        label="Engagement"
                        value={o.engagementRate === null ? '—' : percent(o.engagementRate, 2)}
                      />
                      {commercial ? (
                        <>
                          <Line
                            label="Purchase intent"
                            value={
                              commercial.purchaseIntentRate === null
                                ? '—'
                                : percent(commercial.purchaseIntentRate)
                            }
                          />
                          <Line
                            label="Est. CPM"
                            value={
                              commercial.estimatedCpm
                                ? currency(Math.round(commercial.estimatedCpm))
                                : '—'
                            }
                          />
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Box>
          ) : null}
        </div>

        <div className="flex flex-col gap-[7px]">
          <Box title="Commercial" meta={cost ? `at ${currency(cost.basisBudget)}` : 'no basis'}>
            {cost ? (
              <>
                <Line
                  label="Cost / 1k engaged"
                  value={currency(Math.round(cost.costPerThousandEngaged), cost.currency)}
                />
                <Line
                  label="Engagement rate"
                  value={report.engagementRate === null ? '—' : percent(report.engagementRate, 2)}
                />
              </>
            ) : (
              <p className="text-ink-muted">No published minimum to price from.</p>
            )}
            {perf ? (
              <>
                <p className="rail mb-1 mt-2">Organic → sponsored</p>
                <Line
                  label="Median views"
                  value={`${compactNumber(perf.organicMedianViews)} → ${compactNumber(perf.sponsoredMedianViews)}`}
                />
                <Line
                  label="Comment sentiment /100"
                  // The printed sheet gets emailed around a buying team and
                  // cannot be clicked into, so an unmeasured pair has to say so
                  // in words. "0 → 0" on a 0-100 scale is the worst possible
                  // misreading of a field nobody measured.
                  value={
                    perf.organicSentiment === null || perf.sponsoredSentiment === null
                      ? 'not measured'
                      : `${score(perf.organicSentiment)} → ${score(perf.sponsoredSentiment)}`
                  }
                />
                <Line label="Ad fatigue" value={report.adFatigueLevel ?? 'no basis'} />
              </>
            ) : (
              <>
                <p className="mt-1.5 text-ink">Never sponsored.</p>
                <p className="text-[6pt] leading-snug text-ink-muted">
                  No ad fatigue, competitor conflict or exclusivity to clear — and no evidence of
                  how the audience reacts to a paid placement.
                  {cost?.cohortMedianRetention
                    ? ` CPM above is organic-only; budget nearer ${currency(
                        Math.round(cost.estimatedCpm / cost.cohortMedianRetention),
                        cost.currency,
                      )} at the category's ${percent(cost.cohortMedianRetention, 0)} retention.`
                    : ' CPM above is organic-only and therefore optimistic.'}
                </p>
              </>
            )}
          </Box>

          {/* Omitted entirely while the panel is switched off, rather than
              printed with its "not run" empty state. The pass DID run; a
              print-out saying otherwise is a false claim about our own
              coverage, and it is the artefact most likely to be forwarded
              without anyone able to ask. */}
          {/* Volume and themes, never a sentiment score — see the note on
              `PublicOpinion` in src/types. A print-out is the artefact most
              likely to be forwarded without its context, so the caveat is
              printed rather than assumed. */}
          {OFF_PLATFORM_PANEL ? (
            <Box
              title="Off-platform discussion"
              meta={
                opinion
                  ? `third-party · ${exactNumber(opinion.itemsAnalyzed)} pieces · ${opinion.windowDays}d`
                  : 'not run'
              }
            >
              {opinion ? (
                <>
                  <Line
                    label="Substantive discussion"
                    value={`${percent(opinion.discussionShare, 0)} of comments read`}
                  />
                  {opinion.themes.slice(0, 4).map((theme) => {
                    const mention = theme.mentions[0];
                    return (
                      <div key={theme.label}>
                        {/* Counts, not shares — a proportion over a searched
                            corpus claims a denominator that does not exist.
                            The web panel stopped drawing it; this would have
                            brought it back the moment the flag flipped. */}
                        <Line
                          label={theme.label}
                          value={
                            theme.itemCount !== null
                              ? `${theme.itemCount} of ${opinion.itemsAnalyzed}`
                              : theme.reactionCount >= 0
                                ? `${exactNumber(theme.reactionCount)} comments`
                                : '—'
                          }
                        />
                        {mention ? (
                          <p className="tnum text-[5.4pt] leading-snug text-ink-faint">
                            {mention.source} · {shortDate(mention.publishedAt)}
                            {mention.url ? ` · ${linkHost(mention.url) ?? ''}` : ''}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                  <p className="mt-[3px] text-[5.4pt] leading-snug text-ink-faint">
                    Volume and themes only. An off-platform set is gathered by search, which
                    selects for whoever had a reason to post, so no sentiment score is given.
                  </p>
                </>
              ) : (
                <p className="text-ink-muted">Off-platform pass has not run.</p>
              )}
            </Box>
          ) : null}

          <Box title="Brand safety" meta="% of comments affected">
            {flags.map((flag) => (
              <div key={flag.category} className="mb-[3px] last:mb-0">
                <Line
                  label={flag.category}
                  value={`${flag.incidence === 0 ? 'none' : percent(flag.incidence, 1)} · ${flag.severity}`}
                  tone={
                    flag.severity === 'high' || flag.severity === 'medium'
                      ? 'text-amber'
                      : undefined
                  }
                />
                <p className="text-[6pt] leading-snug text-ink-faint">{flag.note}</p>
              </div>
            ))}
          </Box>

        </div>
      </div>

      <footer className="tnum mt-2 border-t-[0.4pt] border-line pt-1.5 text-[5.8pt] leading-snug text-ink-faint">
        1st-party OAuth analytics · qualitative scores model-generated from public comments · public
        cost figures estimated, not quoted
        {report.modelVersion ? ` · ${report.modelVersion}` : ''} · Confidential — issued to{' '}
        {issuedTo}, not for redistribution.
      </footer>
    </>
  );
}
