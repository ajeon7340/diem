import { LoaderCircle, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { setCandidateStatus, writeCandidateFit } from '@/app/actions/campaign';
import { describeJob } from '@/lib/ingest/jobs';
import type { Candidate } from '@/lib/data/campaigns';
import type { CandidateRow } from '@/lib/report/candidate-compare';
import type { AnalysisJob } from '@/types';
import { cn } from '@/lib/cn';

const CONFIDENCE: Record<
  'insufficient' | 'directional' | 'supported',
  { tone: 'rose' | 'amber' | 'emerald'; label: string }
> = {
  insufficient: { tone: 'rose', label: 'Not enough evidence' },
  directional: { tone: 'amber', label: 'Directional' },
  supported: { tone: 'emerald', label: 'Supported by the corpus' },
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="rail">{label}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

/**
 * One candidate in full: what was read, what state the read is in, and the
 * written fit against this brief.
 *
 * FOUR STATES, and they are different answers rather than degrees of the same
 * one. Nothing stored yet; the public pass landed but the model pass has not
 * run; the model pass failed; and a complete read whose own confidence is
 * "insufficient". A card that collapsed the last two into "no data" would let
 * a channel nobody could assess look like a channel that was assessed badly.
 */
export function CandidateCard({
  campaignId,
  candidate,
  row,
  jobs,
}: {
  campaignId: string;
  candidate: Candidate;
  row: CandidateRow;
  jobs: AnalysisJob[];
}) {
  const a = candidate.analysis;
  const fit = candidate.fit;
  const live = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const failed = jobs.filter((j) => j.status === 'failed');

  return (
    <section
      id={`candidate-${candidate.id}`}
      className="scroll-mt-20 overflow-hidden rounded-panel border border-line bg-surface"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-medium text-ink">{row.title}</h3>
          <p className="tnum truncate text-[11px] text-ink-faint">
            {a?.handle ? `${a.handle} · ` : ''}
            {candidate.channelId}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Three buttons and no dropdown: the shortlist decision is the
              point of the page and hiding it behind a menu costs a click on
              the one action a buyer came to take. */}
          {(['shortlisted', 'considering', 'rejected'] as const).map((status) => (
            <form key={status} action={setCandidateStatus}>
              <input type="hidden" name="candidateId" value={candidate.id} />
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="status" value={status} />
              <button
                type="submit"
                disabled={candidate.status === status}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  candidate.status === status
                    ? 'border-indigo bg-indigo text-white'
                    : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {status === 'shortlisted' ? 'Shortlist' : status === 'rejected' ? 'Reject' : 'Consider'}
              </button>
            </form>
          ))}
        </div>
      </header>

      {/* --- What state the analysis is in ------------------------------- */}
      {row.missing ? (
        <p className="border-b border-line bg-amber-wash px-5 py-2.5 text-[12px] leading-relaxed text-ink">
          Nothing has been stored for this channel yet. The public read runs when a candidate is
          added — if this persists, the YouTube key is missing or the channel could not be read.
        </p>
      ) : null}

      {live.length ? (
        <p className="flex items-start gap-2 border-b border-line bg-indigo/5 px-5 py-2.5 text-[12px] leading-relaxed text-ink">
          <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-indigo" aria-hidden />
          <span>{live.map((job) => describeJob(job)).filter(Boolean).join(' ')}</span>
        </p>
      ) : null}

      {failed.length ? (
        <p className="flex items-start gap-2 border-b border-line bg-amber-wash px-5 py-2.5 text-[12px] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden />
          <span>{failed.map((job) => describeJob(job)).filter(Boolean).join(' ')}</span>
        </p>
      ) : null}

      {!row.missing && !row.classified && !live.length && !failed.length ? (
        <p className="border-b border-line bg-paper px-5 py-2.5 text-[12px] leading-relaxed text-ink-muted">
          {row.analysisRan ? (
            <>
              The comment pass ran on the uploads we read and found nothing readable — comments are
              disabled or removed on this channel. That is an <strong>empty</strong> corpus, not a
              clean one: no climate, purchase-language or brand-safety conclusion can be drawn
              about this channel from comments, and none is shown.
            </>
          ) : (
            <>
              Public figures are in. Comment classification has not run — the climate and
              purchase-language columns are empty for that reason, not because they are low. It
              needs the worker process (<code className="tnum">npm run worker</code>) and a model
              key.
            </>
          )}
        </p>
      ) : null}

      {/* --- What was read ----------------------------------------------- */}
      {a ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-line px-5 py-4 sm:grid-cols-4">
          <Stat label="Subscribers" value={row.subscribers?.toLocaleString('en-US') ?? null} />
          <Stat label="Median views" value={row.medianViews?.toLocaleString('en-US') ?? null} />
          {/* Zero is a MEASUREMENT here, not an absence: the pass ran and the
              channel had nothing readable. A dash would say we did not look,
              and the comparison table beside this prints the 0. */}
          <Stat label="Comments read" value={row.commentsAnalysed.toLocaleString('en-US')} />
          <Stat
            label="Safety scan read"
            value={row.commentsScanned?.toLocaleString('en-US') ?? null}
          />
          {row.purchaseLanguageBasis ? (
            <Stat
              label="Purchase language"
              value={`${((row.purchaseLanguageRate ?? 0) * 100).toFixed(1)}% of ${row.purchaseLanguageBasis.scored.toLocaleString('en-US')}`}
            />
          ) : null}
          {a.sentiment !== null && row.classified ? (
            <Stat label="Commenter climate" value={`${a.sentiment.toFixed(0)}/100`} />
          ) : null}
        </dl>
      ) : null}

      {/* --- Sponsored history, with the basis --------------------------- */}
      {a && a.promotions.length ? (
        <div className="border-b border-line px-5 py-4">
          <p className="rail">Sponsored history</p>
          <ul className="mt-2 space-y-1.5">
            {a.promotions.slice(0, 5).map((p) => (
              <li key={p.postId} className="flex items-start gap-2 text-[12px] leading-relaxed">
                <Badge tone={p.disclosure === 'explicit' ? 'emerald' : 'amber'}>
                  {p.disclosure === 'explicit'
                    ? 'disclosed'
                    : p.disclosure === 'affiliate'
                      ? 'affiliate link'
                      : 'inferred'}
                </Badge>
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-ink underline-offset-4 hover:underline"
                  >
                    {p.title}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-ink">{p.title}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            &ldquo;Disclosed&rdquo; is YouTube&rsquo;s own paid-placement flag. &ldquo;Inferred&rdquo;
            is our read of the description and is a guess. A difference in views between sponsored
            and organic uploads is an observation, never a measured effect of sponsorship.
          </p>
        </div>
      ) : a && !row.missing ? (
        <p className="border-b border-line px-5 py-3 text-[12px] leading-relaxed text-ink-muted">
          No paid placement found in the uploads we read. That is what was read — not a claim that
          this creator has never run an ad.
        </p>
      ) : null}

      {/* --- What commenters talk about, with evidence ------------------- */}
      {a && a.clusters.length ? (
        <div className="border-b border-line px-5 py-4">
          <p className="rail">
            What commenters talk about{' '}
            <span className="normal-case tracking-normal text-ink-faint">
              — {a.commentsAnalysed.toLocaleString('en-US')} comments, not a sample of viewers
            </span>
          </p>
          <ul className="mt-2 space-y-2">
            {a.clusters.slice(0, 6).map((cluster) => (
              <li key={cluster.id}>
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="min-w-0 truncate text-ink">{cluster.label}</span>
                  <span className="tnum shrink-0 text-ink-faint">
                    {Math.round(cluster.share * 100)}% · {cluster.commentCount.toLocaleString('en-US')}
                  </span>
                </div>
                {cluster.exampleComment ? (
                  <p className="mt-0.5 truncate text-[11px] italic text-ink-faint">
                    &ldquo;{cluster.exampleComment}&rdquo;
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* --- The written read against THIS brief ------------------------- */}
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="rail">Fit against this brief</p>
          {fit ? <Badge tone={CONFIDENCE[fit.confidence].tone}>{CONFIDENCE[fit.confidence].label}</Badge> : null}
        </div>

        {fit ? (
          <div className="mt-3 space-y-3">
            <p className="text-[13px] font-medium leading-relaxed text-ink">{fit.verdict}</p>
            {fit.confidenceReason ? (
              <p className="rounded-md border border-line bg-paper px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
                {fit.confidenceReason}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Relevance">{fit.relevance}</Field>
              <Field label="What commenters show">{fit.audienceSignal}</Field>
              <Field label="Sponsored history">{fit.sponsorshipRead}</Field>
              <Field label="Brand risk">{fit.brandRisk}</Field>
            </div>
            {fit.suggestedAngles.length ? (
              <div>
                <p className="rail">Angles</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] leading-relaxed text-ink">
                  {fit.suggestedAngles.map((angle) => (
                    <li key={angle}>{angle}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {fit.beforeYouSign.length ? (
              <div>
                <p className="rail">Confirm before you sign</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] leading-relaxed text-ink">
                  {fit.beforeYouSign.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-[11px] text-ink-faint">
              Written by {candidate.fitModel ?? 'a model'} from the public figures above
              {candidate.fitWrittenAt
                ? ` on ${new Date(candidate.fitWrittenAt).toLocaleDateString('en-GB')}`
                : ''}
              . Re-run it after the brief changes.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
            Not written yet. It reads this channel&rsquo;s public figures against this
            campaign&rsquo;s brief — a different brief is a different answer, so it is not shared
            between campaigns.
          </p>
        )}

        <form action={writeCandidateFit} className="mt-3">
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <Button type="submit" variant="secondary" size="sm" disabled={row.missing}>
            {fit ? 'Re-read against the brief' : 'Read against the brief'}
          </Button>
        </form>
      </div>

      {candidate.notes ? (
        <p className="border-t border-line bg-paper px-5 py-2.5 text-[12px] leading-relaxed text-ink-muted">
          <span className="rail">Your note</span> {candidate.notes}
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="rail">{label}</dt>
      <dd className={cn('tnum mt-0.5 text-[15px]', value === null ? 'text-ink-faint' : 'text-ink')}>
        {value ?? '—'}
      </dd>
    </div>
  );
}
