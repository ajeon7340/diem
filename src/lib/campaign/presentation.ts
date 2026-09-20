import type { Candidate } from '@/lib/data/campaigns';
import type { ChannelReportView } from '@/lib/channel/report';
import type { AnalysisJob } from '@/types';

export const REVIEW_LABELS = {
  considering: 'Reviewing',
  shortlisted: 'Priority candidate',
  hold: 'On hold',
  rejected: 'Excluded',
} as const;

export const CONFIDENCE_LABELS = {
  supported: 'Supported by evidence',
  directional: 'Directional evidence',
  insufficient: 'Not enough evidence',
} as const;

export interface CandidateView {
  candidate: Candidate;
  report: ChannelReportView | null;
  state: 'ready' | 'queued' | 'running' | 'failed' | 'partial' | 'missing';
  summary: string;
  notice: string | null;
}

/** Only customer-facing state crosses into the UI, never raw worker errors. */
export function presentCandidate(
  candidate: Candidate,
  jobs: AnalysisJob[],
  report: ChannelReportView | null,
): CandidateView {
  const running = jobs.some((job) => job.status === 'running');
  const queued = jobs.some((job) => job.status === 'queued');
  const failed = jobs.some((job) => job.status === 'failed');
  const hasData = Boolean(candidate.analysis || report);
  const state = running
    ? 'running'
    : queued
      ? 'queued'
      : failed
        ? hasData
          ? 'partial'
          : 'failed'
        : hasData
          ? 'ready'
          : 'missing';
  const notice =
    state === 'running'
      ? 'Analysis in progress.'
      : state === 'queued'
        ? 'Waiting for analysis.'
        : state === 'partial'
          ? 'Some analysis could not be completed. Collected evidence is available.'
          : state === 'failed'
            ? 'Analysis could not be completed.'
            : state === 'missing'
              ? 'No current report. Open the report to collect fresh evidence.'
              : null;
  const fit = candidate.fit;
  const disclosed =
    report?.promotions.filter((p) => p.disclosure === 'explicit').length ??
    candidate.analysis?.promotions.filter((p) => p.disclosure === 'explicit')
      .length ??
    0;
  const summary =
    notice ??
    (fit
      ? fit.confidence === 'insufficient'
        ? 'Not enough evidence for a campaign assessment.'
        : fit.relevance
      : report
        ? `${report.videos.length} sampled videos · ${disclosed} paid-promotion disclosures`
        : 'Public report available. Open to review the evidence.');
  return { candidate, report, state, summary, notice };
}

export function candidateName(view: CandidateView): string {
  return (
    view.candidate.analysis?.title ??
    view.report?.title ??
    view.candidate.submittedAs ??
    view.candidate.channelId
  );
}
