'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { requestDemographics } from '@/app/actions/demographics';
import {
  INITIAL_DEMOGRAPHICS_REQUEST,
  type DemographicsRequestState,
} from '@/lib/report/policy-state';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Sending…' : 'Request demographics'}
    </Button>
  );
}

/**
 * The one click that separates a Pro plan from Authorized Data.
 *
 * This is not a paywall and must not read as one — the agency has already paid
 * and already has the rest of the report. It is a consent step the creator
 * owns, because YouTube's policies let their authorised analytics reach an
 * organisation only when that creator approved that organisation by name.
 * Saying so is worth the two lines: an unexplained lock on a paid tier reads
 * as an upsell, and this is the opposite of one.
 */
export function DemographicsRequest({
  creatorId,
  handle,
}: {
  creatorId: string;
  handle: string;
}) {
  const [state, formAction] = useFormState<DemographicsRequestState, FormData>(
    requestDemographics,
    INITIAL_DEMOGRAPHICS_REQUEST,
  );

  if (state.status === 'success') {
    return (
      <p className="flex items-center justify-center gap-2 px-5 py-8 text-center text-[12px] leading-relaxed text-emerald">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="px-5 py-7 text-center">
      <input type="hidden" name="creatorId" value={creatorId} />
      <input type="hidden" name="handle" value={handle} />
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface">
        <ShieldCheck className="h-4 w-4 text-ink-faint" aria-hidden />
      </span>
      <p className="mt-3 text-[13px] font-medium text-ink">This creator&apos;s approval required</p>
      <p className="mx-auto mt-1 max-w-[46ch] text-[12px] leading-relaxed text-ink-muted">
        Age, gender and geography come from the creator&apos;s own platform analytics. Their
        authorisation lets us read it; releasing it to your organisation is a separate decision
        that only they can make. One click on their side.
      </p>
      <div className="mt-4">
        <SubmitButton />
      </div>
      {state.status === 'error' && state.message ? (
        <p className="mt-3 text-[12px] text-rose">{state.message}</p>
      ) : null}
    </form>
  );
}
