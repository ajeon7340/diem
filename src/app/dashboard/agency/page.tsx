import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SiteHeader } from '@/components/shell/SiteHeader';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { getViewer } from '@/lib/access/viewer';
import { getOrgAccessRequests, getOrgBriefs, getOrgOffers } from '@/lib/data/organization';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { currency, shortDate, daysUntil } from '@/lib/format';

export const metadata: Metadata = { title: 'Your workspace' };
export const dynamic = 'force-dynamic';

/**
 * What this workspace has asked for, and what it can read.
 *
 * An agency could send access requests, offers and briefs and then had nowhere
 * to see any of them — not a status, not which creators had said yes, not
 * which links still worked. They signed up, landed on the directory, and that
 * was the whole product from their side.
 *
 * ACCESS FIRST. "Which creators can I actually open right now" is the question
 * a buyer opens this page with, and it is the one the directory cannot answer:
 * the directory lists who opted in to being found, not who granted THIS
 * workspace a link.
 */
export default async function AgencyDashboard() {
  if (!isSupabaseConfigured()) redirect('/directory');

  const viewer = await getViewer();
  if (!viewer.userId) redirect('/signin');
  if (!viewer.organization) redirect(viewer.creatorId ? '/dashboard/studio' : '/join');

  const orgId = viewer.organization.id;
  const [requests, offers, briefs] = await Promise.all([
    getOrgAccessRequests(orgId),
    getOrgOffers(orgId),
    getOrgBriefs(orgId),
  ]);

  const live = requests.filter((r) => r.isLive);
  const pending = requests.filter((r) => r.status === 'pending');
  const settled = requests.filter((r) => !r.isLive && r.status !== 'pending');

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="relative flex-1">
        <div className="relative mx-auto w-full max-w-shell px-5 py-8 sm:px-8">
          <p className="rail">Track B · {viewer.organization.name}</p>
          <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-ink">
            Your workspace
          </h1>

          <div className="mt-6 space-y-4">
            <Panel
              title="Creators you can open"
              meta={
                viewer.isProAgency
                  ? `${live.length} by grant · plus the directory`
                  : `${live.length} by grant`
              }
            >
              {/* Two routes in, and they are not the same thing. A Pro plan
                  opens every creator who opted into the directory; a grant
                  opens ONE creator who said yes to this workspace by name and
                  can revoke it. Listing them together would make a plan look
                  like a relationship. */}
              {viewer.isProAgency ? (
                <p className="border-b border-line bg-indigo/5 px-5 py-2.5 text-[12px] text-ink-muted">
                  Pro Agency opens every creator listed in the{' '}
                  <Link href="/directory" className="text-indigo underline-offset-4 hover:underline">
                    directory
                  </Link>{' '}
                  without asking. The grants below are separate and survive a plan change.
                </p>
              ) : null}

              {live.length === 0 ? (
                <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
                  No creator has granted this workspace a link yet.
                  {viewer.isProAgency
                    ? ' Pro opens the directory regardless — a grant is only needed for creators who stayed unlisted.'
                    : ' Open any creator profile and request access; it is free and there is no limit.'}
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {live.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {r.creatorName ?? r.creatorHandle ?? 'A creator'}
                        </span>
                        <span className="tnum block text-[11px] text-ink-muted">
                          @{r.creatorHandle} · granted {shortDate(r.respondedAt ?? r.createdAt)}
                          {r.expiresAt ? ` · ${daysUntil(r.expiresAt)}d left` : ' · no expiry'}
                        </span>
                      </span>
                      <Link
                        href={`/@${r.creatorHandle}?token=${r.accessToken}`}
                        className="shrink-0 rounded-md border border-line px-2.5 py-1 text-[12px] text-ink transition-colors hover:bg-paper"
                      >
                        Open report
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Requests you have sent" meta={`${pending.length} awaiting a reply`}>
              {requests.length === 0 ? (
                <p className="px-5 py-8 text-center text-[12px] text-ink-muted">
                  Nothing sent yet.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {[...pending, ...settled].map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">
                          @{r.creatorHandle ?? '—'}{' '}
                          <span className="text-ink-muted">· {r.campaignObjective}</span>
                        </span>
                        <span className="tnum block text-[11px] text-ink-faint">
                          sent {shortDate(r.createdAt)}
                          {r.proposedBudget !== null
                            ? ` · ${currency(r.proposedBudget, r.budgetCurrency)}`
                            : ''}
                        </span>
                      </span>
                      {/* An expired grant is not a refusal, and a refusal is
                          not an expiry. Collapsing them would tell a buyer to
                          give up on someone who said yes. */}
                      <Badge
                        tone={
                          r.status === 'approved'
                            ? 'slate'
                            : r.status === 'rejected'
                              ? 'rose'
                              : 'amber'
                        }
                      >
                        {r.status === 'approved' ? 'approved · link expired' : r.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Offers you have sent" meta={`${offers.length}`}>
                {offers.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[12px] text-ink-muted">
                    Nothing sent yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {offers.map((o) => (
                      <li key={o.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink">
                            @{o.creatorHandle ?? '—'}
                          </span>
                          <span className="tnum block truncate text-[11px] text-ink-faint">
                            {o.amount !== null ? currency(o.amount, o.currency) : 'no fee stated'} ·{' '}
                            {shortDate(o.createdAt)}
                          </span>
                        </span>
                        <Badge tone={o.status === 'accepted' ? 'emerald' : o.status === 'declined' ? 'rose' : 'amber'}>
                          {o.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Briefs you have sent" meta={`${briefs.length}`}>
                {briefs.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[12px] text-ink-muted">
                    Nothing sent yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {briefs.map((b) => (
                      <li key={b.id} className="px-5 py-3">
                        <span className="block truncate text-[13px] text-ink">{b.title}</span>
                        <span className="tnum mt-0.5 block text-[11px] text-ink-faint">
                          {b.recipients} sent · {b.accepted} accepted · {b.declined} declined ·{' '}
                          {b.pending} waiting
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
