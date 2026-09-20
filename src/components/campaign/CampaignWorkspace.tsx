'use client';

import Link from 'next/link';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Users,
  Columns3,
  Pencil,
  LockKeyhole,
  Check,
  LoaderCircle,
} from 'lucide-react';
import type { Campaign } from '@/lib/data/campaigns';
import { candidateName, type CandidateView } from '@/lib/campaign/presentation';
import { currency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ContextWorkspace } from '@/components/shell/ContextWorkspace';
import { WorkspaceDialog } from '@/components/ui/WorkspaceDialog';
import { PrintReport } from '@/components/channel/ReportActions';
import { CandidateForm } from './CandidateForm';
import { CandidateReview } from './CandidateReview';
import { ComparisonTable } from './ComparisonTable';
import { ReviewSelect } from './ReviewSelect';

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
  const [filter, setFilter] = useState<'all' | 'shortlisted' | 'considering'>(
    'all',
  );
  const [message, setMessage] = useState('');
  const comparisonHeading = useRef<HTMLHeadingElement>(null);
  const compareButton = useRef<HTMLButtonElement>(null);
  const chosen = candidates.filter((view) =>
    selected.includes(view.candidate.id),
  );
  const visible = candidates.filter(
    (view) => filter === 'all' || view.candidate.status === filter,
  );
  const shortlisted = candidates.filter(
    (view) => view.candidate.status === 'shortlisted',
  ).length;
  const full = candidates.length >= 5;
  const onAdded = useCallback((text: string) => {
    setAddOpen(false);
    setAddVersion((version) => version + 1);
    setMessage(text);
  }, []);
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );

  return (
    <div className="print:hidden">
      <ContextWorkspace
        sticky
        sidebar={
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="border-b border-line p-4 lg:p-5">
              <Link
                href="/campaigns"
                className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-indigo"
              >
                <ArrowLeft size={13} aria-hidden /> All campaigns
              </Link>
              <p className="mt-3 text-xs font-medium text-indigo lg:mt-5">
                {brandName ?? 'Brand not set'}
              </p>
              <h1 className="mt-1.5 break-words text-xl font-semibold tracking-tight">
                {campaign.name}
              </h1>
              <p className="mt-2 text-xs text-ink-muted">
                {candidates.length} of 5 candidates · {shortlisted} priority
              </p>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                disabled={full}
                className="primary-action mt-3 w-full disabled:cursor-not-allowed disabled:opacity-45 lg:mt-5"
              >
                <Plus size={16} aria-hidden /> Add candidate
              </button>
              {full && (
                <p className="mt-2 text-xs text-ink-muted">
                  This campaign has all 5 candidate slots filled.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setBriefOpen(true)}
              className="flex w-full items-center justify-between border-b border-line px-5 py-3 text-xs font-medium text-indigo lg:hidden"
            >
              View campaign brief <Pencil size={13} aria-hidden />
            </button>
            <section
              className="hidden border-b border-line p-5 lg:block"
              aria-label="Campaign brief"
            >
              <div className="flex items-center justify-between">
                <h2 className="rail">Campaign brief</h2>
                <button
                  type="button"
                  onClick={() => setBriefOpen(true)}
                  className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-indigo"
                >
                  <Pencil size={12} aria-hidden /> Edit brief
                </button>
              </div>
              <dl className="mt-3 space-y-4">
                {[
                  ['Product', campaign.product],
                  ['Goal', campaign.objective],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] text-ink-faint">{label}</dt>
                    <dd className="mt-1 line-clamp-3 text-sm leading-relaxed">
                      {value || 'Not set'}
                    </dd>
                  </div>
                ))}
              </dl>
              <details className="mt-4 text-xs">
                <summary className="cursor-pointer text-ink-muted">
                  More campaign details
                </summary>
                <dl className="mt-3 space-y-3">
                  {[
                    ['Target customer', campaign.audience],
                    ['Use case', campaign.useCase],
                    ['Avoid', campaign.avoidTopics],
                    [
                      'Budget',
                      campaign.budgetTotal === null
                        ? null
                        : currency(
                            campaign.budgetTotal,
                            campaign.budgetCurrency,
                          ),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-ink-faint">{label}</dt>
                      <dd className="mt-1 break-words leading-relaxed">
                        {value || 'Not set'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            </section>
            <div className="flex flex-wrap gap-1 p-3 lg:block lg:space-y-1">
              <Link
                href={`/campaigns/${campaign.id}`}
                aria-current={!planningActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm',
                  !planningActive
                    ? 'bg-indigo-wash font-medium text-indigo'
                    : 'text-ink-muted hover:bg-paper',
                )}
              >
                <Users size={16} aria-hidden /> Candidates{' '}
                <span className="ml-auto text-xs">{candidates.length}</span>
              </Link>
              {canEvaluate && (
                <Link
                  href={`/campaigns/${campaign.id}?view=planning`}
                  aria-current={planningActive ? 'page' : undefined}
                  className={cn(
                    'flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm',
                    planningActive
                      ? 'bg-indigo-wash font-medium text-indigo'
                      : 'text-ink-muted hover:bg-paper',
                  )}
                >
                  Content planning
                </Link>
              )}
            </div>
            <div className="border-t border-line p-3 lg:p-5">
              <PrintReport />
              <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
                <LockKeyhole size={12} aria-hidden /> Notes, fees and budget
                stay private.
              </p>
            </div>
          </div>
        }
      >
        {planningActive ? (
          <section>
            <h2 className="text-xl font-semibold tracking-tight">
              Content planning
            </h2>
            <div className="mt-5 space-y-5">{planning}</div>
          </section>
        ) : (
          <>
            <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  Choose your creators
                </h2>
                <p className="mt-1.5 text-sm text-ink-muted">
                  Review their content. Keep the candidates you want to work
                  with.
                </p>
              </div>
            </header>
            {message && (
              <p
                role="status"
                className="mb-4 flex items-center gap-2 text-sm text-indigo"
              >
                <Check size={15} aria-hidden />
                {message}
              </p>
            )}
            <section
              className="overflow-hidden rounded-2xl border border-line bg-surface"
              aria-label="Campaign candidates"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
                <div
                  className="flex flex-wrap gap-1"
                  role="group"
                  aria-label="Filter candidates"
                >
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
                        'min-h-9 rounded-lg px-3 text-xs font-medium',
                        filter === value
                          ? 'bg-indigo-wash text-indigo'
                          : 'text-ink-muted hover:bg-paper',
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
                      comparisonHeading.current?.scrollIntoView({
                        block: 'start',
                        behavior: 'smooth',
                      });
                    });
                  }}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-indigo disabled:cursor-not-allowed disabled:text-ink-faint"
                >
                  <Columns3 size={14} aria-hidden /> Compare
                  {chosen.length > 0 ? ` (${chosen.length})` : ''}
                </button>
              </div>
              {visible.length ? (
                <>
                  <div className="hidden grid-cols-[24px_minmax(0,1fr)_minmax(0,1.2fr)_160px] gap-4 border-b border-line bg-paper px-5 py-3 text-[11px] font-medium text-ink-faint xl:grid">
                    <span />
                    <span>Creator</span>
                    <span>Review summary</span>
                    <span>Your decision</span>
                  </div>
                  <ul className="divide-y divide-line">
                    {visible.map((view) => {
                      const { candidate } = view;
                      const name = candidateName(view);
                      const avatar =
                        candidate.analysis?.avatarUrl ?? view.report?.avatar;
                      const active =
                        view.state === 'queued' || view.state === 'running';
                      return (
                        <li
                          key={candidate.id}
                          className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 gap-y-3 p-4 hover:bg-paper/60 sm:p-5 xl:grid-cols-[24px_minmax(0,1fr)_minmax(0,1.2fr)_160px] xl:items-center xl:gap-4"
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(candidate.id)}
                            onChange={() => toggle(candidate.id)}
                            aria-label={`Select ${name} for comparison`}
                            className="mt-3 h-4 w-4 accent-indigo xl:mt-0"
                          />
                          <button
                            type="button"
                            onClick={() => setReview(candidate.id)}
                            className="group flex min-w-0 items-center gap-3 text-left"
                            aria-label={`Review ${name}`}
                          >
                            {avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={avatar}
                                alt=""
                                width={40}
                                height={40}
                                className="h-10 w-10 shrink-0 rounded-full"
                              />
                            ) : (
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-wash text-sm font-semibold text-indigo">
                                {name
                                  .replace(/^@/, '')
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold group-hover:text-indigo">
                                {name}
                              </span>
                              <span className="mt-1 block truncate text-[11px] text-ink-muted">
                                {candidate.analysis?.handle ??
                                  view.report?.handle ??
                                  'YouTube channel'}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setReview(candidate.id)}
                            aria-label={`Read evidence for ${name}`}
                            className="col-start-2 flex items-start gap-2 text-left text-xs leading-relaxed text-ink-muted hover:text-indigo xl:col-start-auto"
                          >
                            {active && (
                              <LoaderCircle
                                size={14}
                                aria-hidden
                                className="mt-0.5 shrink-0 animate-spin"
                              />
                            )}
                            <span className="line-clamp-2">{view.summary}</span>
                          </button>
                          <div className="col-start-2 max-w-[190px] xl:col-start-auto">
                            <ReviewSelect
                              candidate={candidate}
                              campaignId={campaign.id}
                              name={name}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="border-t border-line px-5 py-3 text-[11px] text-ink-faint">
                    Select two or more creators to compare their evidence.
                  </p>
                </>
              ) : (
                <div className="px-6 py-14 text-center">
                  <Users
                    size={26}
                    className="mx-auto text-indigo/60"
                    aria-hidden
                  />
                  <h3 className="mt-4 text-base font-semibold">
                    {candidates.length
                      ? 'No candidates in this view'
                      : 'Start with a creator you have in mind'}
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
                    {candidates.length
                      ? 'Change the filter to see your other candidates.'
                      : 'Add a channel, review their content, then build your shortlist.'}
                  </p>
                  {candidates.length ? (
                    <button
                      type="button"
                      onClick={() => setFilter('all')}
                      className="mt-5 text-sm font-medium text-indigo"
                    >
                      Show all candidates
                    </button>
                  ) : (
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                      <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="primary-action"
                      >
                        <Plus size={15} aria-hidden /> Add candidate
                      </button>
                      <Link
                        href={`/discover?campaign=${campaign.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-indigo"
                      >
                        Discover creators <ArrowRight size={14} aria-hidden />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </section>
            {comparison && chosen.length >= 2 && (
              <section className="mt-7" aria-label="Selected comparison">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2
                    ref={comparisonHeading}
                    tabIndex={-1}
                    className="scroll-mt-24 text-lg font-semibold tracking-tight"
                  >
                    Compare {chosen.length} creators
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setComparison(false);
                      compareButton.current?.focus();
                    }}
                    className="min-h-9 px-2 text-xs text-ink-muted"
                  >
                    Close comparison
                  </button>
                </div>
                <ComparisonTable candidates={chosen} includePrivate />
              </section>
            )}
          </>
        )}
      </ContextWorkspace>
      <WorkspaceDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a candidate"
        description="Find a public YouTube channel to review for this campaign."
      >
        {full ? (
          <p className="text-sm text-ink-muted">
            This campaign already has five candidates.
          </p>
        ) : (
          <CandidateForm
              key={addVersion}
            campaignId={campaign.id}
            onAdded={onAdded}
          />
        )}
      </WorkspaceDialog>
      <WorkspaceDialog
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        title="Campaign brief"
        description="These details apply to this campaign. Your brand profile stays separate."
      >
        {briefEditor}
      </WorkspaceDialog>
      {candidates.map((view) => (
        <WorkspaceDialog
          key={view.candidate.id}
          open={review === view.candidate.id}
          onClose={() => setReview(null)}
          title={candidateName(view)}
          description="Candidate review"
          drawer
        >
          <CandidateReview
            view={view}
            campaignId={campaign.id}
            canEvaluate={canEvaluate}
          />
        </WorkspaceDialog>
      ))}
    </div>
  );
}
