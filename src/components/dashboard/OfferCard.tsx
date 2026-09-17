'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Check, X } from 'lucide-react';

import type { Offer } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  respondToOffer,
  type OfferDecisionState,
} from '@/app/actions/offer';
import { currency, relativeDays, shortDate } from '@/lib/format';
import { INITIAL_OFFER_DECISION } from '@/app/actions/state';

const STATUS_TONE = {
  sent: 'amber',
  accepted: 'emerald',
  declined: 'slate',
  withdrawn: 'slate',
} as const;

function DecisionButton({
  decision,
  children,
}: {
  decision: 'accepted' | 'declined';
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      name="decision"
      value={decision}
      size="sm"
      variant={decision === 'accepted' ? 'primary' : 'danger'}
      disabled={pending}
    >
      {children}
    </Button>
  );
}

export function OfferCard({ offer }: { offer: Offer }) {
  const [state, formAction] = useFormState<OfferDecisionState, FormData>(
    respondToOffer,
    INITIAL_OFFER_DECISION,
  );

  return (
    <li className="border-b border-line px-5 py-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-[14px] font-medium text-ink">{offer.companyName}</h3>
            <Badge tone={STATUS_TONE[offer.status]}>{offer.status}</Badge>
          </div>
          <p className="tnum mt-1.5 text-[12px] text-ink-faint">
            {offer.senderName} · {offer.senderEmail} · {relativeDays(offer.createdAt)}
          </p>
        </div>
        <div className="text-right">
          <div className="rail">Fee</div>
          <div className="tnum mt-1.5 text-[19px] font-medium leading-none text-ink">
            {currency(offer.amount, offer.currency)}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="rail">Deliverables</dt>
          <dd className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink">
            {offer.deliverables}
          </dd>
        </div>
        {offer.flightStart || offer.flightEnd ? (
          <div>
            <dt className="rail">Flight</dt>
            <dd className="tnum mt-1 text-[13px] text-ink-muted">
              {shortDate(offer.flightStart)} → {shortDate(offer.flightEnd)}
            </dd>
          </div>
        ) : null}
        {offer.exclusivityDays !== null ? (
          <div>
            <dt className="rail">Exclusivity</dt>
            <dd className="tnum mt-1 text-[13px] text-ink-muted">{offer.exclusivityDays} days</dd>
          </div>
        ) : null}
        {offer.usageRights ? (
          <div className="sm:col-span-2">
            <dt className="rail">Usage rights</dt>
            <dd className="mt-1 text-[13px] text-ink-muted">{offer.usageRights}</dd>
          </div>
        ) : null}
        {offer.notes ? (
          <div className="sm:col-span-2">
            <dt className="rail">Notes</dt>
            <dd className="mt-1 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-muted">
              {offer.notes}
            </dd>
          </div>
        ) : null}
      </dl>

      {offer.status === 'sent' ? (
        <form action={formAction} className="mt-4 flex flex-wrap items-center gap-2.5">
          <input type="hidden" name="offerId" value={offer.id} />
          <DecisionButton decision="accepted">
            <Check className="h-3.5 w-3.5" aria-hidden />
            Accept
          </DecisionButton>
          <DecisionButton decision="declined">
            <X className="h-3.5 w-3.5" aria-hidden />
            Decline
          </DecisionButton>
          {state.status === 'error' ? (
            <span className="text-[12px] text-rose">{state.message}</span>
          ) : null}
          {state.status === 'success' ? (
            <span className="text-[12px] text-emerald">{state.message}</span>
          ) : null}
          <span className="ml-auto text-[11px] text-ink-faint">
            Accepting signals intent — nothing is binding until you agree terms directly.
          </span>
        </form>
      ) : offer.respondedAt ? (
        <p className="tnum mt-4 text-[12px] text-ink-faint">
          You {offer.status} this on {shortDate(offer.respondedAt)}.
        </p>
      ) : null}
    </li>
  );
}
