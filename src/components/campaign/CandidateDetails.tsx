'use client';

import { useEffect, useId, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateCandidateDetails } from '@/app/actions/campaign';
import { INITIAL_CANDIDATE_STATE } from '@/app/actions/state';

function Fields({
  fee,
  notes,
  currency,
}: {
  fee: number | null;
  notes: string | null;
  currency: string;
}) {
  const { pending } = useFormStatus();
  const id = useId();
  return (
    <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
      <div>
        <label
          htmlFor={`${id}-notes`}
          className="block text-xs font-medium text-ink-muted"
        >
          Internal notes
        </label>
        <textarea
          id={`${id}-notes`}
          name="notes"
          maxLength={4000}
          defaultValue={notes ?? ''}
          placeholder="What should your team know?"
          className="mt-2 w-full rounded-lg border border-line bg-surface p-3 text-sm font-normal text-ink"
          rows={3}
        />
      </div>
      <div>
        <label
          htmlFor={`${id}-fee`}
          className="block text-xs font-medium text-ink-muted"
        >
          Quoted fee ({currency}, optional)
        </label>
        <input
          id={`${id}-fee`}
          name="proposedFee"
          inputMode="decimal"
          defaultValue={fee ?? ''}
          placeholder="Not provided"
          className="mt-2 block w-full rounded-lg border border-line bg-surface p-3 text-sm font-normal text-ink"
        />
      </div>
      <button
        type="submit"
        className="rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-xs font-medium text-ink hover:bg-paper"
      >
        {pending ? 'Saving…' : 'Save private details'}
      </button>
    </fieldset>
  );
}

export function CandidateDetails({
  candidateId,
  campaignId,
  fee,
  notes,
  currency = 'USD',
}: {
  candidateId: string;
  campaignId: string;
  fee: number | null;
  notes: string | null;
  currency?: string;
}) {
  const [state, action] = useFormState(
    updateCandidateDetails,
    INITIAL_CANDIDATE_STATE,
  );
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (state.status === 'ok') setDirty(false);
  }, [state]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return (
    <form
      action={action}
      onChange={() => setDirty(true)}
      className="mt-4 space-y-3 print:hidden"
    >
      <input name="candidateId" value={candidateId} type="hidden" />
      <input name="campaignId" value={campaignId} type="hidden" />
      <Fields fee={fee} notes={notes} currency={currency} />
      {dirty ? (
        <p className="text-xs text-ink-muted">
          Unsaved changes · kept here while you review other candidates.
        </p>
      ) : (
        state.message && (
          <p role="status" className="text-xs text-ink-muted">
            {state.message}
          </p>
        )
      )}
      {dirty && state.status === 'error' && (
        <p role="alert" className="text-xs text-rose">
          {state.message}
        </p>
      )}
    </form>
  );
}
