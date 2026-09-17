'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { BarChart3, Check, Eye, ShieldOff } from 'lucide-react';

import type { DemographicsGrant } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { reviewDemographicsGrant } from '@/app/actions/demographics';
import { INITIAL_GRANT_REVIEW, type GrantReviewState } from '@/lib/report/policy-state';
import { relativeDays, shortDate } from '@/lib/format';

function Decide({ label, decision, variant }: {
  label: string;
  decision: 'approve' | 'revoke';
  variant: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="decision" value={decision} size="sm" variant={variant} disabled={pending}>
      {decision === 'approve' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <ShieldOff className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </Button>
  );
}

/**
 * One organisation asking for, or already holding, the creator's demographics.
 *
 * Deliberately not folded into the access-request inbox. That request grants
 * the whole report on a link that expires; this grants one block to one named
 * company and stands until revoked. A creator who cannot tell those apart
 * cannot make either decision properly, and this is the one where the answer
 * is about their own audience data rather than a campaign.
 */
export function GrantCard({ grant }: { grant: DemographicsGrant }) {
  const [state, formAction] = useFormState<GrantReviewState, FormData>(
    reviewDemographicsGrant,
    INITIAL_GRANT_REVIEW,
  );

  const company = grant.organizationName ?? 'An organisation';

  return (
    <form action={formAction} className="px-5 py-4">
      <input type="hidden" name="grantId" value={grant.id} />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="flex items-center gap-2 text-[13px] text-ink">
          <BarChart3 className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
          {company}
        </span>
        <Badge
          tone={
            grant.status === 'approved' ? 'emerald' : grant.status === 'pending' ? 'amber' : 'slate'
          }
        >
          {grant.status}
        </Badge>
      </div>

      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
        Wants to see your audience age, gender and geography. Everything else in your report is
        already visible to them on their plan — this block is not, because releasing your own
        platform analytics to a named company is your decision, not ours.
      </p>

      <p className="tnum mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
        <span>asked {relativeDays(grant.requestedAt)}</span>
        {grant.decidedAt ? <span>decided {shortDate(grant.decidedAt)}</span> : null}
        {/* An approval that never reports back is indistinguishable from one
            nobody used. The count is what makes revoking an informed choice. */}
        {grant.status === 'approved' ? (
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" aria-hidden />
            viewed {grant.viewCount}×
            {grant.lastViewedAt ? `, last ${relativeDays(grant.lastViewedAt)}` : ''}
          </span>
        ) : null}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {grant.status === 'approved' ? (
          <Decide label="Revoke access" decision="revoke" variant="secondary" />
        ) : (
          <>
            <Decide label="Approve" decision="approve" variant="primary" />
            {grant.status === 'pending' ? (
              <Decide label="Decline" decision="revoke" variant="secondary" />
            ) : null}
          </>
        )}
        {state.status !== 'idle' && state.message ? (
          <span className={`text-[12px] ${state.status === 'error' ? 'text-rose' : 'text-emerald'}`}>
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
