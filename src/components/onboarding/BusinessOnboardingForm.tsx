'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';

import { createOrganization } from '@/app/actions/onboarding';
import { INITIAL_ONBOARDING_STATE } from '@/app/actions/state';

/**
 * Step 1: the workspace, and only the workspace.
 *
 * Two questions. Nothing about billing, company size, job title, phone number,
 * budget or team invitations — every one of those is a field somebody answers
 * carelessly to get past the form, and a careless answer downstream is worse
 * than an empty one because nothing can tell them apart.
 */
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="primary-action disabled:opacity-60">
      {pending ? 'Creating workspace…' : 'Continue'}
    </button>
  );
}

export function BusinessOnboardingForm({ channel = '' }: { channel?: string }) {
  const [state, action] = useFormState(createOrganization, INITIAL_ONBOARDING_STATE);
  const router = useRouter();
  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="channel" value={channel} />

      <div>
        <label className="block text-[12px] font-medium text-ink" htmlFor="organizationName">
          Company or team name <span className="font-normal text-ink-faint">· required</span>
        </label>
        <input
          id="organizationName"
          className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px]"
          name="organizationName"
          autoComplete="organization"
          required
          minLength={2}
          maxLength={120}
        />
        {state.fieldErrors?.organizationName ? (
          <p role="alert" className="mt-1 text-[12px] text-rose">
            {state.fieldErrors.organizationName}
          </p>
        ) : null}
      </div>

      <fieldset>
        <legend className="text-[12px] font-medium text-ink">
          Account type <span className="font-normal text-ink-faint">· required</span>
        </legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {(
            [
              ['brand', 'Brand', 'You run campaigns for your own products.'],
              ['agency', 'Agency', 'You run campaigns for client brands.'],
            ] as const
          ).map(([value, title, blurb]) => (
            <label
              key={value}
              className="flex cursor-pointer gap-2.5 rounded-lg border border-line bg-surface p-2.5 text-[13px] hover:border-line-strong has-[:checked]:border-indigo/40 has-[:checked]:bg-indigo-wash"
            >
              <input type="radio" name="customerType" value={value} required className="mt-0.5 h-4 w-4" />
              <span>
                <span className="block font-medium text-ink">{title}</span>
                <span className="block text-[11px] leading-relaxed text-ink-muted">{blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.message && state.status === 'error' ? (
        <p role="alert" className="text-[12px] text-rose">
          {state.message}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
