import { previewChannel } from '@/app/actions/channel';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SiteHeader } from '@/components/shell/SiteHeader';
import { ChannelEntry } from '@/components/channel/ChannelEntry';
import { Badge } from '@/components/ui/Badge';
import { getViewer } from '@/lib/access/viewer';
import { freshData, nextStep, reportState } from '@/lib/channel/state';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import type { AnalysisJob } from '@/types';

export const dynamic = 'force-dynamic';

type LibraryReport = { channelId: string; title: string | null; handle: string | null; fetchedAt: string | null; comments: number | null; jobs: AnalysisJob[] };

function toneFor(state: string): 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' {
  if (state === 'Completed') return 'emerald';
  if (state === 'Queued' || state === 'Running') return 'indigo';
  if (state.includes('Failed')) return 'rose';
  if (state.includes('Partially') || state.includes('insufficient')) return 'amber';
  return 'slate';
}

export default async function Channels({ searchParams }: { searchParams: { channel?: string } }) {
  const viewer = await getViewer();
  if (!viewer.organization) redirect(nextStep({ signedIn: Boolean(viewer.userId), hasWorkspace: false }, searchParams.channel));
  if (viewer.organization.brandSetupState === 'pending') redirect(nextStep({ signedIn: true, hasWorkspace: true, brandSetup: 'pending' }, searchParams.channel));

  let reports: LibraryReport[] = [];
  if (isSupabaseConfigured()) {
    const db = createSessionClient();
    const { data: refs } = await db.from('workspace_channels').select('channel_id,created_at').eq('organization_id', viewer.organization.id).order('created_at', { ascending: false });
    const ids = (refs ?? []).map((row) => row.channel_id);
    if (ids.length) {
      const [{ data: analyses }, { data: jobRows }] = await Promise.all([
        db.from('channel_analyses').select('channel_id,title,handle,data_fetched_at,comments_analyzed').in('channel_id', ids),
        db.from('analysis_jobs').select('id,kind,status,attempts,max_attempts,queued_at,started_at,finished_at,comments_scanned,findings,last_error,progress_done,progress_total,progress_stage,channel_id').in('channel_id', ids).order('queued_at', { ascending: false }),
      ]);
      const byId = new Map((analyses ?? []).map((row) => [row.channel_id, row]));
      const jobs = new Map<string, AnalysisJob[]>();
      for (const row of jobRows ?? []) {
        const list = jobs.get(row.channel_id) ?? [];
        if (!list.some((item) => item.kind === row.kind)) list.push({ id: row.id, kind: row.kind, status: row.status, attempts: Number(row.attempts ?? 0), maxAttempts: Number(row.max_attempts ?? 0), queuedAt: row.queued_at, startedAt: row.started_at, finishedAt: row.finished_at, commentsScanned: row.comments_scanned === null ? null : Number(row.comments_scanned), findings: row.findings === null ? null : Number(row.findings), lastError: row.last_error, progressDone: row.progress_done === null ? null : Number(row.progress_done), progressTotal: row.progress_total === null ? null : Number(row.progress_total), progressStage: row.progress_stage } as AnalysisJob);
        jobs.set(row.channel_id, list);
      }
      reports = ids.map((channelId) => {
        const report = byId.get(channelId);
        return { channelId, title: report?.title ?? null, handle: report?.handle ?? null, fetchedAt: report?.data_fetched_at ?? null, comments: report?.comments_analyzed === null || report?.comments_analyzed === undefined ? null : Number(report.comments_analyzed), jobs: jobs.get(channelId) ?? [] };
      });
    }
  }

  const form = new FormData(); form.set('channel', searchParams.channel ?? '');
  const resolved = searchParams.channel ? await previewChannel({}, form) : {};
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="flex-1 bg-paper"><div className="workspace-page max-w-6xl">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="rail">Channel analysis</p><h1 className="page-title mt-3">Your channel reports</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">Public YouTube evidence you have collected. Start a fresh report when you need to evaluate a channel; use a saved report when adding candidates to a campaign.</p></div><a href="#new-analysis" className="primary-action">New channel analysis</a></div>
    <section className="surface-card mt-8 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="text-sm font-semibold text-ink">Report library</h2><p className="mt-1 text-xs text-ink-muted">{reports.length} saved {reports.length === 1 ? 'report' : 'reports'}</p></div><p className="text-xs text-ink-faint">Data is retained for 30 days</p></div>
      {reports.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-line bg-paper text-[11px] uppercase tracking-[0.08em] text-ink-faint"><tr><th className="px-5 py-3 font-medium">Channel</th><th className="px-5 py-3 font-medium">Analysis</th><th className="px-5 py-3 font-medium">Collected</th><th className="px-5 py-3 font-medium">Evidence</th><th className="px-5 py-3 font-medium"><span className="sr-only">Open</span></th></tr></thead><tbody>{reports.map((report) => { const current = freshData(report.fetchedAt); const state = report.fetchedAt && !current ? 'Refresh needed' : reportState(report.jobs, Boolean(report.title), report.comments ?? 0); return <tr key={report.channelId} className="border-b border-line last:border-0 hover:bg-paper"><td className="px-5 py-4"><Link href={`/channels/${report.channelId}`} className="font-medium text-ink hover:text-indigo">{report.title ?? 'Channel report pending'}</Link><p className="mt-1 text-xs text-ink-muted">{report.handle ?? report.channelId}</p></td><td className="px-5 py-4"><Badge tone={toneFor(state)}>{state}</Badge></td><td className="px-5 py-4 text-xs text-ink-muted">{report.fetchedAt ? new Date(report.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Waiting to collect'}</td><td className="px-5 py-4 text-xs text-ink-muted">{report.comments === null ? '—' : `${report.comments.toLocaleString('en-US')} comments read`}</td><td className="px-5 py-4 text-right"><Link href={`/channels/${report.channelId}`} className="text-xs font-medium text-indigo hover:underline">Open report →</Link></td></tr>; })}</tbody></table></div> : <div className="px-5 py-12 text-center"><p className="text-sm font-medium text-ink">No reports yet</p><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">Analyze a public YouTube channel to build a reusable report. No creator signup or account access is needed.</p><Link href="/channels/sample" className="mt-4 inline-block text-sm font-medium text-indigo hover:underline">View a sample report</Link></div>}
    </section>
    <section id="new-analysis" className="surface-card mt-8 scroll-mt-8 p-5 sm:p-6"><p className="rail">New analysis</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">Find a YouTube channel</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">Paste a channel URL or @handle. We will confirm the channel before collecting its public evidence.</p><div className="mt-5"><ChannelEntry initial={searchParams.channel} resolved={resolved} /></div></section>
  </div></main></div>;
}
