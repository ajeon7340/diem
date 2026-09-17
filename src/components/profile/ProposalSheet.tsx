'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { CheckCircle2, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import {
  submitProposal,
  type ProposalFormState,
} from '@/app/actions/request-access';
import { CURRENCIES } from '@/lib/schemas';
import { currency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { INITIAL_PROPOSAL_STATE } from '@/app/actions/state';

const FIELD = cn(
  'h-10 w-full rounded-md border border-line bg-surface px-3 text-[13px] text-ink',
  'placeholder:text-ink-faint outline-none transition-colors',
  'focus:border-indigo focus:ring-2 focus:ring-indigo/20',
);

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="rail block">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="mt-1.5 text-[11px] text-rose">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[11px] text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? 'Sending proposal…' : 'Send proposal'}
    </Button>
  );
}

/**
 * Slide-over on desktop, bottom sheet on mobile. Distraction-free: no imagery,
 * no marketing copy inside the form itself, six fields and a send button.
 */
export function ProposalSheet({
  handle,
  displayName,
  minimumBudget,
  isOpen,
  onClose,
}: {
  handle: string;
  displayName: string;
  minimumBudget: number | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState<ProposalFormState, FormData>(
    submitProposal,
    INITIAL_PROPOSAL_STATE,
  );
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    firstFieldRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const errors = state.fieldErrors ?? {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposal-title"
    >
      <div className="animate-scrim absolute inset-0 bg-ink/25" onClick={onClose} aria-hidden />

      <div
        className={cn(
          'animate-sheet relative flex max-h-[92vh] w-full flex-col overflow-y-auto bg-surface',
          'rounded-t-panel border border-line sm:h-full sm:max-h-none sm:max-w-[440px] sm:rounded-none sm:border-y-0 sm:border-r-0',
        )}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface px-6 py-5">
          <div>
            <h2 id="proposal-title" className="text-[15px] font-semibold tracking-tight text-ink">
              Propose a collaboration
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              Free, and no account needed. {displayName} reads every proposal and decides who sees
              the full report.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-paper hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        {state.status === 'success' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald" aria-hidden />
            <div>
              <p className="text-[14px] font-medium text-ink">Proposal sent</p>
              <p className="mx-auto mt-1.5 max-w-[40ch] text-[12px] leading-relaxed text-ink-muted">
                {state.message} If they approve, a time-limited link to the full report arrives at
                the email you gave.
              </p>
            </div>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <form action={formAction} className="space-y-5 px-6 py-6">
            <input type="hidden" name="handle" value={handle} />

            <Field label="Company" htmlFor="companyName" error={errors.companyName}>
              <input
                ref={firstFieldRef}
                id="companyName"
                name="companyName"
                required
                maxLength={120}
                autoComplete="organization"
                placeholder="Northbeam Media"
                className={FIELD}
              />
            </Field>

            <Field label="Your name" htmlFor="requesterName" error={errors.requesterName}>
              <input
                id="requesterName"
                name="requesterName"
                required
                maxLength={120}
                autoComplete="name"
                placeholder="Jordan Alvarez"
                className={FIELD}
              />
            </Field>

            <Field
              label="Work email"
              htmlFor="requesterEmail"
              error={errors.requesterEmail}
              hint="The approved access link is sent here."
            >
              <input
                id="requesterEmail"
                name="requesterEmail"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="jordan@northbeam.com"
                className={FIELD}
              />
            </Field>

            <Field
              label="Campaign objective"
              htmlFor="campaignObjective"
              error={errors.campaignObjective}
              hint="One line. What the campaign needs to achieve."
            >
              <input
                id="campaignObjective"
                name="campaignObjective"
                required
                maxLength={200}
                placeholder="Q4 headphone launch — drive pre-orders"
                className={FIELD}
              />
            </Field>

            <Field
              label="Proposed budget"
              htmlFor="proposedBudget"
              error={errors.proposedBudget}
              hint={
                minimumBudget
                  ? `${displayName} lists a ${currency(minimumBudget)} minimum.`
                  : 'Optional, but a figure gets a faster answer.'
              }
            >
              <div className="flex gap-2">
                <input
                  id="proposedBudget"
                  name="proposedBudget"
                  inputMode="numeric"
                  placeholder={minimumBudget ? String(minimumBudget) : '25000'}
                  className={cn(FIELD, 'tnum flex-1')}
                />
                <select
                  name="budgetCurrency"
                  aria-label="Currency"
                  defaultValue="USD"
                  className={cn(FIELD, 'tnum w-[92px] cursor-pointer')}
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </Field>

            <Field label="Pitch note" htmlFor="pitchNote" error={errors.pitchNote}>
              <textarea
                id="pitchNote"
                name="pitchNote"
                rows={5}
                maxLength={2000}
                placeholder="Deliverables, flight dates, and what you need from the report."
                className={cn(FIELD, 'h-auto resize-none py-2.5 leading-relaxed')}
              />
            </Field>

            {state.status === 'error' && state.message ? (
              <p className="rounded-md border border-rose/30 bg-rose-wash px-3 py-2 text-[12px] text-rose">
                {state.message}
              </p>
            ) : null}

            <SubmitButton />

            <p className="text-center text-[11px] leading-relaxed text-ink-faint">
              Sending shares your company and contact details with {displayName}. Access is
              time-limited and revocable.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
