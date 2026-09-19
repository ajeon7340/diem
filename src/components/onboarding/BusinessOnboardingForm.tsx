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
function Chip({ name, value, label }: { name: string; value: string; label: string }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" name={name} value={value} className="peer sr-only" />
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

/** One radio styled as a selectable row — for a single answer, not a set. */
function RadioRow({
  name,
  value,
  label,
  hint,
}: {
  name: string;
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface px-3 py-2.5',
        'transition-colors hover:border-line-strong',
        'has-[:checked]:border-indigo has-[:checked]:bg-indigo/5',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-indigo"
      />
      <span>
        <span className="block text-[13px] text-ink">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-faint">{hint}</span>
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
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="organizationName" className="rail block">
          Company or agency
        </label>
        <input
          id="organizationName"
          name="organizationName"
          required
          minLength={2}
          maxLength={120}
          autoComplete="organization"
          placeholder="Northbeam Media"
          className={cn(FIELD, 'mt-2')}
        />
        <p
          className={cn(
            'mt-1.5 text-[11px]',
            state.fieldErrors?.organizationName ? 'text-rose' : 'text-ink-faint',
          )}
        >
          {state.fieldErrors?.organizationName ??
            'You become the owner. Teammates can be added later.'}
        </p>
      </div>

      {/* Everything below is optional, and the section says why it is worth
          answering rather than marking it "optional" and moving on. These
          fields are the only thing that lets a fit read be about THIS buyer —
          without them the paragraph can only describe the creator, which the
          tiles already do. A required field here would just be answered
          carelessly to get past the form, and a careless answer is worse than
          an empty one because nothing downstream can tell them apart. */}
      <div className="rounded-panel border border-line bg-paper px-4 py-4">
        <p className="text-[13px] font-medium text-ink">What do you buy for?</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          Optional, and it changes what you get. Every creator report carries a written read of
          whether that creator fits <em>you</em> — it can only do that if it knows what you sell.
          Leave it blank and the reads stay general and say so.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="sells" className="rail block">
              What you sell
            </label>
            <textarea
              id="sells"
              name="sells"
              rows={2}
              maxLength={400}
              placeholder="A refillable cleanser and serum line, £28–£44, direct and through Boots"
              className={cn(AREA, 'mt-2')}
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
              placeholder="Women 22–35 in the UK and Ireland, skincare-literate, price-conscious"
              className={cn(AREA, 'mt-2')}
            />
          </div>

          <div>
            <span className="rail block">Categories you buy in</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CAMPAIGN_CATEGORIES.map((key) => (
                <Chip key={key} name="categories" value={key} label={CATEGORY_LABEL[key]} />
              ))}
            </div>
          </div>

          <div>
            <span className="rail block">What you are buying for</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CAMPAIGN_OBJECTIVES.map((key) => (
                <Chip key={key} name="objectives" value={key} label={OBJECTIVE_LABEL[key]} />
              ))}
            </div>
            {/* The objective changes the read more than any figure does: a
                creator who is wrong for conversion can be exactly right for a
                launch, and a report that does not know which is guessing. */}
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              This one matters most. A creator who is wrong for conversion is often right for a
              launch, and a read that does not know which you want has to hedge.
            </p>
          </div>
        </div>
      </div>

      {/* A separate panel from "what do you buy for" on purpose — this is
          about the comment section an ad sits beside, not about the campaign.
          Every report already measures this per creator; nothing captured it
          on the buyer's side to compare against. */}
      <div className="rounded-panel border border-line bg-paper px-4 py-4">
        <p className="text-[13px] font-medium text-ink">What atmosphere are you looking for?</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          Optional. Every report reads the comment section&apos;s climate — warm, ordinary, rough
          or hostile — and this lets the written pitch address it directly instead of leaving you
          to work it out from the figures.
        </p>

        <div className="mt-3 space-y-2">
          <RadioRow
            name="climatePreference"
            value="warm"
            label="Warm matters to me"
            hint="A positive-skewing, low-friction comment section is important for this placement."
          />
          <RadioRow
            name="climatePreference"
            value="edgy_ok"
            label="A rougher section doesn't rule a creator out"
            hint="A combative or blunt audience is fine — don't screen creators out on tone alone."
          />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Leave both unselected for a general read. This never filters or excludes a creator by
          itself.
        </p>
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
