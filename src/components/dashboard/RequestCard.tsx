'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Check, Clock, Eye, ShieldOff, X } from 'lucide-react';

import type { AccessRequest } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  reviewAccessRequest,
  type ReviewState,
} from '@/app/actions/review-request';
import {
  revokeAccess,
  type RevokeState,
} from '@/app/actions/settings';
import { currency, daysUntil, relativeDays, shortDate } from '@/lib/format';
import { INITIAL_REVIEW_STATE, INITIAL_REVOKE_STATE } from '@/app/actions/state';

function RevokeButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="danger" disabled={pending}>
      <ShieldOff className="h-3.5 w-3.5" aria-hidden />
      {pending ? 'Revoking…' : 'Revoke access'}
    </Button>
  );
}

function DecisionButton({
  decision,
  children,
}: {
  decision: 'approved' | 'rejected';
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      name="decision"
      value={decision}
      size="sm"
      variant={decision === 'approved' ? 'primary' : 'danger'}
      disabled={pending}
    >
      {children}
    </Button>
  );
}

/** One proposal in the creator's inbox, with its approve/decline controls. */
export function RequestCard({ request }: { request: AccessRequest }) {
  const [state, formAction] = useFormState<ReviewState, FormData>(
    reviewAccessRequest,
    INITIAL_REVIEW_STATE,
  );
  const [revokeState, revokeAction] = useFormState<RevokeState, FormData>(
    revokeAccess,
    INITIAL_REVOKE_STATE,
  );

  const live =
    request.status === 'approved' &&
    request.expiresAt !== null &&
    new Date(request.expiresAt).getTime() > Date.now();

  return (
    <li className="border-b border-line px-5 py-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-[14px] font-medium text-ink">{request.companyName}</h3>
            {request.status === 'pending' ? (
              <Badge tone="amber" icon={<Clock className="h-3 w-3" aria-hidden />}>
                Pending
              </Badge>
            ) : request.status === 'approved' ? (
              <Badge tone="emerald" icon={<Check className="h-3 w-3" aria-hidden />}>
                Approved
              </Badge>
            ) : (
              <Badge tone="slate">Declined</Badge>
            )}
            {request.organizationId ? <Badge tone="indigo">Agency</Badge> : null}
          </div>

          <p className="tnum mt-1.5 text-[12px] text-ink-faint">
            {request.requesterName} · {request.requesterEmail} · {relativeDays(request.createdAt)}
          </p>
        </div>

        <div className="text-right">
          <div className="rail">Proposed budget</div>
          <div className="tnum mt-1.5 text-[17px] font-medium leading-none text-ink">
            {request.proposedBudget === null
              ? '—'
              : currency(request.proposedBudget, request.budgetCurrency)}
          </div>
        </div>
      </div>

      <dl className="mt-4 space-y-2.5">
        <div>
          <dt className="rail">Campaign objective</dt>
          <dd className="mt-1 text-[13px] text-ink">{request.campaignObjective}</dd>
        </div>
        {request.pitchNote ? (
          <div>
            <dt className="rail">Pitch note</dt>
            <dd className="mt-1 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-muted">
              {request.pitchNote}
            </dd>
          </div>
        ) : null}
      </dl>

      {request.status === 'pending' ? (
        <form action={formAction} className="mt-4 flex flex-wrap items-center gap-2.5">
          <input type="hidden" name="requestId" value={request.id} />
          <DecisionButton decision="approved">
            <Check className="h-3.5 w-3.5" aria-hidden />
            Approve &amp; send link
          </DecisionButton>
          <DecisionButton decision="rejected">
            <X className="h-3.5 w-3.5" aria-hidden />
            Decline
          </DecisionButton>
          {state.status === 'error' ? (
            <span className="text-[12px] text-rose">{state.message}</span>
          ) : null}
          {state.status === 'success' ? (
            <span className="text-[12px] text-emerald">{state.message}</span>
          ) : null}
        </form>
      ) : request.status === 'approved' && request.expiresAt ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="tnum flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-faint">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {request.viewCount} {request.viewCount === 1 ? 'view' : 'views'}
            </span>
            <span>
              {live
                ? `Expires ${shortDate(request.expiresAt)} · ${daysUntil(request.expiresAt)}d left`
                : 'Access closed'}
            </span>
          </p>

          {live ? (
            <form action={revokeAction} className="ml-auto flex items-center gap-2.5">
              <input type="hidden" name="requestId" value={request.id} />
              <RevokeButton />
            </form>
          ) : null}

          {revokeState.status === 'success' ? (
            <span className="w-full text-[12px] text-emerald">{revokeState.message}</span>
          ) : revokeState.status === 'error' ? (
            <span className="w-full text-[12px] text-rose">{revokeState.message}</span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
