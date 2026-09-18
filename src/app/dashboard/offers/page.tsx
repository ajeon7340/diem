import type { Metadata } from 'next';
import Link from 'next/link';

import { getViewer } from '@/lib/access/viewer';
import { getCreatorBriefs, getCreatorOffers, getCreatorHandle } from '@/lib/data/requests';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { OfferCard } from '@/components/dashboard/OfferCard';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { currency, relativeDays } from '@/lib/format';

export const metadata: Metadata = { title: 'Offers & briefs' };
export const dynamic = 'force-dynamic';

export default async function OffersPage() {
  const viewer = await getViewer();
  const ownHandle = viewer.creatorId ? await getCreatorHandle(viewer.creatorId) : null;

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
            Offers and campaign briefs live in the creator dashboard.
          </p>
          <Link href="/" className="mt-6 text-[13px] text-indigo underline-offset-4 hover:underline">
            Back to adfit
          </Link>
        </main>
      </div>
    );
  }

  const [offers, briefs] = await Promise.all([
    getCreatorOffers(viewer.creatorId),
    getCreatorBriefs(viewer.creatorId),
  ]);

  const open = offers.filter((offer) => offer.status === 'sent');
  const closed = offers.filter((offer) => offer.status !== 'sent');

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="relative flex-1">
        <div className="grid-rule pointer-events-none absolute inset-x-0 top-0 h-40" aria-hidden />

        <div className="relative mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
          <p className="rail">Dashboard</p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">
            Offers &amp; briefs
          </h1>
          <DashboardNav active="/dashboard/offers" handle={ownHandle} />

          <div className="mt-8 space-y-4">
            <Panel title="Open offers" meta={`${open.length} awaiting you`}>
              {open.length > 0 ? (
                <ul>
                  {open.map((offer) => (
                    <OfferCard key={offer.id} offer={offer} />
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-12 text-center text-[13px] text-ink-muted">
                  No open offers. Brands send these after you approve their access.
                </p>
              )}
            </Panel>

            <Panel title="Campaign briefs" meta={`${briefs.length} received`}>
              {briefs.length > 0 ? (
                <ul className="divide-y divide-line">
                  {briefs.map((brief) => (
                    <li key={brief.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <h3 className="text-[14px] font-medium text-ink">{brief.title}</h3>
                        <div className="flex items-center gap-2.5">
                          {brief.budgetMin !== null || brief.budgetMax !== null ? (
                            <span className="tnum text-[12px] text-ink">
                              {currency(brief.budgetMin ?? 0, brief.budgetCurrency)}–
                              {currency(brief.budgetMax ?? 0, brief.budgetCurrency)}
                            </span>
                          ) : null}
                          <Badge tone="indigo">{brief.status}</Badge>
                        </div>
                      </div>
                      <p className="tnum mt-1.5 text-[12px] text-ink-faint">
                        {brief.organizationName ?? 'An agency'} · {relativeDays(brief.sentAt)}
                      </p>
                      <p className="mt-2 text-[13px] text-ink">{brief.objective}</p>
                      {brief.briefNote ? (
                        <p className="mt-2 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-muted">
                          {brief.briefNote}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-12 text-center text-[13px] text-ink-muted">
                  No briefs yet. These arrive from Pro agencies when you&apos;re listed in the
                  directory.
                </p>
              )}
            </Panel>

            {closed.length > 0 ? (
              <Panel title="Closed" meta={`${closed.length} total`}>
                <ul>
                  {closed.map((offer) => (
                    <OfferCard key={offer.id} offer={offer} />
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
