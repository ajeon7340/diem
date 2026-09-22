import type { ReactNode } from 'react';
import { BarChart3, FileVideo2, Layers, MessagesSquare, ShieldQuestion, Sparkles, Tags } from 'lucide-react';

import type { EvidencePurpose, RepresentativeVideo } from '@/lib/channel/highlights';

import { DERIVED_DISCLOSURE } from '@/lib/report/policy';
import type { ChannelReportView } from '@/lib/channel/report';
import { comparable, performance } from '@/lib/channel/report';
import { composition } from '@/lib/channel/composition';
import {
  channelDescription,
  compact,
  disclosedCount,
  exact,
  factualSummary,
  limitations,
  observations,
  openQuestions,
  representativeVideos,
  sponsoredColumns,
  reportDepth,
  shortDate,
  videoUrl,
} from '@/lib/channel/highlights';
import { matchedTerms } from '@/lib/discovery/candidates';
import { CompositionBars } from '@/components/report/CompositionBars';
import { SubjectBubbles } from '@/components/report/SubjectBubbles';
import { PagedUploads } from '@/components/report/PagedUploads';
import { FormatPerformance } from '@/components/report/FormatPerformance';
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
  identity = true,
  narrowed = null,
}: {
  report: ChannelReportView;
  sample?: boolean;
  format?: string;
  /** Present only on a campaign report. Never inferred. */
  campaign?: CampaignContext | null;
  /** Print toggles this off; the web report keeps it expandable. */
  appendix?: boolean;
  /**
   * Whether the report prints its own identity block.
   *
   * False on `/channels/[id]`, where the rail already names the channel two
   * inches to the left — the same avatar, name and handle twice on one screen.
   * It stays in the PRINT output either way: a PDF has no rail, and a report
   * that does not say whose it is would be useless on paper.
   */
  identity?: boolean;
  /**
   * The size of the full collection when a date filter is narrowing it.
   *
   * Null when the report describes everything collected. Printed, so a
   * filtered median is never read as the channel's median.
   */
  narrowed?: number | null;
}) {
  const now = Date.parse(report.fetchedAt);
  const depth = reportDepth(report);
  const selected = report.videos.filter((v) => format === 'all' || v.format === format);
  const eligible = comparable(report.videos);
  const profile = composition(eligible);
  const overall = performance(report.videos, now);
  const summary = factualSummary(report);
  const description = channelDescription(report);
  // The one line of `factualSummary` with nowhere else to live: a sample too
  // small to describe a pattern has to say so where the figures are read.
  const thin = summary.find((line) => line.includes('too few to describe a pattern')) ?? null;
  const noticed = observations(report);
  const questions = openQuestions(report);
  const limits = limitations(report);
  const evidence = representativeVideos(report);
  const columns = sponsoredColumns(report);
  const disclosedTotal = disclosedCount(report);

  return (
    <article className="channel-report space-y-5">
      {sample ? (
        <p className="avoid-break rounded-lg border border-amber/40 bg-amber-wash px-4 py-3 text-[13px] font-medium text-ink">
          Sample report · fictional channel and illustrative data. Not an assessment of a real creator.
        </p>
      ) : null}

      <header
        className={`report-identity avoid-break flex-wrap items-center gap-4 border-b border-line pb-4 ${
          identity ? 'flex' : 'hidden print:flex'
        }`}
      >
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
      {/* Page 1 — what they publish, and how this sample performed          */}
      {/* ---------------------------------------------------------------- */}
      {/* THE BREAK IS CONDITIONAL. Forcing one after a thin sample produces the
          half-empty sheet the reference export was full of; a report with
          twelve uploads or more has enough to fill page one. */}
      <div
        className={`report-page-1 space-y-4 ${report.videos.length >= 12 ? 'report-page-break' : ''}`}
      >
        {campaign ? <CampaignBlock campaign={campaign} report={report} /> : null}

        {depth === 'empty' ? (
          <Block title="What this collection found">
            {summary.map((line) => (
              <p key={line} className="text-[13px] leading-relaxed text-ink">{line}</p>
            ))}
          </Block>
        ) : (
          <>
            {/* THE FIGURES A BUYER SCANS FOR, ONCE, IN A ROW. They were spread
                across four paragraphs of prose, which is where a number goes
                to be skipped. */}
            <section className="report-section report-metrics avoid-break rounded-[var(--r-lg)] bg-surface p-4 shadow-[var(--shadow-panel)]">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Metric
                  label="Subscribers"
                  value={report.subscribers === null ? 'Hidden' : compact(report.subscribers)}
                  exactValue={exact(report.subscribers)}
                  note={report.subscribers === null ? 'not reported by the channel' : 'as reported by YouTube'}
                />
                <Metric
                  label="Uploads sampled"
                  value={String(report.videos.length)}
                  note={
                    report.sampledStart && report.sampledEnd
                      ? `${shortDate(report.sampledStart)} – ${shortDate(report.sampledEnd)}`
                      : 'no publication dates recorded'
                  }
                />
                <Metric
                  label="Median views"
                  value={overall.median === null ? 'Not reported' : compact(overall.median)}
                  exactValue={exact(overall.median)}
                  note={`over the ${overall.n} of ${overall.sampled} comparable uploads reporting one`}
                />
                <Metric
                  label="Paid-promotion flag"
                  value={`${disclosedTotal} of ${report.videos.length}`}
                  note={disclosedTotal ? 'sponsor not named by the flag' : 'none in this sample'}
                />
              </dl>
              {/* WHAT THIS CHANNEL IS, where five lines of provenance used to
                  be. Every one of those facts is on the figures above or in
                  the limitations below; they now sit in the appendix, and the
                  question a reader actually arrives with is answered first. */}
              {narrowed !== null ? (
                <p className="mt-3 border-t border-line pt-2.5 text-[11px] font-medium leading-relaxed text-indigo">
                  Filtered to a date range: {report.videos.length} of {narrowed} collected uploads.
                  Every figure is over this slice.
                </p>
              ) : null}
              {description ? (
                <div className={narrowed !== null ? 'mt-2' : 'mt-3 border-t border-line pt-2.5'}>
                  <p className="text-[13px] leading-relaxed text-ink">{description.text}</p>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    {description.source === 'model'
                      ? 'Written by a model from the retrieved titles and descriptions. Nothing was watched.'
                      : 'From the title classification below. Nothing was watched.'}
                  </p>
                </div>
              ) : null}
              {thin ? (
                <p className="mt-2 text-[11px] leading-relaxed text-amber">
                  {thin}
                </p>
              ) : null}
            </section>

            {/* WHAT THEY PUBLISH, BESIDE HOW IT PERFORMED. Two questions a
                buyer asks together, stacked one under the other so answering
                the second meant scrolling past the first. */}
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {/* SUBJECTS SIT UNDER THE COMPOSITION THEY COME FROM. Both are
                  readings of the same classification; splitting them across
                  the page made them look like separate findings. */}
              <div className="space-y-4">
              <Block
                title="What this creator publishes"
                icon={<Layers size={16} strokeWidth={1.75} />}
                note="From retrieved titles and descriptions. Nothing was watched."
              >
                <CompositionBars composition={profile} videos={eligible} sampled={report.videos.length} />
              </Block>

              <Block
                title="Recurring subjects"
                icon={<Tags size={16} strokeWidth={1.75} />}
                note="Words in three or more sampled titles."
              >
                <SubjectBubbles subjects={profile.subjects} sampled={profile.sampled} />
              </Block>
              </div>

              <Block
                title="How this sample performed"
                icon={<BarChart3 size={16} strokeWidth={1.75} />}
                note="One sample, measured once. Not a forecast, not a history."
              >
                <FormatPerformance videos={eligible} collectedAt={report.fetchedAt} only={format} />
                <div className="mt-4 border-t border-line pt-3">
                  <PerformanceScatter videos={report.videos} collectedAt={report.fetchedAt} />
                </div>
              </Block>
            </div>


            {/* WHAT WE NOTICED, BESIDE HOW VIEWERS RESPONDED. Two readings of
                the sample that are not counts of uploads. */}
            <div className="grid items-start gap-4 xl:grid-cols-2">
        {noticed.length ? (
          <Block title="What stood out" icon={<Sparkles size={16} strokeWidth={1.75} />}>
            <ul className="space-y-2">
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
                            className="source-link text-[12px] text-indigo underline-offset-4 hover:underline"
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

              <Block title="Comment response" icon={<MessagesSquare size={16} strokeWidth={1.75} />}>
                <CommentScope report={report} />
              </Block>
            </div>
          </>
        )}
        {report.videos.length >= 12 ? <PageFoot report={report} page={1} campaign={campaign} /> : null}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Page 2 — the evidence, and what it does not establish              */}
      {/* ---------------------------------------------------------------- */}
      <div className="report-page-2 space-y-4">
        {/* THE SPONSORED WORK, SPLIT BY DELIVERABLE. Long-form and short are
            priced and negotiated differently, so they are two columns rather
            than one ranked list, and each pages rather than printing twelve
            cards down a page nobody scrolls. */}
        {columns.long.length || columns.short.length ? (
          <Block
            title="Representative uploads"
            icon={<FileVideo2 size={16} strokeWidth={1.75} />}
            note={
              columns.sponsored
                ? `${disclosedTotal} of ${report.videos.length} sampled upload${disclosedTotal === 1 ? ' carries' : 's carry'} YouTube’s paid-promotion flag. The flag does not name the advertiser.`
                : 'No sampled upload carries the paid-promotion flag, so these are the most-viewed of each length — not a record of the channel never having run one.'
            }
          >
            <div className="grid items-start gap-5 sm:grid-cols-2">
              {([
                ['long', columns.sponsored ? 'Sponsored, long-form' : 'Long-form', columns.long, 'long-form'],
                ['short', columns.sponsored ? 'Sponsored, ≤3 min' : 'Short, ≤3 min', columns.short, 'short'],
              ] as const).map(([key, heading, group, noun]) => (
                <div key={key}>
                  <h3 className="mb-2 text-[12px] font-semibold text-ink">
                    {heading}
                    <span className="tnum ml-1.5 font-normal text-ink-faint">{group.length}</span>
                  </h3>
                  <PagedUploads
                    items={group.map((video, index) => ({
                      video,
                      reason:
                        index === 0
                          ? `Most viewed of ${group.length} ${columns.sponsored ? 'flagged ' : ''}${noun} upload${group.length === 1 ? '' : 's'} in this sample`
                          : `#${index + 1} by views of ${group.length} ${columns.sponsored ? 'flagged ' : ''}${noun} uploads`,
                    }))}
                    disclosed={columns.sponsored}
                    emptyNote={
                      columns.sponsored
                        ? `No ${noun} upload in this sample carries the flag.`
                        : `No ${noun} upload in this sample.`
                    }
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-faint">
              Three minutes or less is a duration <strong className="font-medium">proxy</strong>;
              uploads reporting no duration are in neither column. A title is not evidence a product
              was used or endorsed.
            </p>
          </Block>
        ) : null}

        {/* LIMITATIONS AND QUESTIONS, SIDE BY SIDE AND NOT THE SAME LIST. The
            left column is what this report cannot tell you because of how we
            collected; the right is what only the creator can answer. Mixing
            them is how "our collection was capped" became a question asking the
            creator to make up the difference. */}
        <Block title="What this does not establish" icon={<ShieldQuestion size={16} strokeWidth={1.75} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-[12px] font-semibold text-ink">Our limits</h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12px] leading-relaxed text-ink-muted">
                {limits.map((line) => (
                  <li key={line} className="avoid-break">{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[12px] font-semibold text-ink">Ask the creator</h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12px] leading-relaxed text-ink">
                {questions.map((question) => (
                  <li key={question} className="avoid-break">{question}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                Also settle: product experience, exclusivity, fee, deliverables, usage rights.
              </p>
            </div>
          </div>
        </Block>
        <PageFoot report={report} page={report.videos.length >= 12 ? 2 : 1} campaign={campaign} />
      </div>

      {appendix ? (
        <Appendix report={report} selected={selected} now={now} summary={summary} evidence={evidence} />
      ) : null}

      {report.derivedAllowed ? (
        <p className="text-[11px] leading-relaxed text-ink-faint">{DERIVED_DISCLOSURE}</p>
      ) : null}
    </article>
  );
}

/**
 * A section. One heading, one optional qualification, no repeated provenance.
 *
 * THE MARK IS PART OF THE HEADING. A page of white rectangles gives the eye
 * nothing to land on; one dark chip per card is where a reader picks the page
 * back up after looking away. Near-black rather than the accent, because the
 * accent means "you can act on this" and a heading cannot be acted on. Hidden
 * in print, where the sheet is already one column and the ink is not free.
 */
function Block({
  title,
  note,
  icon,
  children,
}: {
  title: string;
  note?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="report-section avoid-break min-w-0 rounded-[var(--r-lg)] bg-surface p-4 shadow-[var(--shadow-panel)]">
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="icon-chip print:hidden" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {note ? <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{note}</p> : null}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * The running identity on a printed sheet.
 *
 * Chrome does not implement `@page` margin boxes, so there is no CSS page
 * counter to call. The report forces its own breaks, so each page block prints
 * its own footer: whose report this is, when it was collected, and which sheet
 * of how many. Hidden on screen, where the page already says all three.
 */
function PageFoot({
  report,
  page,
  campaign,
}: {
  report: ChannelReportView;
  page: number;
  campaign: CampaignContext | null;
}) {
  // The break is conditional, so the TOTAL is too: a short report that fits one
  // sheet must not print "page 1 of 2" on the only sheet there is.
  const sheets = report.videos.length >= 12 ? 2 : 1;
  return (
    <p className="report-page-foot hidden tnum">
      {campaign ? 'Campaign report' : 'Channel report'} · {report.title}
      {report.handle ? ` (${report.handle})` : ''} · collected {shortDate(report.fetchedAt)} ·
      page {page} of {sheets}
      {campaign ? ' · contains campaign context — internal' : ''}
    </p>
  );
}

/** One figure, its label, and what it is a figure OVER. Never a bare number. */
function Metric({
  label,
  value,
  note,
  exactValue,
}: {
  label: string;
  value: string;
  note: string;
  exactValue?: string;
}) {
  return (
    <div className="avoid-break">
      <dt className="text-[10px] uppercase tracking-[0.09em] text-ink-faint">{label}</dt>
      <dd className="tnum mt-0.5 text-[17px] font-medium leading-none text-ink" title={exactValue}>
        {value}
      </dd>
      <p className="mt-1 text-[10px] leading-snug text-ink-faint">{note}</p>
    </div>
  );
}

/** Short tags for why an upload was chosen. The full reason sits on the card. */
const PURPOSE_LABEL: Record<EvidencePurpose, string> = {
  sponsored: 'Disclosed',
  subject: 'Subject',
  format: 'Format',
  typical: 'Mid-range',
  outlier: 'Outlier',
  recent: 'Most recent',
};

/**
 * Comment themes, in one line when there are none to show.
 *
 * IT USED TO BE A WHOLE SECTION SAYING NOTHING. A heading, a border, a box and
 * a sentence reading "Comment themes aren't available here" — an empty section
 * the size of a real one, which on the printed report took a quarter of a page
 * to report an absence. Four states still exist and are still distinguished;
 * three of them are now a sentence, and only the state with actual themes in it
 * gets the room a finding deserves.
 */
function CommentScope({ report }: { report: ChannelReportView }) {
  if (!report.derivedAllowed) {
    return (
      <p className="text-[12px] leading-relaxed text-ink-muted">
        Comment themes are not available on this deployment. Nothing above depends on them.
      </p>
    );
  }
  if (!report.analysedAt) {
    return (
      <p className="text-[12px] leading-relaxed text-ink-muted">
        The pass has not finished. No conclusion about the response is available yet — not the same
        as having found nothing.
      </p>
    );
  }
  if (report.clusters.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-ink-muted">
        Ran over {exact(report.comments)} comments, no supported theme. Missing or disabled comments
        do not indicate a negative response.
      </p>
    );
  }
  return (
    <div>
      <p className="tnum text-[11px] text-ink-faint">
        {exact(report.comments)} classified · analysed {shortDate(report.analysedAt)}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
        Commenters are self-selected and do not represent the audience. Questions are not purchases.
        {report.unreadable > 0
          ? ` Unreadable on ${report.unreadable} upload${report.unreadable === 1 ? '' : 's'}, which limits the evidence and says nothing negative about the audience.`
          : ''}
      </p>
      <ul className="mt-2 space-y-2">
        {report.clusters.slice(0, 3).map((cluster) => (
          <li key={cluster.id} className="avoid-break">
            <p className="text-[12px] font-medium text-ink">
              {cluster.label}
              <span className="tnum ml-1.5 font-normal text-ink-muted">
                {cluster.commentCount ?? 'count not recorded'} of {exact(report.comments)}
              </span>
            </p>
            {cluster.comments.slice(0, 1).map((comment, i) => {
              const url = safeExternalUrl(comment.url);
              return (
                <blockquote
                  key={i}
                  className="mt-1 border-l-2 border-line pl-2.5 text-[11px] leading-relaxed text-ink-muted"
                >
                  {comment.text ?? 'Quote past its 30-day retention deadline. The source remains linked.'}
                  {url ? (
                    <a
                      href={url}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="source-link ml-1.5 text-indigo underline-offset-4 hover:underline"
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
    </div>
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
  summary,
  evidence,
}: {
  report: ChannelReportView;
  selected: ChannelReportView['videos'];
  now: number;
  /** The provenance lines the top of the report used to open with. */
  summary: string[];
  /** One upload per selection rule, kept where somebody checking the work looks. */
  evidence: RepresentativeVideo[];
}) {
  const p = performance(report.videos, now);
  const overall = p;
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

        {report.promotions.some((p) => p.disclosure === 'explicit') ? (
          <div>
            <h3 className="text-[12px] font-semibold text-ink">
              Every disclosed paid promotion in the sample (
              {report.promotions.filter((p) => p.disclosure === 'explicit').length})
            </h3>
            <ul className="mt-1.5 space-y-1">
              {report.promotions
                .filter((p) => p.disclosure === 'explicit')
                .map((promotion) => (
                  <li key={promotion.postId} className="avoid-break text-[12px] leading-relaxed">
                    <a
                      href={videoUrl(promotion.postId)}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="source-link text-indigo underline-offset-4 hover:underline"
                    >
                      {promotion.title}
                    </a>
                    <span className="tnum ml-1.5 text-ink-muted">
                      {shortDate(promotion.publishedAt)} · sponsor not identified by the flag
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {/* THE COMPLEMENTARY PICKS. The page above shows the sponsored work,
            which is what an advertiser came for; these are one upload per
            selection rule — the commonest subject, the commonest shape, the
            middle of the distribution, a genuine outlier — kept where somebody
            checking how the report was built will look for them. */}
        {evidence.length ? (
          <div>
            <h3 className="text-[12px] font-semibold text-ink">
              One upload per selection rule ({evidence.length})
            </h3>
            <ul className="mt-1.5 space-y-1.5">
              {evidence.map(({ video, purpose, reason }) => (
                <li key={video.id} className="avoid-break text-[12px] leading-relaxed">
                  <span className="rail mr-1.5">{PURPOSE_LABEL[purpose]}</span>
                  <a
                    href={videoUrl(video.id)}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="source-link text-indigo underline-offset-4 hover:underline"
                  >
                    {video.title}
                  </a>
                  <span className="ml-1.5 text-ink-muted">{reason}.</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h3 className="text-[12px] font-semibold text-ink">What this collection found</h3>
          <div className="mt-1.5 space-y-1">
            {summary.map((line) => (
              <p key={line} className="text-[11px] leading-relaxed text-ink-muted">
                {line}
              </p>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-[12px] font-semibold text-ink">Method and sources</h3>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
            Source:{' '}
            {report.channelId === 'sample'
              ? 'illustrative fixture, not collected from YouTube'
              : 'the official YouTube Data API'}
            . Collected {shortDate(report.fetchedAt)}.
          </p>
          {/* THE TWO WINDOWS, LABELLED APART. Printing the request in the
              position where a reader expects the sample is how "50 uploads
              published between 22 Jun and 20 Sept" appeared beside a chart
              whose own axis began on 4 Jul. */}
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.09em] text-ink-faint">Window requested</dt>
              <dd className="tnum text-[11px] text-ink">
                {report.windowDays} days
                {report.requestedStart && report.requestedEnd
                  ? `, ${shortDate(report.requestedStart)} to ${shortDate(report.requestedEnd)}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.09em] text-ink-faint">Publication dates sampled</dt>
              <dd className="tnum text-[11px] text-ink">
                {report.sampledStart && report.sampledEnd
                  ? `${shortDate(report.sampledStart)} to ${shortDate(report.sampledEnd)}`
                  : 'none recorded'}
                {report.truncated ? ' — stopped at the collection limit' : ''}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
            Sample: {report.videos.length} uploads
            {overall.sampled !== report.videos.length
              ? ` (${overall.sampled} comparable; live broadcasts and scheduled premieres excluded)`
              : ''}{' '}
            and {exact(report.comments)} comments. Figures are shown rounded and carry their exact
            value; medians name how many uploads reported a view count. Content categories are
            matched against retrieved titles and descriptions — adfit did not watch any upload or
            read any transcript. Nothing here estimates audience demographics, conversions, purchase
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
