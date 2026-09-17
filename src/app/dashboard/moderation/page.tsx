import type { Metadata } from 'next';
import Link from 'next/link';

import { getViewer } from '@/lib/access/viewer';
import { getModerationQueue } from '@/lib/data/requests';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { ModerationQueue } from '@/components/dashboard/ModerationQueue';
import { Panel } from '@/components/ui/Panel';
import { orderQueue, queueSummary, quotaPlan } from '@/lib/report/moderation';

export const metadata: Metadata = { title: 'Comment moderation' };
export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const viewer = await getViewer();

  if (!viewer.creatorId) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="rail">Creator only</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">
            Sign in as a creator
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            This queue is yours alone. No agency sees it on any plan.
          </p>
          <Link href="/" className="mt-6 text-[13px] text-indigo underline-offset-4 hover:underline">
            Back to adfit
          </Link>
        </main>
      </div>
    );
  }

  const items = orderQueue(await getModerationQueue(viewer.creatorId));
  const summary = queueSummary(items);
  const plan = quotaPlan(items);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div className="relative mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
          <p className="rail">Your channel</p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">
            Comment moderation
          </h1>
          <DashboardNav active="/dashboard/moderation" />

          {/* The framing matters. This list exists because brands price a
              placement partly on what sits next to it — but none of it is a
              mark against the creator, and the page should not read like an
              accusation when almost no row was written by them.

              It used to distinguish on TARGET — abuse aimed at the creator
              rather than written by them — which is the wrong axis and only
              looked right on the channels measured first.
              On a call-out channel the target is usually a third party, not the
              creator — @가재맨, 180 flagged, nearly all aimed at the person the
              videos are about. What decides whether a row counts against the
              creator is who WROTE it, never who it was aimed at. */}
          <p className="mt-6 max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
            Comments on your videos that an advertiser would count as a risk beside their ad —
            whoever they are aimed at, including people your videos are about. Almost none of it
            was written by you, and only what you wrote yourself counts against your report. The
            rest is here because you can remove it, not because it reflects on you. Hiding happens
            on YouTube through your own connection.
          </p>

          <div className="mt-8 space-y-4">
            <Panel
              title="Flagged"
              meta={`${summary.pending} to review · ${summary.hidden} hidden · ${summary.kept} kept`}
            >
              {/* Stated up front rather than discovered on the 201st click.
                  The ceiling belongs to the creator's own Google project. */}
              {plan.overBy > 0 ? (
                <p className="border-b border-line px-5 py-2.5 text-[11px] leading-relaxed text-amber">
                  {plan.actionable} comments can be hidden, but YouTube allows roughly{' '}
                  {plan.limit} a day — each hide spends {plan.units / Math.max(1, plan.actionable)}{' '}
                  units of a 10,000/day budget. About {plan.overBy} will have to wait for tomorrow,
                  or you can request a quota increase from Google.
                </p>
              ) : null}
              <ModerationQueue items={items} />
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
}
