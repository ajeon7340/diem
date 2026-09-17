'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/Button';
import { HandleField } from '@/components/auth/HandleField';
import {
  createCreatorProfile,
  type OnboardingState,
} from '@/app/actions/onboarding';
import { cn } from '@/lib/cn';
import { INITIAL_ONBOARDING_STATE } from '@/app/actions/state';

const FIELD = cn(
  'h-11 w-full rounded-md border border-line bg-surface px-3 text-[13px] text-ink',
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
      {pending ? 'Creating profile…' : 'Publish my media kit'}
    </Button>
  );
}

export function CreatorOnboardingForm() {
  const router = useRouter();
  const [state, formAction] = useFormState<OnboardingState, FormData>(
    createCreatorProfile,
    INITIAL_ONBOARDING_STATE,
  );

  useEffect(() => {
    if (state.status === 'success' && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <HandleField error={errors.handle} />

      <Field label="Display name" htmlFor="displayName" error={errors.displayName}>
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={80}
          placeholder="Marah Woods"
          className={FIELD}
        />
      </Field>

      <Field
        label="Niche"
        htmlFor="niche"
        error={errors.niche}
        hint="One phrase. Agencies filter the directory by this."
      >
        <input
          id="niche"
          name="niche"
          maxLength={60}
          placeholder="Consumer Tech & Workspace"
          className={FIELD}
        />
      </Field>

      {/* Placed above the bio, and before the budget, because it is the field
          that makes the product do anything. Without it the creator finishes
          signing up and Studio — the only page that works before an advertiser
          exists — is empty for them forever. */}
      <Field
        label="YouTube channel"
        htmlFor="youtubeHandle"
        error={errors.youtubeHandle}
        hint="Your @handle. We check it against YouTube now, and it unlocks your Studio analysis immediately — no advertiser needed."
      >
        <input
          id="youtubeHandle"
          name="youtubeHandle"
          maxLength={120}
          placeholder="@jooshica6178"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={FIELD}
        />
      </Field>

      <Field label="Bio" htmlFor="bio" error={errors.bio}>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          placeholder="What you make, and who watches."
          className={cn(FIELD, 'h-auto resize-none py-2.5 leading-relaxed')}
        />
      </Field>

      {/* A range, not a floor. "Minimum budget" asked a creator for the
          smallest figure they would accept and then published it, which anchors
          every negotiation at their own worst number — and tells a brand only
          what they will not do, never what a placement usually costs.

          The range is asked for first and the opt-out second, on purpose: a
          directory where everyone is "negotiable" is one nobody can plan
          against, and the creators who lose most from that are the ones a
          brand has never heard of. */}
      <Field
        label="What you'd like for a placement"
        htmlFor="budgetMin"
        error={errors.budgetMin ?? errors.budgetMax}
        hint="A range is enough. Shown on the proposal form so brands self-select — it never blocks a request, and you can still negotiate."
      >
        <div className="flex items-center gap-2">
          <input
            id="budgetMin"
            name="budgetMin"
            inputMode="numeric"
            placeholder="15,000"
            aria-label="Lower end"
            className={cn(FIELD, 'tnum')}
          />
          <span className="shrink-0 text-[13px] text-ink-faint">to</span>
          <input
            id="budgetMax"
            name="budgetMax"
            inputMode="numeric"
            placeholder="25,000"
            aria-label="Upper end"
            className={cn(FIELD, 'tnum')}
          />
        </div>
      </Field>

      <label className="flex cursor-pointer items-start gap-3 rounded-panel border border-line bg-paper px-4 py-3.5">
        <input
          type="checkbox"
          name="budgetNegotiable"
          className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-indigo"
        />
        <span>
          <span className="block text-[13px] font-medium text-ink">
            Rather not say — open to offers
          </span>
          {/* Said plainly rather than sold as a strategy. Withholding is a
              real choice and sometimes the right one; it also means brands
              filtering on budget will not see you, and a creator deserves to
              know that before they tick it rather than after. */}
          <span className="mt-1 block text-[12px] leading-relaxed text-ink-muted">
            Fine to choose, and worth knowing what it costs: brands filtering by budget will not
            see you, and the first message becomes a negotiation instead of a brief. A rough range
            usually gets better offers than none.
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-panel border border-line bg-paper px-4 py-3.5">
        <input
          type="checkbox"
          name="isDirectoryVisible"
          className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-indigo"
        />
        <span>
          <span className="block text-[13px] font-medium text-ink">
            List me in the agency directory
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">
            Pro Agency subscribers can find you and read your full report without asking first.
            Leave this off and your profile stays reachable by link only — every brand has to
            request access one by one.
          </span>
        </span>
      </label>

      {state.status === 'error' && state.message ? (
        <p className="rounded-md border border-rose/30 bg-rose-wash px-3 py-2 text-[12px] text-rose">
          {state.message}
        </p>
      ) : null}

      <SubmitButton />

      <p className="text-center text-[11px] leading-relaxed text-ink-faint">
        Your profile publishes immediately. The verified badge and the AI report appear after you
        connect YouTube or Instagram.
      </p>
    </form>
  );
}
