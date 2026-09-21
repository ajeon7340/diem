'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { ExternalLink, Play, LockKeyhole, FileText } from 'lucide-react';
import { evaluateCandidate } from '@/app/actions/campaign';
import { INITIAL_CANDIDATE_STATE } from '@/app/actions/state';
import { Badge } from '@/components/ui/Badge';
import { CandidateDetails } from './CandidateDetails';
import { ReviewSelect } from './ReviewSelect';
import {
  candidateName,
  CONFIDENCE_LABELS,
  type CandidateView,
} from '@/lib/campaign/presentation';
import { shortDate, compactNumber } from '@/lib/format';

function AssessButton({ hasFit }: { hasFit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="mt-4 rounded-lg border border-line-strong px-3 py-2 text-xs font-medium text-indigo disabled:opacity-50"
    >
      {pending
        ? 'Assessing…'
        : hasFit
          ? 'Update assessment'
          : 'Assess for this campaign'}
    </button>
  );
}

export function CandidateReview({
  view,
  campaignId,
  canEvaluate,
}: {
  view: CandidateView;
  campaignId: string;
  canEvaluate: boolean;
}) {
  const [assessment, assess] = useFormState(
    evaluateCandidate,
    INITIAL_CANDIDATE_STATE,
  );
  const { candidate, report } = view;
  const fit = candidate.fit;
  const name = candidateName(view);
  const promotions = report?.promotions ?? candidate.analysis?.promotions ?? [];
  const disclosed = promotions.filter((p) => p.disclosure === 'explicit');
  return (
    <div className="space-y-7">
      <section aria-label="Review summary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Review summary</h3>
          {fit && (
            <Badge tone={fit.confidence === 'supported' ? 'emerald' : 'slate'}>
              {CONFIDENCE_LABELS[fit.confidence]}
            </Badge>
          )}
        </div>
        {view.notice && (
          <p
            role="status"
            className="mt-3 rounded-lg bg-paper px-3 py-2.5 text-sm text-ink-muted"
          >
            {view.notice}
          </p>
        )}
        {fit ? (
          <div className="mt-3 space-y-4 text-sm leading-relaxed">
            <p>{fit.verdict}</p>
            <div>
              <p className="mb-1 text-xs font-medium text-ink-muted">
                Why consider this creator
              </p>
              <p>{fit.relevance}</p>
            </div>
            {fit.confidenceReason && (
              <p className="text-xs text-ink-muted">{fit.confidenceReason}</p>
            )}
            {fit.beforeYouSign.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-ink-muted">
                  Confirm before deciding
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  {fit.beforeYouSign.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-xs font-medium">
                More assessment details
              </summary>
              <dl className="mt-3 space-y-3 text-xs">
                {[
                  ['Comment evidence', fit.audienceSignal],
                  ['Sponsorship', fit.sponsorshipRead],
                  ['Brand considerations', fit.brandRisk],
                  ['Content ideas', fit.suggestedAngles.join(' · ')],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className="font-medium">{label}</dt>
                      <dd className="mt-1 text-ink-muted">{value}</dd>
                    </div>
                  ))}
              </dl>
              <p className="mt-3 text-[11px] text-ink-muted">
                Assessed {shortDate(candidate.fitWrittenAt)}. Comments describe
                the collected sample, not all viewers or likely sales.
              </p>
            </details>
          </div>
        ) : (
          !view.notice && (
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              {canEvaluate
                ? 'Review the content below, or assess it against your campaign brief.'
                : 'Review the public content below to make your decision.'}
            </p>
          )
        )}
        {canEvaluate && candidate.analysis && (
          <form action={assess}>
            <input type="hidden" name="candidateId" value={candidate.id} />
            <input type="hidden" name="campaignId" value={campaignId} />
            <AssessButton hasFit={Boolean(fit)} />
            {assessment.message && (
              <p role="status" className="mt-2 text-xs text-ink-muted">
                {assessment.message}
              </p>
            )}
          </form>
        )}
      </section>

      <section
        className="border-t border-line pt-6"
        aria-label="Content evidence"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Content evidence</h3>
          <Link
            href={`/channels/${candidate.channelId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo"
          >
            Full report <ExternalLink size={13} aria-hidden />
          </Link>
        </div>
        {report ? (
          <>
            <p className="mt-2 text-xs text-ink-muted">
              {report.videos.length} sampled videos · Collected{' '}
              {shortDate(report.fetchedAt)}
            </p>
            <ul className="mt-4 space-y-2">
              {report.videos.slice(0, 4).map((video) => (
                <li key={video.id}>
                  <a
                    href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex gap-3 rounded-lg border border-line p-3 hover:bg-paper"
                  >
                    <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md bg-paper text-ink-faint">
                      <Play size={17} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-medium group-hover:text-indigo">
                        {video.title}
                      </span>
                      <span className="mt-1 block text-[11px] text-ink-muted">
                        {shortDate(video.publishedAt)}
                        {video.views !== null &&
                          ` · ${compactNumber(video.views)} views`}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            {!report.videos.length && (
              <p className="mt-3 text-sm text-ink-muted">
                No videos in the collected sample.
              </p>
            )}
            <div className="mt-5 rounded-lg bg-paper p-3">
              <h4 className="text-xs font-medium">
                Paid-promotion disclosures
              </h4>
              {disclosed.length ? (
                <ul className="mt-2 space-y-2">
                  {disclosed.slice(0, 3).map((item) => (
                    <li key={item.postId}>
                      <a
                        href={`https://www.youtube.com/watch?v=${encodeURIComponent(item.postId)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo hover:underline"
                      >
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-ink-muted">
                  None found in this sample.
                </p>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                Disclosures don’t name the brand, and this isn’t a full history.
              </p>
            </div>
            <details className="mt-4 text-xs">
              <summary className="cursor-pointer font-medium text-ink-muted">
                Report details & limitations
              </summary>
              <div className="mt-3 space-y-2 leading-relaxed text-ink-muted">
                <p>
                  {report.subscribers === null
                    ? 'Subscriber count unavailable'
                    : `${report.subscribers.toLocaleString('en-US')} subscribers`}{' '}
                  · {report.comments.toLocaleString('en-US')} comments
                  collected.
                </p>
                <p>
                  Uploads sampled: {shortDate(report.sampledStart)}–
                  {shortDate(report.sampledEnd)} (asked for {report.windowDays} days).
                  {report.truncated &&
                    ' Collection reached its limit; older uploads may be missing.'}{' '}
                  Comments were unavailable on {report.unreadable} videos.
                </p>
                <p>
                  Public data can’t show audience demographics or sales.
                  Assessments are adfit’s reading of the evidence.
                </p>
                <p>
                  Refresh or delete exported evidence by{' '}
                  {shortDate(
                    new Date(
                      Date.parse(report.fetchedAt) + 30 * 86400000,
                    ).toISOString(),
                  )}
                  .
                </p>
                {!canEvaluate && (
                  <p>
                    Automated assessment is off here. You can still review the
                    evidence and decide.
                  </p>
                )}
              </div>
            </details>
          </>
        ) : (
          <div className="mt-4 flex gap-3 rounded-lg border border-dashed border-line p-4 text-sm text-ink-muted">
            <FileText size={18} className="shrink-0" aria-hidden />
            <p>
              Current evidence will appear when collection completes.{' '}
              <Link
                href={`/channels/${candidate.channelId}`}
                className="text-indigo hover:underline"
              >
                Open report
              </Link>
            </p>
          </div>
        )}
      </section>

      <section className="border-t border-line pt-6" aria-label="Your decision">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Your decision</h3>
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
            <LockKeyhole size={12} aria-hidden /> Workspace only
          </span>
        </div>
        <div className="mt-4">
          <ReviewSelect
            candidate={candidate}
            campaignId={campaignId}
            name={name}
          />
        </div>
        <CandidateDetails
          candidateId={candidate.id}
          campaignId={campaignId}
          fee={candidate.proposedFee}
          notes={candidate.notes}
          currency={candidate.feeCurrency}
        />
        <p className="mt-3 text-[11px] text-ink-muted">
          Notes and fees stay out of exports.
        </p>
      </section>
    </div>
  );
}
