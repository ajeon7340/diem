import type { ReactNode } from 'react';

import { DERIVED_DISCLOSURE } from '@/lib/report/policy';
import type { ChannelReportView } from '@/lib/channel/report';
import { performance } from '@/lib/channel/report';
import {
  compact,
  disclosedPromotions,
  exact,
  factualSummary,
  observations,
  openQuestions,
  representativeVideos,
  reportDepth,
  shortDate,
  thumbnailUrl,
  videoUrl,
} from '@/lib/channel/highlights';
import { matchedTerms } from '@/lib/discovery/candidates';
import { PerformanceScatter } from '@/components/report/PerformanceScatter';
import { safeExternalUrl } from '@/lib/format';

/**
 * The creator report: two readable pages and an appendix.
 *
 * WHAT IT USED TO BE. Six sections of equal weight, each closed by the same
 * paragraph of provenance — source, collection date, period, sample size — so
 * the same four facts were printed six times and the actual findings were
 * spread thin between them. The first section was headed "Executive summary"
 * and its body was `report.description`: the channel's own bio, which is
 * marketing copy the creator wrote, presented as our conclusion.
 *
 * NOW: page one answers what a buyer opens the report to ask — what is this
 * channel, how does it perform, what did we notice, what do I need to settle
 * before I contact them. Page two is the evidence those answers rest on. The
 * provenance is stated ONCE, in the appendix, where somebody checking it will
 * look.
 *
 * A CHANNEL REPORT IS NOT A CAMPAIGN REPORT. Without a brief this describes a
 * creator and stops; nothing in it says "good fit", because fit is a question
 * about a product that has not been named. Pass `campaign` and a relevance
 * block appears — still without a score, and with what was OBSERVED kept
 * visibly apart from what is INTERPRETED and what is UNKNOWN.
 */

export interface CampaignContext {
  name: string;
  brand: string | null;
  product: string | null;
  useCase: string | null;
  objective: string | null;
}

