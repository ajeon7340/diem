import type { Metadata } from 'next';
import Link from 'next/link';

import { getViewer } from '@/lib/access/viewer';
import { getCreatorRequests, getDemographicsGrants } from '@/lib/data/requests';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { RequestCard } from '@/components/dashboard/RequestCard';
import { GrantCard } from '@/components/dashboard/GrantCard';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { Panel } from '@/components/ui/Panel';

export const metadata: Metadata = { title: 'Collaboration requests' };
export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
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
            Collaboration requests live in the creator dashboard. Connect a YouTube or Instagram
            account to publish a profile and start receiving proposals.
          </p>
          <Link href="/" className="mt-6 text-[13px] text-indigo underline-offset-4 hover:underline">
            Back to adfit
          </Link>
        </main>
      </div>
    );
  }

  const [requests, grants] = await Promise.all([
    getCreatorRequests(viewer.creatorId),
    getDemographicsGrants(viewer.creatorId),
  ]);
  const pendingGrants = grants.filter((grant) => grant.status === 'pending');
  const settledGrants = grants.filter((grant) => grant.status !== 'pending');
  const pending = requests.filter((request) => request.status === 'pending');
  const decided = requests.filter((request) => request.status !== 'pending');

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="relative flex-1">
        <div className="grid-rule pointer-events-none absolute inset-x-0 top-0 h-48" aria-hidden />

        <div className="relative mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
          <p className="rail">Track A · Inbound</p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">
            Collaboration requests
          </h1>
          <DashboardNav active="/dashboard/requests" />
          <p className="mt-6 max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
            Approving mints a fresh time-limited link for the requester. You can decline without
            giving a reason, an approved link expires on its own, and you can revoke one early at
            any point.
          </p>

          <div className="mt-8 space-y-4">
            <Panel title="Pending" meta={`${pending.length} awaiting review`}>
              {pending.length > 0 ? (
                <ul>
                  {pending.map((request) => (
                    <RequestCard key={request.id} request={request} />
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-12 text-center text-[13px] text-ink-muted">
                  Nothing awaiting review.
                </p>
              )}
            </Panel>

            {/* A different decision from the one above, and kept visually
                separate for that reason: a collaboration request grants the
                whole report on a link that expires, while this releases one
                block — your own platform analytics — to one named company,
                standing until you revoke it. */}
            {pendingGrants.length > 0 || settledGrants.length > 0 ? (
              <Panel
                title="Audience data requests"
                meta={
                  pendingGrants.length > 0
                    ? `${pendingGrants.length} awaiting you`
                    : `${settledGrants.length} decided`
                }
              >
                <ul className="divide-y divide-line">
                  {[...pendingGrants, ...settledGrants].map((grant) => (
                    <li key={grant.id}>
                      <GrantCard grant={grant} />
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            {decided.length > 0 ? (
              <Panel title="Decided" meta={`${decided.length} total`}>
                <ul>
                  {decided.map((request) => (
                    <RequestCard key={request.id} request={request} />
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
