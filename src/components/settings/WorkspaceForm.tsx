'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { updateWorkspace } from '@/app/actions/onboarding';
import { INITIAL_WORKSPACE_STATE } from '@/app/actions/state';
import { Button } from '@/components/ui/Button';
import type { CustomerType } from '@/types';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  );
}

/**
 * The two answers signup asks for, editable.
 *
 * Same two fields, same wording and same order as onboarding — someone
 * changing a value here should recognise the form they filled in, and a
 * settings page that asks differently invites the suspicion that it means
 * something different.
 *
 * Prefilled from the stored values rather than left blank: a blank field in a
 * settings form reads as "unset" and invites a rewrite of something that was
 * already right.
 */
export function WorkspaceForm({
  name,
  customerType,
}: {
  name: string;
  customerType: CustomerType | null;
}) {
  const [state, action] = useFormState(updateWorkspace, INITIAL_WORKSPACE_STATE);

  return (
    <form action={action} className="mt-4 space-y-5">
      <label className="block text-sm" htmlFor="organizationName">
        Company or team name
        <input
          id="organizationName"
          name="organizationName"
          defaultValue={name}
          autoComplete="organization"
          required
          minLength={2}
          maxLength={120}
          aria-describedby={state.fieldErrors?.organizationName ? 'workspace-name-error' : undefined}
          className="mt-2 w-full rounded-md border p-3"
        />
      </label>
      {state.fieldErrors?.organizationName ? (
        <p id="workspace-name-error" role="alert" className="text-sm text-rose">
          {state.fieldErrors.organizationName}
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-sm">
          We are a
          {customerType === null ? (
            // Every workspace created before this was asked for stores null,
            // and null reads as "brand" everywhere downstream. Saying so is
            // the difference between a default and an answer nobody gave.
            <span className="ml-2 font-normal text-ink-muted">
              — not set yet, so campaigns currently read as a single brand
            </span>
          ) : null}
        </legend>
        <div className="flex gap-6">
          {(['brand', 'agency'] as const).map((type) => (
            <label key={type} className="flex gap-2 text-sm capitalize">
              <input
                type="radio"
                name="customerType"
                value={type}
                defaultChecked={customerType === type}
                required
              />
              {type}
            </label>
          ))}
        </div>
      </fieldset>
      {state.fieldErrors?.customerType ? (
        <p role="alert" className="text-sm text-rose">
          {state.fieldErrors.customerType}
        </p>
      ) : null}

      <p className="text-sm text-ink-muted">
        An agency runs campaigns for several clients from one workspace — each campaign names the
        brand it is for. A brand workspace runs its own campaigns.
      </p>

      {state.message ? (
        <p role="status" className={`text-sm ${state.status === 'error' ? 'text-rose' : ''}`}>
          {state.message}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
