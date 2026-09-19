'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/Button';
import {
  createOrganization,
  type OnboardingState,
} from '@/app/actions/onboarding';
import { cn } from '@/lib/cn';
import {
  CAMPAIGN_CATEGORIES,
  CAMPAIGN_OBJECTIVES,
  CATEGORY_LABEL,
  OBJECTIVE_LABEL,
} from '@/types';
import { INITIAL_ONBOARDING_STATE } from '@/app/actions/state';

const AREA = cn(
  'w-full rounded-md border border-line bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink',
  'placeholder:text-ink-faint outline-none transition-colors resize-none',
  'focus:border-indigo focus:ring-2 focus:ring-indigo/20',
);

/** A checkbox that reads as a chip, for the two fixed vocabularies. */
function Chip({
  name,
  value,
  label,
  // Radio for a single answer, checkbox for a set. Same chip either way: the
  // shape of the control is not what tells someone how many they may pick —
  // the group's label is — and two visual languages for one gesture cost a
  // row each in explanation.
  type = 'checkbox',
}: {
  name: string;
  value: string;
  label: string;
  type?: 'checkbox' | 'radio';
}) {
  return (
    <label className="cursor-pointer">
      <input type={type} name={name} value={value} className="peer sr-only" />
      <span
        className={cn(
          'inline-flex select-none rounded-full border border-line px-2.5 py-1 text-[12px]',
          'text-ink-muted transition-colors hover:border-line-strong',
          'peer-checked:border-indigo peer-checked:bg-indigo peer-checked:text-white',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-indigo/40',
        )}
      >
        {label}
      </span>
    </label>
  );
}


const FIELD = cn(
  'h-11 w-full rounded-md border border-line bg-surface px-3 text-[13px] text-ink',
  'placeholder:text-ink-faint outline-none transition-colors',
  'focus:border-indigo focus:ring-2 focus:ring-indigo/20',
);

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? 'Creating workspace…' : 'Create workspace'}
    </Button>
  );
}

export function BusinessOnboardingForm() {
  const router = useRouter();
  const [state, formAction] = useFormState<OnboardingState, FormData>(
    createOrganization,
    INITIAL_ONBOARDING_STATE,
  );

  useEffect(() => {
    if (state.status === 'success' && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3.5">
      <div>
        <label htmlFor="organizationName" className="rail block">
          Company or agency{' '}
          <span className="normal-case tracking-normal text-ink-faint">
            — you become the owner; teammates can be added later
          </span>
        </label>
        <input
          id="organizationName"
          name="organizationName"
          required
          minLength={2}
          maxLength={120}
          autoComplete="organization"
          placeholder="Northbeam Media"
          className={cn(FIELD, 'mt-1.5')}
        />
        {state.fieldErrors?.organizationName ? (
          <p className="mt-1 text-[11px] text-rose">{state.fieldErrors.organizationName}</p>
        ) : null}
      </div>

      {/* One panel, not three.
          Everything here is optional, and the reason it is worth answering is
          said once rather than re-explained above every group — three
          paragraphs of justification made this form 1,601px tall, which is
          twice a laptop screen, and a buyer scrolling past prose is not
          reading it.

          Still optional, for the original reason: these fields are the only
          thing that lets a fit read be about THIS buyer, and a required field
          here would be answered carelessly to get past the form. A careless
          answer is worse than an empty one, because nothing downstream can
          tell them apart. */}
      <div className="rounded-panel border border-line bg-paper px-4 py-3.5">
        <p className="text-[13px] font-medium text-ink">
          What do you buy for?{' '}
          <span className="font-normal text-ink-muted">
            Optional — it makes each fit read about you, not general.
          </span>
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="sells" className="rail block">
              What you sell
            </label>
            <textarea
              id="sells"
              name="sells"
              rows={2}
              maxLength={400}
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
              maxLength={400}
              placeholder="Women 22–35 in the UK, skincare-literate"
              className={cn(AREA, 'mt-1.5')}
            />
          </div>
        </div>

        <div className="mt-3">
          <span className="rail block">Categories you buy in</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CAMPAIGN_CATEGORIES.map((key) => (
              <Chip key={key} name="categories" value={key} label={CATEGORY_LABEL[key]} />
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            {/* The objective changes the read more than any figure does: a
                creator who is wrong for conversion can be exactly right for a
                launch, and a report that does not know which is guessing. Said
                in the label rather than in a paragraph under it. */}
            <span className="rail block">
              What you are buying for{' '}
              <span className="normal-case tracking-normal text-ink-faint">— matters most</span>
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CAMPAIGN_OBJECTIVES.map((key) => (
                <Chip key={key} name="objectives" value={key} label={OBJECTIVE_LABEL[key]} />
              ))}
            </div>
          </div>

          <div>
            {/* About the comment section an ad sits beside, not about the
                campaign. Every report already measures climate per creator;
                nothing captured the buyer's side to compare against. As chips
                rather than radio rows with hints — two labelled rows cost 90px
                on a form that has to fit a screen, and the hints repeated the
                labels. */}
            <span className="rail block">
              Comment atmosphere{' '}
              <span className="normal-case tracking-normal text-ink-faint">— never a filter</span>
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip name="climatePreference" value="warm" label="Warm matters" type="radio" />
              <Chip
                name="climatePreference"
                value="edgy_ok"
                label="Rougher is fine"
                type="radio"
              />
            </div>
          </div>
        </div>
      </div>

      {state.status === 'error' && state.message ? (
        <p className="rounded-md border border-rose/30 bg-rose-wash px-3 py-2 text-[12px] text-rose">
          {state.message}
        </p>
      ) : null}

      <SubmitButton />

      <p className="text-center text-[11px] leading-relaxed text-ink-faint">
        Workspaces start on the free plan: open any creator link and send unlimited 1:1 proposals.
        Directory search and bulk briefs need Pro Agency.
      </p>
    </form>
  );
}
