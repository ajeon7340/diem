'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import {
  submitOffer,
  type OfferFormState,
} from '@/app/actions/offer';
import { CURRENCIES } from '@/lib/schemas';
import { budgetRange } from '@/lib/format';
import { cn } from '@/lib/cn';
import { INITIAL_OFFER_STATE } from '@/app/actions/state';

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
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
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
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? 'Sending offer…' : 'Send formal offer'}
    </Button>
  );
}

export function OfferForm({
  handle,
  displayName,
  token,
  budgetMin,
  budgetMax,
  budgetNegotiable,
  defaultCompany,
  defaultEmail,
}: {
  handle: string;
  displayName: string;
  token: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetNegotiable: boolean;
  defaultCompany: string;
  defaultEmail: string;
}) {
  const [state, formAction] = useFormState<OfferFormState, FormData>(
    submitOffer,
    INITIAL_OFFER_STATE,
  );

  if (state.status === 'success') {
    return (
      <div className="rounded-panel border border-emerald/30 bg-emerald-wash px-6 py-12 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald" aria-hidden />
        <p className="mt-3 text-[14px] font-medium text-ink">Offer sent to {displayName}</p>
        <p className="mx-auto mt-1.5 max-w-[46ch] text-[12px] leading-relaxed text-ink-muted">
          It&apos;s in their dashboard now. They can accept or decline, and you&apos;ll hear back at
          the email on the offer.
        </p>
        <Link href={`/@${handle}`} className="mt-5 inline-block">
          <Button variant="secondary">Back to the report</Button>
        </Link>
      </div>
    );
  }

  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="handle" value={handle} />
      {token ? <input type="hidden" name="token" value={token} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Company" htmlFor="companyName" error={errors.companyName}>
          <input
            id="companyName"
            name="companyName"
            required
            maxLength={120}
            defaultValue={defaultCompany}
            className={FIELD}
          />
        </Field>
        <Field label="Your name" htmlFor="senderName" error={errors.senderName}>
          <input id="senderName" name="senderName" required maxLength={120} className={FIELD} />
        </Field>
      </div>

      <Field
        label="Your email"
        htmlFor="senderEmail"
        error={errors.senderEmail}
        hint="Where the creator's answer goes."
      >
        <input
          id="senderEmail"
          name="senderEmail"
          type="email"
          required
          maxLength={254}
          defaultValue={defaultEmail}
          className={FIELD}
        />
      </Field>

      <Field
        label="Deliverables"
        htmlFor="deliverables"
        error={errors.deliverables}
        hint="Be specific. This is the part that gets negotiated."
      >
        <textarea
          id="deliverables"
          name="deliverables"
          required
          rows={4}
          maxLength={2000}
          placeholder={'2 long-form integrations (60–90s each)\n1 short-form cutdown\nPinned comment with link for 14 days'}
          className={cn(FIELD, 'h-auto resize-none py-2.5 leading-relaxed')}
        />
      </Field>

      <Field
        label="Fee"
        htmlFor="amount"
        error={errors.amount}
        hint={
          budgetRange({ budgetMin, budgetMax, budgetNegotiable })
            ? `${displayName} asks ${budgetRange({ budgetMin, budgetMax, budgetNegotiable })}.`
            : 'Total for the deliverables above.'
        }
      >
        <div className="flex gap-2">
          <input
            id="amount"
            name="amount"
            required
            inputMode="numeric"
            placeholder={budgetMin ? String(budgetMin) : '25000'}
            className={cn(FIELD, 'tnum flex-1')}
          />
          <select
            name="currency"
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

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Flight start" htmlFor="flightStart" error={errors.flightStart}>
          <input id="flightStart" name="flightStart" type="date" className={cn(FIELD, 'tnum')} />
        </Field>
        <Field label="Flight end" htmlFor="flightEnd" error={errors.flightEnd}>
          <input id="flightEnd" name="flightEnd" type="date" className={cn(FIELD, 'tnum')} />
        </Field>
        <Field
          label="Exclusivity"
          htmlFor="exclusivityDays"
          error={errors.exclusivityDays}
          hint="Days, in category."
        >
          <input
            id="exclusivityDays"
            name="exclusivityDays"
            inputMode="numeric"
            placeholder="60"
            className={cn(FIELD, 'tnum')}
          />
        </Field>
      </div>

      <Field label="Usage rights" htmlFor="usageRights" error={errors.usageRights}>
        <input
          id="usageRights"
          name="usageRights"
          maxLength={500}
          placeholder="Paid social, 90 days, brand channels only"
          className={FIELD}
        />
      </Field>

      <Field label="Notes" htmlFor="notes" error={errors.notes}>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={2000}
          placeholder="Anything you're flexible on."
          className={cn(FIELD, 'h-auto resize-none py-2.5 leading-relaxed')}
        />
      </Field>

      {state.status === 'error' && state.message ? (
        <p className="rounded-md border border-rose/30 bg-rose-wash px-3 py-2 text-[12px] text-rose">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <SubmitButton />
        <Link href={`/@${handle}`} className="text-[12px] text-ink-muted underline-offset-4 hover:underline">
          Back to the report
        </Link>
      </div>
    </form>
  );
}