export function ChannelReport({
  report,
  sample = false,
  format = 'all',
  campaign = null,
  appendix = true,
}: {
  report: ChannelReportView;
  sample?: boolean;
  format?: string;
  /** Present only on a campaign report. Never inferred. */
  campaign?: CampaignContext | null;
  /** Print toggles this off; the web report keeps it expandable. */
  appendix?: boolean;
}) {
  const now = Date.parse(report.fetchedAt);
  const depth = reportDepth(report);
  const selected = report.videos.filter((v) => format === 'all' || v.format === format);
  const summary = factualSummary(report);
  const noticed = observations(report);
  const questions = openQuestions(report);
  const evidence = representativeVideos(report);
  const disclosed = disclosedPromotions(report);

  return (
    <article className="channel-report space-y-5">
      {sample ? (
        <p className="avoid-break rounded-lg border border-amber/40 bg-amber-wash px-4 py-3 text-[13px] font-medium text-ink">
          Sample report · fictional channel and illustrative data. Not an assessment of a real creator.
        </p>
      ) : null}

      <header className="report-identity avoid-break flex flex-wrap items-center gap-4 border-b border-line pb-4">
        {report.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={report.avatar} alt="" width={56} height={56} className="h-14 w-14 rounded-full" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="rail">{campaign ? 'Campaign report' : 'Channel report'}</p>
          <h1 className="mt-1 break-words text-[22px] font-semibold tracking-tight text-ink">{report.title}</h1>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {report.handle ? `${report.handle} · ` : ''}
            <a
              href={`https://www.youtube.com/channel/${encodeURIComponent(report.channelId)}`}
              className="text-indigo underline-offset-4 hover:underline"
              rel="noopener noreferrer"
              target="_blank"
            >
              youtube.com/channel/{report.channelId}
            </a>
          </p>
        </div>
        <dl className="tnum shrink-0 text-right">
          <dt className="text-[10px] uppercase tracking-[0.09em] text-ink-faint">Subscribers</dt>
          <dd className="text-[15px] text-ink" title={exact(report.subscribers)}>
            {report.subscribers === null ? 'Hidden or not reported' : compact(report.subscribers)}
          </dd>
        </dl>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Page 1 — what was found, and what to settle                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="report-page-1 space-y-5">
        {campaign ? <CampaignBlock campaign={campaign} report={report} /> : null}

        <Block title="What this collection found">
          {summary.map((line) => (
            <p key={line} className="mt-1.5 text-[13px] leading-relaxed text-ink">
              {line}
            </p>
          ))}
        </Block>

        {depth === 'empty' ? null : (
          <Block
            title="Recent performance"
            note="Observations of one sample, not forecasts."
          >
            {/* The chart first, the figures under it. The table alone hid the
                shape of the sample: a channel carried by one upload and one with
                an even spread produce the same median. */}
            <PerformanceScatter videos={report.videos} collectedAt={report.fetchedAt} />
            <div className="mt-4 border-t border-line pt-3">
              <PerformanceTable report={report} format={format} now={now} />
            </div>
          </Block>
        )}

        {noticed.length ? (
          <Block title="What stood out">
            <ul className="space-y-2.5">
              {noticed.map((item) => (
                <li key={item.text} className="avoid-break text-[13px] leading-relaxed text-ink">
                  {item.text}
                  {item.supporting.length ? (
                    <span className="ml-1.5">
                      {item.supporting.map((id, i) => {
                        const video = report.videos.find((v) => v.id === id);
                        return (
                          <a
                            key={id}
                            href={videoUrl(id)}
                            rel="noopener noreferrer"
                            target="_blank"
                            className="text-[12px] text-indigo underline-offset-4 hover:underline"
                          >
                            {i > 0 ? ' · ' : ''}
                            {video ? truncate(video.title, 40) : 'Supporting video'}
                          </a>
                        );
                      })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Block>
        ) : null}

        <Block title="Confirm before you contact them">
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-ink">
            {questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-2.5 text-[12px] leading-relaxed text-ink-muted">
            Also worth settling: product experience, format, existing exclusivity, and fee,
            deliverables, usage rights and approval terms.
          </p>
        </Block>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Page 2 — the evidence                                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="report-page-2 space-y-5">
        {evidence.length ? (
          <Block
            title="Representative uploads"
            note="Most viewed, most recent, nearest the median, and anything flagged as paid promotion. A title is not evidence a product was used or endorsed."
          >
            <ul className="grid gap-3 sm:grid-cols-2">
              {evidence.map(({ video, reason, titleRepeats }) => (
                <li key={video.id} className="evidence-card avoid-break rounded-lg border border-line bg-paper p-2.5">
                  <a href={videoUrl(video.id)} rel="noopener noreferrer" target="_blank" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbnailUrl(video.id)}
                      alt=""
                      width={320}
                      height={180}
                      loading="lazy"
                      // A tinted tile behind it, so a thumbnail YouTube does not
                      // serve for this id reads as an image that is missing
                      // rather than as a broken page. `object-contain` because
                      // the terms cover how the image is presented: it is never
                      // cropped or overlaid.
                      className="mb-2 aspect-video w-full rounded bg-line/40 object-contain"
                    />
                    <span className="block break-words text-[12px] font-medium leading-snug text-ink">
                      {video.title}
                    </span>
                  </a>
                  <p className="tnum mt-1 text-[11px] text-ink-muted">
                    {shortDate(video.publishedAt)} ·{' '}
                    <span title={exact(video.views)}>{compact(video.views)} views</span> ·{' '}
                    {video.format === 'short'
                      ? '≤3 min (proxy)'
                      : video.format === 'long'
                        ? 'Long-form'
                        : 'Duration not reported'}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{reason}.</p>
                  {titleRepeats ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-amber">
                      Another sampled upload shares this title. They are different videos, not a duplicate.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Block>
        ) : null}

        <Block
          title="Disclosed paid promotion"
          note="YouTube’s own flag. It does not name the advertiser."
        >
          {disclosed.length === 0 ? (
            <p className="text-[13px] text-ink-muted">
              None in this sample. That isn’t a record of the channel never running one.
            </p>
          ) : (
            <ul className="space-y-2">
              {disclosed.map((promotion) => (
                <li key={promotion.postId} className="avoid-break text-[13px]">
                  <a
                    href={videoUrl(promotion.postId)}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="text-indigo underline-offset-4 hover:underline"
                  >
                    {promotion.title}
                  </a>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {shortDate(promotion.publishedAt)} · flagged as containing paid promotion ·{' '}
                    <strong className="font-medium">sponsor not identified by the flag</strong>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <CommentBlock report={report} />
      </div>

      {appendix ? <Appendix report={report} selected={selected} now={now} /> : null}

      {report.derivedAllowed ? (
        <p className="text-[11px] leading-relaxed text-ink-faint">{DERIVED_DISCLOSURE}</p>
      ) : null}
    </article>
  );
}

/** A section. One heading, one optional qualification, no repeated provenance. */
function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="report-section avoid-break rounded-lg border border-line bg-surface p-4">
      <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
      {note ? <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{note}</p> : null}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function PerformanceTable({
  report,
  format,
  now,
}: {
  report: ChannelReportView;
  format: string;
  now: number;
}) {
  const groups = (['long', 'short'] as const).filter((f) => format === 'all' || format === f);
  const unknown = report.videos.filter((v) => v.format === 'unknown');

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <caption className="sr-only">Sampled upload performance by format and age</caption>
          <thead className="text-[10px] uppercase tracking-[0.08em] text-ink-faint">
            <tr>
              <th scope="col" className="py-1.5 font-medium">Format</th>
              <th scope="col" className="py-1.5 font-medium">Sampled</th>
              <th scope="col" className="py-1.5 font-medium">Median views</th>
              <th scope="col" className="py-1.5 font-medium">Range</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((f) => {
              const videos = report.videos.filter((v) => v.format === f);
              const p = performance(videos, now);
              return (
                <tr key={f} className="avoid-break border-t border-line">
                  <td className="py-1.5 text-ink">
                    {f === 'short' ? 'Short, ≤3 min (proxy)' : 'Long-form'}
                  </td>
                  <td className="tnum py-1.5 text-ink-muted">{videos.length}</td>
                  <td className="tnum py-1.5 text-ink" title={exact(p.median)}>
                    {p.median === null ? 'Not reported' : compact(p.median)}
                    {p.n !== videos.length ? (
                      <span className="text-ink-faint"> (of {p.n} reporting)</span>
                    ) : null}
                  </td>
                  <td className="tnum py-1.5 text-ink-muted">
                    {p.min === null ? '—' : `${compact(p.min)} – ${compact(p.max)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
        Public metadata does not identify Shorts. Uploads of three minutes or less are a duration
        <strong className="font-medium"> proxy</strong> and can include non-Shorts.
        {unknown.length
          ? ` ${unknown.length} upload${unknown.length === 1 ? '' : 's'} report no duration and are excluded from this comparison.`
          : ''}
      </p>
    </>
  );
}

/**
 * Comment observations, which exist only where the approval does.
 *
 * Four states and not one: restricted, not yet run, ran and found nothing, and
 * ran and found themes. The third is the one that gets collapsed into the
 * second, and they are opposite — a channel with comments disabled is not a
 * channel whose analysis is pending.
 */
function CommentBlock({ report }: { report: ChannelReportView }) {
  if (!report.derivedAllowed) {
    return (
      <Block title="Comment response">
        <p className="text-[13px] text-ink-muted">
          Comment themes aren’t available here. Nothing above depends on them.
        </p>
      </Block>
    );
  }
  if (!report.analysedAt) {
    return (
      <Block title="Comment response">
        <p className="text-[13px] text-ink-muted">
          The comment pass hasn’t finished. No conclusion about the response is available yet — which
          is not the same as having found nothing.
        </p>
      </Block>
    );
  }
  return (
    <Block
      title="Comment response"
      note="Commenters are a self-selected slice and do not represent the audience. Product questions do not establish purchases."
    >
      {report.clusters.length === 0 ? (
        <p className="text-[13px] text-ink-muted">
          The pass ran over {exact(report.comments)} comments and produced no supported theme. Missing
          or disabled comments do not indicate a negative response.
        </p>
      ) : (
        <>
          <p className="tnum mb-2 text-[11px] text-ink-muted">
            {exact(report.comments)} comments classified · analysed {shortDate(report.analysedAt)}
          </p>
          {report.unreadable > 0 ? (
            <p className="mb-2 text-[11px] leading-relaxed text-ink-muted">
              Comments could not be read on {report.unreadable} sampled upload
              {report.unreadable === 1 ? '' : 's'}. That limits the evidence and says nothing negative
              about the audience.
            </p>
          ) : null}
          <ul className="space-y-2.5">
            {report.clusters.slice(0, 4).map((cluster) => (
              <li key={cluster.id} className="avoid-break">
                <p className="text-[13px] font-medium text-ink">
                  {cluster.label}
                  <span className="tnum ml-1.5 font-normal text-ink-muted">
                    {cluster.commentCount ?? 'count not recorded'} of {exact(report.comments)}
                  </span>
                </p>
                {cluster.comments.slice(0, 1).map((comment, i) => {
                  const url = safeExternalUrl(comment.url);
                  return (
                    <blockquote key={i} className="mt-1 border-l-2 border-line pl-2.5 text-[12px] leading-relaxed text-ink-muted">
                      {comment.text ?? 'Quote past its 30-day retention deadline. The source remains linked.'}
                      {url ? (
                        <a
                          href={url}
                          rel="noopener noreferrer"
                          target="_blank"
                          className="ml-1.5 text-indigo underline-offset-4 hover:underline"
                        >
                          source
                        </a>
                      ) : null}
                    </blockquote>
                  );
                })}
              </li>
            ))}
          </ul>
        </>
      )}
    </Block>
  );
}

/**
 * The campaign half: the same evidence, read against a named product.
 *
 * THREE LABELS, KEPT APART. What was OBSERVED is a term from the brief
 * appearing in a title this collection retrieved — checkable, and nothing
 * more. What is INTERPRETED is said to be interpretation. What is UNKNOWN is
 * listed rather than left out, because the gaps are what a buyer has to close
 * before signing anything.
 *
 * NO FIT SCORE, WITH OR WITHOUT A BRIEF. A number here would be a judgement
 * this evidence cannot support, and it would be the first thing anybody read.
 */
function CampaignBlock({ campaign, report }: { campaign: CampaignContext; report: ChannelReportView }) {
  const terms = [campaign.product, campaign.useCase]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(/[^\p{L}\p{N}]+/u))
    .filter((word) => word.length >= 4)
    .slice(0, 12);

  const matches = report.videos
    .map((video) => ({ video, hit: matchedTerms(terms, video.title) }))
    .filter((row) => row.hit.length > 0)
    .slice(0, 3);

  return (
    <section className="report-section avoid-break rounded-lg border border-indigo/25 bg-indigo-wash/40 p-4">
      <p className="rail">Read against</p>
      <h2 className="mt-1 text-[14px] font-semibold text-ink">
        {campaign.name}
        {campaign.brand ? <span className="font-normal text-ink-muted"> · {campaign.brand}</span> : null}
      </h2>
      <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {[
          ['Product', campaign.product],
          ['Use case', campaign.useCase],
          ['Objective', campaign.objective],
        ]
          .filter(([, value]) => Boolean(value))
          .map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-[10px] uppercase tracking-[0.09em] text-ink-faint">{label}</dt>
              <dd className="text-[12px] leading-relaxed text-ink">{value}</dd>
            </div>
          ))}
      </dl>

      <div className="mt-3 border-t border-indigo/20 pt-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Observed</p>
        {terms.length === 0 ? (
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
            The brief names no product or use case, so there is nothing to match sampled titles against.
          </p>
        ) : matches.length === 0 ? (
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
            No sampled upload title contains a term from this brief. The collection is bounded, so this
            is not evidence that the creator never covers the subject.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {matches.map(({ video, hit }) => (
              <li key={video.id} className="text-[12px] leading-relaxed text-ink">
                <a
                  href={videoUrl(video.id)}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="text-indigo underline-offset-4 hover:underline"
                >
                  {truncate(video.title, 60)}
                </a>{' '}
                <span className="text-ink-muted">
                  names {hit.slice(0, 3).map((t) => `“${t}”`).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Unknown</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          A matching title shows the subject was covered. It does not show the creator has used this
          product, would endorse it, or that their viewers would buy it. No suitability score is
          produced from public data.
        </p>
      </div>
    </section>
  );
}

/**
 * Everything a reader only wants when they are checking the work.
 *
 * The provenance lives here, ONCE. It used to be repeated under all six
 * sections, which made the same four facts the most prominent thing in the
 * document.
 */
function Appendix({
  report,
  selected,
  now,
}: {
  report: ChannelReportView;
  selected: ChannelReportView['videos'];
  now: number;
}) {
  const p = performance(report.videos, now);
  return (
    <details className="report-appendix rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-ink">
        Appendix — full sample, tables and method
      </summary>
      <div className="space-y-4 border-t border-line p-4">
        <div>
          <h3 className="text-[12px] font-semibold text-ink">Views by upload age</h3>
          <table className="mt-1.5 w-full text-left text-[12px]">
            <thead className="text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              <tr>
                <th scope="col" className="py-1 font-medium">Age</th>
                <th scope="col" className="py-1 font-medium">Sampled</th>
                <th scope="col" className="py-1 font-medium">Median views</th>
              </tr>
            </thead>
            <tbody>
              {p.ageBands.map((band) => (
                <tr key={band.label} className="avoid-break border-t border-line">
                  <td className="py-1 text-ink">{band.label}</td>
                  <td className="tnum py-1 text-ink-muted">{band.n}</td>
                  <td className="tnum py-1 text-ink" title={exact(band.median)}>
                    {band.median === null ? 'Not reported' : compact(band.median)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-[12px] font-semibold text-ink">
            Every sampled upload ({selected.length})
          </h3>
          <ul className="mt-1.5 space-y-1">
            {selected.map((video) => (
              <li key={video.id} className="avoid-break text-[12px] leading-relaxed">
                <a
                  href={videoUrl(video.id)}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="text-indigo underline-offset-4 hover:underline"
                >
                  {video.title}
                </a>
                <span className="tnum ml-1.5 text-ink-muted" title={exact(video.views)}>
                  {shortDate(video.publishedAt)} · {compact(video.views)} views
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-[12px] font-semibold text-ink">Method and sources</h3>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
            Source:{' '}
            {report.channelId === 'sample'
              ? 'illustrative fixture, not collected from YouTube'
              : 'the official YouTube Data API'}
            . Collected {shortDate(report.fetchedAt)} over {report.windowDays} days
            {report.start && report.end ? `, ${shortDate(report.start)} to ${shortDate(report.end)}` : ''}.
            Sample: {report.videos.length} uploads and {exact(report.comments)} comments
            {report.truncated ? ', capped by the collection bound so older uploads in the period may be missing' : ''}
            . Figures are shown rounded and carry their exact value; medians name how many uploads
            reported a view count. Nothing here estimates audience demographics, conversions, purchase
            intent, sponsorship relationships or an overall fit score, and language or market
            preferences used in a search do not establish where an audience is.
          </p>
          <p className="tnum mt-2 text-[11px] leading-relaxed text-ink-faint">
            Generated {new Date().toISOString()}. Underlying data expires{' '}
            {shortDate(new Date(Date.parse(report.fetchedAt) + 30 * 86_400_000).toISOString())} —
            refresh or delete this report and any exported copy by then. Exports do not update or
            revoke automatically.
          </p>
        </div>
      </div>
    </details>
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
