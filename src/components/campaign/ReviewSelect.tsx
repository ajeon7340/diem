'use client';

import { useId } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateCandidateReview } from '@/app/actions/campaign';
import { INITIAL_CANDIDATE_STATE } from '@/app/actions/state';
import { REVIEW_LABELS } from '@/lib/campaign/presentation';
import type { Candidate } from '@/lib/data/campaigns';

function Select({
  status,
  name,
}: {
  status: Candidate['status'];
  name: string;
}) {
  const { pending } = useFormStatus();
  return (
    <div>
      <select
        name="status"
        value={status}
        aria-label={`Decision for ${name}`}
        disabled={pending}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className={`min-h-10 w-full rounded-lg border px-2.5 text-xs font-medium disabled:opacity-60 ${status === 'shortlisted' ? 'border-indigo/20 bg-indigo-wash text-indigo' : 'border-line bg-surface text-ink-muted'}`}
      >
        {Object.entries(REVIEW_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {pending && (
        <span role="status" className="mt-1 block text-[11px] text-ink-muted">
          Saving…
        </span>
      )}
    </div>
  );
}

export function ReviewSelect({
  candidate,
  campaignId,
  name,
}: {
  candidate: Candidate;
  campaignId: string;
  name: string;
}) {
  const [state, action] = useFormState(
    updateCandidateReview,
    INITIAL_CANDIDATE_STATE,
  );
  const errorId = useId();
  return (
    <form
      action={action}
      aria-describedby={state.status === 'error' ? errorId : undefined}
    >
      <input type="hidden" name="candidateId" value={candidate.id} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <Select status={candidate.status} name={name} />
      {state.status === 'error' && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 max-w-48 text-xs text-rose"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
