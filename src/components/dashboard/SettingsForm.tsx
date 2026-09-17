'use client';

import { useFormState, useFormStatus } from 'react-dom';

import type { Creator } from '@/types';
import { Button } from '@/components/ui/Button';
import {
  updateCreatorSettings,
  type SettingsState,
} from '@/app/actions/settings';
import { cn } from '@/lib/cn';
import { INITIAL_SETTINGS_STATE } from '@/app/actions/state';

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

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  );
}

export function SettingsForm({ creator }: { creator: Creator }) {
  const [state, formAction] = useFormState<SettingsState, FormData>(
    updateCreatorSettings,
    INITIAL_SETTINGS_STATE,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5 px-5 py-5">
      <Field
        label="Handle"
        htmlFor="handle"
        error={errors.handle}
        hint="Changing this changes your public URL — links you've already shared will stop resolving."
      >
        <div className="flex items-center rounded-md border border-line bg-surface pr-3 focus-within:border-indigo focus-within:ring-2 focus-within:ring-indigo/20">
          <span className="tnum pl-3 text-[13px] text-ink-faint">adfit.com/@</span>
          <input
            id="handle"
            name="handle"
            required
            minLength={3}
            maxLength={30}
            defaultValue={creator.handle}
            autoCapitalize="none"
            spellCheck={false}
            className="tnum h-10 flex-1 bg-transparent px-0.5 text-[13px] text-ink outline-none"
          />
        </div>
      </Field>

      <Field label="Display name" htmlFor="displayName" error={errors.displayName}>
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={80}
          defaultValue={creator.displayName}
          className={FIELD}
        />
      </Field>

      <Field label="Niche" htmlFor="niche" error={errors.niche}>
        <input
          id="niche"
          name="niche"
          maxLength={60}
          defaultValue={creator.niche ?? ''}
          className={FIELD}
        />
      </Field>

      <Field label="Bio" htmlFor="bio" error={errors.bio}>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          defaultValue={creator.bio ?? ''}
          className={cn(FIELD, 'h-auto resize-none py-2.5 leading-relaxed')}
        />
      </Field>

      <Field
        label="Minimum budget"
        htmlFor="minimumBudget"
        error={errors.minimumBudget}
        hint="Shown on the proposal form and used to estimate your CPM. Leave blank to hide both."
      >
        <input
          id="minimumBudget"
          name="minimumBudget"
          inputMode="numeric"
          defaultValue={creator.minimumBudget ?? ''}
          className={cn(FIELD, 'tnum')}
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-3 rounded-panel border border-line bg-paper px-4 py-3.5">
        <input
          type="checkbox"
          name="isDirectoryVisible"
          defaultChecked={creator.isDirectoryVisible}
          className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-indigo"
        />
        <span>
          <span className="block text-[13px] font-medium text-ink">
            List me in the agency directory
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">
            Pro Agency subscribers can find you and read your full report without asking first, and
            can include you in bulk briefs. Turn this off and your profile stays reachable by link
            only — every brand has to request access individually.
          </span>
        </span>
      </label>

      {state.status === 'error' && state.message ? (
        <p className="rounded-md border border-rose/30 bg-rose-wash px-3 py-2 text-[12px] text-rose">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <SaveButton />
        {state.status === 'success' ? (
          <span className="text-[12px] text-emerald">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}
