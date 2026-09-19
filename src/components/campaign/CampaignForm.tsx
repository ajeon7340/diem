'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/Button';
import { createCampaign } from '@/app/actions/campaign';
import { INITIAL_CAMPAIGN_STATE } from '@/app/actions/state';
import { cn } from '@/lib/cn';

const FIELD = cn(
  'h-10 w-full rounded-md border border-line bg-surface px-3 text-[13px] text-ink',
  'placeholder:text-ink-faint outline-none transition-colors',
  'focus:border-indigo focus:ring-2 focus:ring-indigo/20',
);

const AREA = cn(
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink',
  'placeholder:text-ink-faint outline-none transition-colors resize-none',
  'focus:border-indigo focus:ring-2 focus:ring-indigo/20',
);

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? 'Creating…' : 'Create campaign'}
    </Button>
  );
}

function Err({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] text-rose">{message}</p>;
}

/**
 * The brief.
 *
 * ONLY THE NAME IS REQUIRED, and every other field says what it changes rather
 * than asking to be filled in. The brief is not paperwork — it is the standard
 * every candidate is then compared against — so a field answered carelessly to
 * get past the form is worse than one left empty: an empty field reads as "not
 * stated" downstream and a careless one reads as a fact.
 *
 * Two columns and no section prose, for the reason the business onboarding
 * form was rebuilt: a form that runs past the fold gets scrolled rather than
 * read.
 */
export function CampaignForm() {
  const [state, formAction] = useFormState(createCampaign, INITIAL_CAMPAIGN_STATE);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="name" className="rail block">
          Campaign name
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={120}
          placeholder="Spring cleanser launch"
          className={cn(FIELD, 'mt-1.5')}
        />
        <Err message={state.fieldErrors?.name} />
      </div>

      <div className="rounded-panel border border-line bg-paper px-4 py-3.5">
        <p className="text-[13px] font-medium text-ink">
          What every candidate is measured against{' '}
          <span className="font-normal text-ink-muted">
            Optional — each one you answer makes the read about this campaign rather than general.
          </span>
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="brand" className="rail block">
              Brand
            </label>
            <input
              id="brand"
              name="brand"
              maxLength={120}
              placeholder="Northbeam"
              className={cn(FIELD, 'mt-1.5')}
            />
          </div>
          <div>
            <label htmlFor="objective" className="rail block">
              Objective
            </label>
            <input
              id="objective"
              name="objective"
              maxLength={200}
              placeholder="Launch awareness in the UK"
              className={cn(FIELD, 'mt-1.5')}
            />
          </div>
          <div>
            <label htmlFor="product" className="rail block">
              What you sell
            </label>
            <textarea
              id="product"
              name="product"
              rows={2}
              maxLength={2000}
              placeholder="A refillable cleanser and serum line, £28–£44"
              className={cn(AREA, 'mt-1.5')}
            />
          </div>
          <div>
            <label htmlFor="audience" className="rail block">
              Who you sell it to
            </label>
            <textarea
              id="audience"
              name="audience"
              rows={2}
              maxLength={2000}
              placeholder="Skincare-literate buyers in the UK"
              className={cn(AREA, 'mt-1.5')}
            />
          </div>
          <div>
            {/* Free text and not a fixed list: what a given brand must not sit
                beside is specific to that brand, and a checklist would quietly
                narrow it to whatever we thought of. */}
            <label htmlFor="avoidTopics" className="rail block">
              Do not place beside
            </label>
            <textarea
              id="avoidTopics"
              name="avoidTopics"
              rows={2}
              maxLength={2000}
              placeholder="Gambling, crypto promotion, political commentary"
              className={cn(AREA, 'mt-1.5')}
            />
          </div>
          <div>
            <label htmlFor="budgetTotal" className="rail block">
              Total budget{' '}
              <span className="normal-case tracking-normal text-ink-faint">— USD, optional</span>
            </label>
            <input
              id="budgetTotal"
              name="budgetTotal"
              inputMode="numeric"
              placeholder="40,000"
              className={cn(FIELD, 'mt-1.5')}
            />
            <Err message={state.fieldErrors?.budgetTotal} />
          </div>
        </div>
      </div>

      {state.status === 'error' && state.message ? (
        <p className="rounded-md border border-rose/30 bg-rose-wash px-3 py-2 text-[12px] text-rose">
          {state.message}
        </p>
      ) : null}

      <Submit />

      <p className="text-center text-[11px] leading-relaxed text-ink-faint">
        No creator has to sign up, approve you, or connect an account. Every figure on the next
        page comes from public YouTube data, and says so.
      </p>
    </form>
  );
}
