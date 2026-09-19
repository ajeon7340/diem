'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/Button';
import { addCandidate } from '@/app/actions/campaign';
import { INITIAL_CANDIDATE_STATE } from '@/app/actions/state';
import { cn } from '@/lib/cn';

const FIELD = cn(
  'h-10 w-full rounded-md border border-line bg-surface px-3 text-[13px] text-ink',
  'placeholder:text-ink-faint outline-none transition-colors',
  'focus:border-indigo focus:ring-2 focus:ring-indigo/20',
);

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="shrink-0">
      {/* The public pass runs inline and takes a few seconds, so the label says
          what is happening rather than spinning silently. */}
      {pending ? 'Reading the channel…' : 'Add candidate'}
    </Button>
  );
}

/**
 * Paste a channel, get a candidate.
 *
 * `useFormState` and not `useState`: invoking a server action from a client
 * component re-renders the server tree and discards client state, which is how
 * an earlier version of this pattern lost its error message the moment the
 * action returned.
 */
export function CandidateForm({ campaignId }: { campaignId: string }) {
  const [state, formAction] = useFormState(addCandidate, INITIAL_CANDIDATE_STATE);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Clear only on success. A rejected paste stays in the box: retyping a URL
    // you just typed, because we could not resolve it, is our failure charged
    // to the user.
    if (state.status === 'ok') form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={formAction} className="px-5 py-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <label htmlFor="channel" className="sr-only">
            YouTube channel URL or handle
          </label>
          <input
            id="channel"
            name="channel"
            required
            placeholder="youtube.com/@channel, or @handle"
            className={FIELD}
          />
        </div>
        <div className="sm:w-40">
          <label htmlFor="proposedFee" className="sr-only">
            Fee they quoted
          </label>
          <input id="proposedFee" name="proposedFee" inputMode="numeric" placeholder="Fee, if quoted" className={FIELD} />
        </div>
        <Submit />
      </div>

      {state.fieldErrors?.channel ? (
        <p className="mt-2 text-[12px] text-rose">{state.fieldErrors.channel}</p>
      ) : null}
      {state.status === 'error' && state.message ? (
        <p className="mt-2 text-[12px] text-rose">{state.message}</p>
      ) : null}
      {state.status === 'ok' && state.message ? (
        <p className="mt-2 text-[12px] text-emerald">{state.message}</p>
      ) : null}

      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        Any public channel. A fee is only used to work out a cost per thousand views — we never
        estimate one, because nothing public reveals what a creator charges.
      </p>
    </form>
  );
}
