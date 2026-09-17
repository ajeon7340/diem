import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';

import { resolveProfileAccess } from '@/lib/access/gatekeeper';
import { firstParam, parseAccessToken } from '@/lib/schemas';
import { getViewer } from '@/lib/access/viewer';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { OfferForm } from '@/components/offers/OfferForm';
import { Button } from '@/components/ui/Button';
import { compactNumber, budgetRange } from '@/lib/format';

export const metadata: Metadata = { title: 'Send a formal offer' };
export const dynamic = 'force-dynamic';

/**
 * The offer composer — the end of the funnel, and previously a 404 that every
 * "Send formal offer" button pointed at.
 *
 * Entitlement is resolved by the same gatekeeper that unlocks the report, so
 * the rule is exactly one sentence: if you can read the report, you can make an
 * offer on it. The RPC behind the form re-checks it server-side regardless.
 */
export default async function NewOfferPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const handle = firstParam(searchParams.handle);
  if (!handle) notFound();

  const token = parseAccessToken(searchParams.token);
  const view = await resolveProfileAccess(handle, searchParams.token);
  if (!view) notFound();

  const { creator, access } = view;
  const viewer = await getViewer();

  if (access.mode === 'locked') {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface">
            <Lock className="h-4 w-4 text-ink-faint" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">
            You need access before you can make an offer
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            {access.reason === 'expired'
              ? 'Your access link has expired. Request access again and the creator can issue a fresh one.'
              : 'Send a proposal first. Offers open once the creator approves your access.'}
          </p>
          <Link href={`/@${creator.handle}`} className="mt-6">
            <Button>Go to {creator.displayName}&apos;s profile</Button>
          </Link>
        </main>
      </div>
    );
  }

  // A creator has no business making an offer on their own profile.
  if (access.mode === 'owner') {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-ink">This is your profile</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            Offers arrive in your dashboard from brands. You can&apos;t send one to yourself.
          </p>
          <Link href="/dashboard/offers" className="mt-6">
            <Button>Go to my offers</Button>
          </Link>
        </main>
      </div>
    );
  }

  const via =
    access.mode === 'token'
      ? `access granted to ${access.grant.companyName}`
      : `${access.organization.name} · Pro Agency`;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="relative flex-1">
        <div className="grid-rule pointer-events-none absolute inset-x-0 top-0 h-40" aria-hidden />

        <div className="relative mx-auto w-full max-w-[720px] px-5 py-12 sm:px-8">
          <p className="rail">Formal offer</p>
          <h1 className="mt-2.5 text-[24px] font-semibold tracking-tight text-ink">
            Make an offer to {creator.displayName}
          </h1>
          <p className="tnum mt-2 text-[12px] text-ink-faint">
            @{creator.handle} · {compactNumber(creator.totalFollowers)} audience
            {budgetRange(creator) ? ` · ${budgetRange(creator)}` : ''}
            {' · '}
            {via}
          </p>

          <div className="mt-8 rounded-panel border border-line bg-surface p-6">
            <OfferForm
              handle={creator.handle}
              displayName={creator.displayName}
              token={token}
              budgetMin={creator.budgetMin}
              budgetMax={creator.budgetMax}
              budgetNegotiable={creator.budgetNegotiable}
              defaultCompany={
                access.mode === 'token' ? access.grant.companyName : access.organization.name
              }
              defaultEmail={viewer.userId ? '' : ''}
            />
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-ink-faint">
            Sending an offer shares these terms with {creator.displayName}. It is a proposal, not a
            contract — nothing is binding until both sides agree outside adfit.
          </p>
        </div>
      </main>
    </div>
  );
}
