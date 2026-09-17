'use client';

import Link from 'next/link';
import { FileDown, Inbox, Send } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { RequestAccessButton } from './RequestAccessButton';
import { compactNumber } from '@/lib/format';

/**
 * The persistent conversion rail. Locked visitors get the proposal CTA; anyone
 * already holding the report gets the formal-offer CTA, which is the point of
 * the whole funnel.
 */
export function StickyActionBar({
  displayName,
  totalFollowers,
  unlocked,
  isOwner,
  contextLabel,
  offerHref,
  printHref,
}: {
  displayName: string;
  totalFollowers: number;
  unlocked: boolean;
  isOwner: boolean;
  contextLabel: string;
  offerHref: string | null;
  /** Set whenever the report is readable — printing needs the same access. */
  printHref: string | null;
}) {
  return (
    <div className="sticky bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-shell flex-wrap items-center gap-3 px-5 py-3.5 sm:px-8">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{displayName}</p>
          <p className="tnum text-[11px] text-ink-faint">
            {compactNumber(totalFollowers)} audience · {contextLabel}
          </p>
        </div>

        {unlocked && printHref ? (
          <Link href={printHref} target="_blank" rel="noopener">
            <Button size="lg" variant="secondary">
              <FileDown className="h-3.5 w-3.5" aria-hidden />
              Export PDF
            </Button>
          </Link>
        ) : null}

        {isOwner ? (
          // A creator on their own profile has nothing to request and nobody to
          // offer; send them to the inbox instead.
          <Link href="/dashboard/offers">
            <Button size="lg" variant="secondary">
              <Inbox className="h-3.5 w-3.5" aria-hidden />
              My offers
            </Button>
          </Link>
        ) : unlocked && offerHref ? (
          <Link href={offerHref}>
            <Button size="lg">
              <Send className="h-3.5 w-3.5" aria-hidden />
              Send formal offer
            </Button>
          </Link>
        ) : (
          <RequestAccessButton size="lg" label="Request full report & propose collaboration" />
        )}
      </div>
    </div>
  );
}
