'use client';

import Link from 'next/link';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  Columns3,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Users,
} from 'lucide-react';

import type { Campaign } from '@/lib/data/campaigns';
import { candidateName, REVIEW_LABELS, type CandidateView } from '@/lib/campaign/presentation';
import { currency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/shell/PageHeader';
import { WorkspaceDialog } from '@/components/ui/WorkspaceDialog';
import { StateLabel } from '@/components/ui/StateLabel';
import { PrintReport } from '@/components/channel/ReportActions';
import { CandidateForm } from './CandidateForm';
import { CandidateReview } from './CandidateReview';
import { ComparisonTable } from './ComparisonTable';
import { ReviewSelect } from './ReviewSelect';

/**
 * A campaign: the brief at the top, the candidates as a table, one candidate
 * open at a time in a panel beside them.
 *
 * WHAT THIS REPLACED. A 340px rail carrying the campaign name, the brief, a
 * two-item sub-navigation and an export button, beside a list of cards — so a
 * comparison table had about 60% of a laptop screen to render five creators
 * and eight columns in, and the campaign's identity was in the rail while the
 * page's heading said "Choose your creators".
 *
 * NOW: the header says which campaign and what it is for, and carries the one
 * action this page exists for. The candidates are a table, because comparing
 * is what a shortlist is for and a table is what compares. The rail is gone,
 * and the width went to the table.
 *
 * ANALYSIS STATUS AND YOUR DECISION ARE DIFFERENT COLUMNS. One is what adfit
 * managed to collect; the other is what the customer decided. They were one
 * sentence of summary text, so "Analysis could not be completed" and "Excluded"
 * read as the same kind of fact — and a collection failure looked like a
 * judgement about the creator.
 *
 * THE DETAIL PANEL KEEPS ITS STATE. Every candidate's panel stays mounted, so
 * an unsaved note survives closing it, opening another, and coming back. The
 * native `<dialog>` supplies the focus trap, Escape and focus return.
 */
export function CampaignWorkspace({
  campaign,
  candidates,
  brandName,
  canEvaluate,
  briefEditor,
  planning,
  planningActive = false,
}: {
  campaign: Campaign;
  candidates: CandidateView[];
  brandName: string | null;
  canEvaluate: boolean;
  briefEditor: ReactNode;
  planning?: ReactNode;
  planningActive?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addVersion, setAddVersion] = useState(0);
  const [briefOpen, setBriefOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'shortlisted' | 'considering'>('all');
  const [message, setMessage] = useState('');
  const comparisonHeading = useRef<HTMLHeadingElement>(null);
  const compareButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const briefButton = useRef<HTMLButtonElement>(null);
  // The row that opened the panel, so closing returns focus to where it was
  // rather than to the top of the document.
  const opener = useRef<HTMLButtonElement | null>(null);

  const chosen = candidates.filter((view) => selected.includes(view.candidate.id));
  const visible = candidates.filter(
    (view) => filter === 'all' || view.candidate.status === filter,
  );
  const shortlisted = candidates.filter((view) => view.candidate.status === 'shortlisted').length;
  const full = candidates.length >= 5;

  const onAdded = useCallback((text: string) => {
    setAddOpen(false);
    setAddVersion((version) => version + 1);
    setMessage(text);
  }, []);
  const toggle = (id: string) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));

  function openReview(id: string, from: HTMLButtonElement | null) {
    opener.current = from;
    setReview(id);
  }
  function closeReview() {
    setReview(null);
    opener.current?.focus();
  }

  // One line of brief, in the header. The whole thing is one click away.
  const briefLine = [campaign.product, campaign.objective].filter(Boolean).join(' · ');

  return (
    <div className="print:hidden">
      <PageHeader
        eyebrow={brandName ?? 'No brand set'}
        title={campaign.name}
        meta={
          <>
            <span className="tnum">{candidates.length} of 5 candidates</span>
            <span aria-hidden className="text-ink-faint">·</span>
            <span className="tnum">{shortlisted} priority</span>
            <button
              ref={briefButton}
              type="button"
              onClick={() => setBriefOpen(true)}
              className="press text-indigo underline-offset-4 hover:underline"
            >
              Edit brief
            </button>
          </>
        }
        summary={briefLine || 'No product or goal recorded yet.'}
        secondary={
          <>
            {canEvaluate ? (
              <Link
                href={
                  planningActive
                    ? `/campaigns/${campaign.id}`
                    : `/campaigns/${campaign.id}?view=planning`
                }
                className="press inline-flex min-h-9 items-center rounded-[var(--r-md)] border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-paper"
              >
                {planningActive ? 'Candidates' : 'Content planning'}
              </Link>
            ) : null}
            <PrintReport appendixToggle={false} />
          </>
        }
        primary={
          <button
            ref={addButton}
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={full}
            title={full ? 'This campaign has all five candidate slots filled' : undefined}
            className="press inline-flex min-h-9 items-center gap-1.5 rounded-[var(--r-md)] bg-indigo px-3 text-[13px] font-medium text-white hover:bg-indigo-hover disabled:cursor-not-allowed disabled:bg-indigo/40"
          >
            <Plus size={15} strokeWidth={2} aria-hidden /> Add candidate
          </button>
        }
      />

      <main className="flex-1 px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-[1480px]">
          {planningActive ? (
            <section className="space-y-4">{planning}</section>
          ) : (
            <>
              {message ? (
                <p role="status" className="mb-3 flex items-center gap-2 text-[13px] text-indigo">
                  <Check size={15} aria-hidden />
                  {message}
                </p>
              ) : null}

              <section className="surface overflow-hidden" aria-label="Campaign candidates">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2.5">
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Filter candidates">
                    {(
                      [
                        ['all', `All ${candidates.length}`],
                        ['considering', 'Reviewing'],
                        ['shortlisted', `Priority ${shortlisted}`],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={filter === value}
                        onClick={() => setFilter(value)}
                        className={cn(
                          'press min-h-8 rounded-[var(--r-md)] px-2.5 text-[12px] font-medium transition-colors duration-150',
                          filter === value
                            ? 'bg-indigo-wash text-indigo'
                            : 'text-ink-muted hover:bg-paper hover:text-ink',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    ref={compareButton}
                    type="button"
                    disabled={chosen.length < 2}
                    onClick={() => {
                      setComparison(true);
                      requestAnimationFrame(() => {
                        comparisonHeading.current?.focus();
                        comparisonHeading.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                      });
                    }}
                    className="press inline-flex min-h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-line px-2.5 text-[12px] font-medium text-indigo disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint"
                  >
                    <Columns3 size={14} strokeWidth={1.75} aria-hidden /> Compare
                    {chosen.length > 0 ? ` ${chosen.length}` : ''}
                  </button>
                </div>

                {visible.length ? (
                  <>
                    <div className="table-scroll">
                      <table className="data-table min-w-[820px]">
                        <caption className="sr-only">
                          Candidates on {campaign.name}, with the evidence collected for each, the
                          state of that collection, and your decision
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col" className="w-9">
                              <span className="sr-only">Select for comparison</span>
                            </th>
                            <th scope="col">Creator</th>
                            <th scope="col">Evidence</th>
                            <th scope="col" className="w-36">Analysis</th>
                            <th scope="col" className="w-44">Your decision</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((view) => {
                            const { candidate } = view;
                            const name = candidateName(view);
                            const avatar = candidate.analysis?.avatarUrl ?? view.report?.avatar;
                            const active = view.state === 'queued' || view.state === 'running';
                            const open = review === candidate.id;
                            return (
                              <tr key={candidate.id} data-selected={open ? 'true' : undefined} className={open ? 'bg-indigo-wash/50' : undefined}>
                                <td className="align-middle">
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(candidate.id)}
                                    onChange={() => toggle(candidate.id)}
                                    aria-label={`Select ${name} for comparison`}
                                    className="h-4 w-4 accent-indigo"
                                  />
                                </td>
                                <td className="align-middle">
                                  <button
                                    type="button"
                                    onClick={(event) => openReview(candidate.id, event.currentTarget)}
                                    className="group flex min-w-0 items-center gap-2.5 text-left"
                                    aria-label={`Open ${name}`}
                                  >
                                    {avatar ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={avatar}
                                        alt=""
                                        width={32}
                                        height={32}
                                        className="h-8 w-8 shrink-0 rounded-full outline outline-1 -outline-offset-1 outline-black/10"
                                      />
                                    ) : (
                                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-wash text-[12px] font-semibold text-indigo">
                                        {name.replace(/^@/, '').slice(0, 1).toUpperCase()}
                                      </span>
                                    )}
                                    <span className="min-w-0">
                                      <span className="block break-words text-[13px] font-medium text-ink group-hover:text-indigo">
                                        {name}
                                      </span>
                                      <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                                        {candidate.analysis?.handle ?? view.report?.handle ?? 'YouTube channel'}
                                      </span>
                                    </span>
                                  </button>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    onClick={(event) => openReview(candidate.id, event.currentTarget)}
                                    aria-label={`Read evidence for ${name}`}
                                    className="text-left text-[12px] leading-relaxed text-ink-muted hover:text-indigo"
                                  >
                                    <span className="line-clamp-2">{view.summary}</span>
                                  </button>
                                </td>
                                <td className="align-middle">
                                  {/* WHAT WE COLLECTED. Never mixed with the
                                      decision beside it: a failed collection is
                                      not a verdict on a creator. */}
                                  <StateLabel state={view.state}>
                                    {active ? (
                                      <LoaderCircle size={12} aria-hidden className="animate-spin" />
                                    ) : null}
                                  </StateLabel>
                                </td>
                                <td className="align-middle">
                                  <ReviewSelect candidate={candidate} campaignId={campaign.id} name={name} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="border-t border-line px-3 py-2 text-[11px] text-ink-faint">
                      Select two or more creators to compare their evidence side by side.
                    </p>
                  </>
                ) : (
                  <div className="px-6 py-12 text-center">
                    <Users size={22} className="mx-auto text-indigo/60" aria-hidden />
                    <h3 className="mt-3 text-[14px] font-semibold text-ink">
                      {candidates.length ? 'Nothing in this view' : 'No candidates yet'}
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-ink-muted">
                      {candidates.length
                        ? 'Change the filter to see your other candidates.'
                        : 'Add a channel, review the evidence, then build your shortlist.'}
                    </p>
                    {candidates.length ? (
                      <button
                        type="button"
                        onClick={() => setFilter('all')}
                        className="press mt-4 text-[13px] font-medium text-indigo"
                      >
                        Show all candidates
                      </button>
                    ) : (
                      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setAddOpen(true)}
                          className="press inline-flex min-h-9 items-center gap-1.5 rounded-[var(--r-md)] bg-indigo px-3 text-[13px] font-medium text-white hover:bg-indigo-hover"
                        >
                          <Plus size={15} aria-hidden /> Add candidate
                        </button>
                        <Link
                          href={`/discover?campaign=${campaign.id}`}
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-indigo underline-offset-4 hover:underline"
                        >
                          Discover creators <ArrowRight size={14} aria-hidden />
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
                <LockKeyhole size={12} strokeWidth={1.75} aria-hidden /> Notes, quoted fees and
                budget stay in this workspace and are excluded from exports unless you include them.
              </p>

              {comparison && chosen.length >= 2 ? (
                <section className="mt-6" aria-label="Selected comparison">
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <h2
                      ref={comparisonHeading}
                      tabIndex={-1}
                      className="scroll-mt-6 text-[15px] font-semibold tracking-tight text-ink"
                    >
                      Compare {chosen.length} creators
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setComparison(false);
                        compareButton.current?.focus();
                      }}
                      className="press min-h-8 px-2 text-[12px] text-ink-muted hover:text-ink"
                    >
                      Close comparison
                    </button>
                  </div>
                  <ComparisonTable candidates={chosen} includePrivate />
                </section>
              ) : null}
            </>
          )}
        </div>
      </main>

      <WorkspaceDialog
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          addButton.current?.focus();
        }}
        title="Add a candidate"
        description="A public YouTube channel to review for this campaign."
      >
        {full ? (
          <p className="text-[13px] text-ink-muted">This campaign already has five candidates.</p>
        ) : (
          <CandidateForm key={addVersion} campaignId={campaign.id} onAdded={onAdded} />
        )}
      </WorkspaceDialog>

      <WorkspaceDialog
        open={briefOpen}
        onClose={() => {
          setBriefOpen(false);
          briefButton.current?.focus();
        }}
        title="Campaign brief"
        description="These details apply to this campaign. Your brand profile stays separate and is not changed here."
      >
        {/* The read-only summary first, so opening the brief to check a figure
            does not mean reading a form. */}
        <dl className="mb-5 grid gap-x-6 gap-y-2.5 border-b border-line pb-5 sm:grid-cols-2">
          {(
            [
              ['Product', campaign.product],
              ['Goal', campaign.objective],
              ['Target customer', campaign.audience],
              ['Use case', campaign.useCase],
              ['Avoid', campaign.avoidTopics],
              [
                'Budget',
                campaign.budgetTotal === null
                  ? null
                  : currency(campaign.budgetTotal, campaign.budgetCurrency),
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="rail">{label}</dt>
              <dd className="mt-1 break-words text-[12px] leading-relaxed text-ink">
                {value || <span className="text-ink-faint">Not set</span>}
              </dd>
            </div>
          ))}
        </dl>
        {briefEditor}
      </WorkspaceDialog>

      {/* EVERY PANEL STAYS MOUNTED. Closing one and reopening it must not lose
          a note somebody was halfway through writing. */}
      {candidates.map((view) => (
        <WorkspaceDialog
          key={view.candidate.id}
          open={review === view.candidate.id}
          onClose={closeReview}
          title={candidateName(view)}
          description={`${REVIEW_LABELS[view.candidate.status]} · analysis ${view.state}`}
          drawer
        >
          <CandidateReview view={view} campaignId={campaign.id} canEvaluate={canEvaluate} />
        </WorkspaceDialog>
      ))}
    </div>
  );
}
