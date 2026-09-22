import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { previewChannel } from '@/app/actions/channel';
import { ChannelEntry } from '@/components/channel/ChannelEntry';
import { FilterLinks } from '@/components/shell/FilterLinks';
import { PanelSection, WorkspaceLayout } from '@/components/shell/WorkspaceLayout';
import { Badge } from '@/components/ui/Badge';
import { getViewer } from '@/lib/access/viewer';
import { nextStep } from '@/lib/channel/state';
import {
  LIBRARY_FILTERS,
  isLibraryFilter,
  libraryState,
  matchesQuery,
  type LibraryFilter,
  type LibraryRow,
} from '@/lib/channel/library';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import type { AnalysisJob } from '@/types';

export const metadata: Metadata = { title: 'Channel analysis' };
export const dynamic = 'force-dynamic';

export default async function Channels({
  searchParams,
}: {
  searchParams: { channel?: string; state?: string; q?: string };
}) {
  const viewer = await getViewer();
  if (!viewer.organization) {
    redirect(nextStep({ signedIn: Boolean(viewer.userId), hasWorkspace: false }, searchParams.channel));
  }
  if (viewer.organization.brandSetupState === 'pending') {
    redirect(nextStep({ signedIn: true, hasWorkspace: true, brandSetup: 'pending' }, searchParams.channel));
  }

  const rows = await loadLibrary(viewer.organization.id);
  const query = (searchParams.q ?? '').slice(0, 80);
  const active: LibraryFilter = isLibraryFilter(searchParams.state) ? searchParams.state : 'all';

  const classified = rows.map((row) => ({ row, state: libraryState(row) }));
  const searched = classified.filter(({ row }) => matchesQuery(row, query));
  const counts = LIBRARY_FILTERS.map((filter) => ({
    id: filter.id,
    label: filter.label,
    count:
      filter.id === 'all'
        ? searched.length
        : searched.filter(({ state }) => state.bucket === filter.id).length,
  }));
  const shown = active === 'all' ? searched : searched.filter(({ state }) => state.bucket === active);

  const form = new FormData();
  form.set('channel', searchParams.channel ?? '');
  const resolved = searchParams.channel ? await previewChannel({}, form) : {};

  function href(id: string) {
    const params = new URLSearchParams();
    if (id !== 'all') params.set('state', id);
    if (query) params.set('q', query);
    return params.toString() ? `/channels?${params}` : '/channels';
  }

  return (
    <WorkspaceLayout
      width="wide"
      panelLabel="Analyse a channel"
      header={{
        title: 'Channel analysis',
        meta: (
          <>
            <span className="tnum">
              {shown.length} shown{query ? ` for “${query}”` : ''}
            </span>
            <span className="tnum">{rows.length} saved</span>
            <span>reports expire 30 days after collection</span>
          </>
        ),
        summary: 'Reports are reused when you add a channel to a campaign — nothing is collected twice.',
      }}
      panel={
        <div className="space-y-4">
          {/* THE LOOKUP IS THE PAGE'S ONE CONTROL, so it leads the rail. The
              heading it used to sit under said "New channel analysis" beside a
              page header that said "Channel analysis". */}
          <PanelSection title="Analyse a channel">
            <ChannelEntry initial={searchParams.channel} resolved={resolved} />
          </PanelSection>

          <PanelSection title="Filter">
            <form method="get" action="/channels" className="mb-3">
              {active !== 'all' ? <input type="hidden" name="state" value={active} /> : null}
              <label className="sr-only" htmlFor="library-search">
                Search saved reports
              </label>
              <input
                id="library-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search by name or handle"
                maxLength={80}
                className="min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-faint"
              />
            </form>
            <FilterLinks options={counts} active={active} hrefFor={href} legend="Filter reports" />
          </PanelSection>
        </div>
      }
    >
      <div className="surface overflow-hidden">
        {shown.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] font-medium text-ink">
              {rows.length === 0 ? 'No reports yet' : 'Nothing matches this filter'}
            </p>
            <p className="mx-auto mt-2 max-w-[48ch] text-[12px] leading-relaxed text-ink-muted">
              {rows.length === 0
                ? 'Analyse a YouTube channel to build a reusable report. Creators don’t need to sign up.'
                : 'Try another state, or clear the search.'}
            </p>
            {rows.length === 0 ? (
              <Link
                href="/channels/sample"
                className="mt-4 inline-block text-[12px] font-medium text-indigo hover:underline"
              >
                View a sample report
              </Link>
            ) : (
              <Link href="/channels" className="mt-4 inline-block text-[12px] font-medium text-indigo hover:underline">
                Show all reports
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <caption className="sr-only">Saved channel reports</caption>
              <thead className="border-b border-line bg-paper text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Channel</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Analysis</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Collected</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Evidence</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ row, state }) => (
                  <tr key={row.channelId} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-4 py-3">
                      <Link
                        href={`/channels/${row.channelId}`}
                        className="font-medium text-ink hover:text-indigo"
                      >
                        {/* The channel id, never a repeated generic sentence: a
                            column of identical "pending report" rows tells a
                            reader nothing about which channel is which. */}
                        {row.title ?? row.handle ?? row.channelId}
                      </Link>
                      {row.title && row.handle ? (
                        <p className="mt-0.5 text-[11px] text-ink-muted">{row.handle}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </td>
                    <td className="tnum px-4 py-3 text-[12px] text-ink-muted">
                      {row.fetchedAt
                        ? new Date(row.fetchedAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Not yet'}
                    </td>
                    <td className="tnum px-4 py-3 text-[12px] text-ink-muted">
                      {row.comments === null
                        ? '—'
                        : `${row.comments.toLocaleString('en-US')} comments read`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/channels/${row.channelId}`}
                        className="text-[12px] font-medium text-indigo hover:underline"
                      >
                        Open report
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}

/**
 * The workspace's saved channels, joined to their analysis and their jobs.
 *
 * Three reads rather than an embed: `channel_analyses` is keyed by a text
 * channel id and has no foreign key to `workspace_channels` — deliberately,
 * because the analysis belongs to no customer — so PostgREST cannot infer a
 * relationship that does not exist.
 */
async function loadLibrary(organizationId: string): Promise<LibraryRow[]> {
  if (!isSupabaseConfigured()) return [];
  const db = createSessionClient();

  const { data: refs } = await db
    .from('workspace_channels')
    .select('channel_id,created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  const ids = (refs ?? []).map((row) => row.channel_id as string);
  if (ids.length === 0) return [];

  const [{ data: analyses }, { data: jobRows }] = await Promise.all([
    db
      .from('channel_analyses')
      .select('channel_id,title,handle,data_fetched_at,comments_analyzed')
      .in('channel_id', ids)
      .returns<Record<string, unknown>[]>(),
    db
      .from('analysis_jobs')
      .select(
        'id,kind,status,attempts,max_attempts,queued_at,started_at,finished_at,comments_scanned,' +
          'findings,last_error,progress_done,progress_total,progress_stage,channel_id',
      )
      .in('channel_id', ids)
      .order('queued_at', { ascending: false })
      .returns<Record<string, unknown>[]>(),
  ]);

  const byId = new Map((analyses ?? []).map((row) => [row.channel_id as string, row]));
  const jobs = new Map<string, AnalysisJob[]>();
  for (const row of jobRows ?? []) {
    const channelId = row.channel_id as string;
    const list = jobs.get(channelId) ?? [];
    // Newest of each kind only: an older failed attempt beside a running retry
    // would report both, and the row would say it had failed while it runs.
    if (list.some((item) => item.kind === row.kind)) continue;
    list.push({
      id: row.id as string,
      kind: row.kind as AnalysisJob['kind'],
      status: row.status as AnalysisJob['status'],
      attempts: Number(row.attempts ?? 0),
      maxAttempts: Number(row.max_attempts ?? 0),
      queuedAt: row.queued_at as string,
      startedAt: (row.started_at as string) ?? null,
      finishedAt: (row.finished_at as string) ?? null,
      commentsScanned: row.comments_scanned === null ? null : Number(row.comments_scanned),
      findings: row.findings === null ? null : Number(row.findings),
      lastError: (row.last_error as string) ?? null,
      progressDone: row.progress_done === null ? null : Number(row.progress_done),
      progressTotal: row.progress_total === null ? null : Number(row.progress_total),
      progressStage: (row.progress_stage as AnalysisJob['progressStage']) ?? null,
    });
    jobs.set(channelId, list);
  }

  return ids.map((channelId) => {
    const report = byId.get(channelId);
    const comments = report?.comments_analyzed;
    return {
      channelId,
      title: (report?.title as string) ?? null,
      handle: (report?.handle as string) ?? null,
      fetchedAt: (report?.data_fetched_at as string) ?? null,
      comments: comments === null || comments === undefined ? null : Number(comments),
      jobs: jobs.get(channelId) ?? [],
    };
  });
}
