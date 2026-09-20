'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';

import { saveBrand } from '@/app/actions/brand';
import { INITIAL_BRAND } from '@/app/actions/state';
import { TokenSelect } from '@/components/ui/TokenSelect';
import { COUNTRIES, LANGUAGES } from '@/lib/locale/vocabulary';
import { CAMPAIGN_CATEGORIES } from '@/types';
import type { Brand } from '@/lib/data/brands';

/**
 * One brand form, used by onboarding and by Settings.
 *
 * THE SAME FIELDS IN THE SAME ORDER IN BOTH PLACES. Somebody editing a value
 * here should recognise the form they filled in during setup; a settings page
 * that asks differently invites the suspicion that it means something else.
 *
 * TWO REQUIRED FIELDS. The name, and one plain line about what the brand sells
 * — the field everything downstream actually uses. Everything else sharpens a
 * search and none of it stands between somebody and their first report.
 *
 * THE WEBSITE IS A REFERENCE AND NOTHING READS IT. No fetch, no scrape, no
 * enrichment. The label says so, because a field that looks like it might go
 * and find things is a promise the product does not keep.
 */

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="primary-action disabled:opacity-60">
      {pending ? pendingLabel : label}
    </button>
  );
}

const field = 'min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-faint';
const label = 'block text-[12px] font-medium text-ink';
const hint = 'mt-0.5 text-[11px] leading-relaxed text-ink-muted';

export function BrandForm({
  brand,
  customerType,
  workspaceName,
  channel,
  mode = 'settings',
  makeDefault = false,
  onSaved,
}: {
  brand?: Brand | null;
  customerType: 'brand' | 'agency' | null;
  /** Prefills the name for a brand workspace. Editable — it is a guess. */
  workspaceName?: string;
  channel?: string;
  mode?: 'onboarding' | 'settings';
  makeDefault?: boolean;
  onSaved?: () => void;
}) {
  const [state, action] = useFormState(saveBrand, INITIAL_BRAND);
  const router = useRouter();

  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
    else if (state.status === 'success' && onSaved) onSaved();
  }, [state, router, onSaved]);

  // For a brand workspace the company and the brand are usually the same name,
  // so it is offered. For an agency they are never the same, and prefilling the
  // agency's own name as the client's would be the exact confusion this whole
  // model exists to remove.
  const defaultName = brand?.name ?? (customerType === 'agency' ? '' : (workspaceName ?? ''));

  return (
    <form action={action} className="space-y-4">
      {brand ? <input type="hidden" name="brandId" value={brand.id} /> : null}
      {mode === 'onboarding' ? <input type="hidden" name="continueTo" value="onboarding" /> : null}
      {channel ? <input type="hidden" name="channel" value={channel} /> : null}
      {makeDefault ? <input type="hidden" name="makeDefault" value="on" /> : null}

      <div>
        <label className={label} htmlFor="brand-name">
          Brand name <span className="font-normal text-ink-faint">· required</span>
        </label>
        <input
          id="brand-name"
          name="name"
          required
          maxLength={120}
          defaultValue={defaultName}
          placeholder={customerType === 'agency' ? 'Your client’s brand' : 'Your brand'}
          className={`${field} mt-1.5`}
        />
        {state.fieldErrors?.name ? (
          <p role="alert" className="mt-1 text-[12px] text-rose">
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div>
        <label className={label} htmlFor="brand-sells">
          What it sells <span className="font-normal text-ink-faint">· required</span>
        </label>
        <textarea
          id="brand-sells"
          name="sells"
          required
          rows={2}
          maxLength={600}
          defaultValue={brand?.sells ?? ''}
          placeholder="A £180 hand grinder for people making espresso at home."
          className="mt-1.5 w-full rounded-lg border border-line bg-surface p-2.5 text-[13px] text-ink placeholder:text-ink-faint"
        />
        <p className={hint}>One plain line. This is what discovery starts from.</p>
        {state.fieldErrors?.sells ? (
          <p role="alert" className="mt-1 text-[12px] text-rose">
            {state.fieldErrors.sells}
          </p>
        ) : null}
      </div>

      <TokenSelect
        name="categories"
        label="Product categories"
        hint="Optional. Type your own if none fit."
        options={[...CAMPAIGN_CATEGORIES].map((c) => ({ code: c, name: humanise(c) }))}
        selected={brand?.categories ?? []}
        placeholder="Search or type a category"
        allowCustom
        max={10}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TokenSelect
          name="markets"
          label="Default markets"
          hint="Optional. A search preference, not who watches."
          options={COUNTRIES}
          selected={brand?.markets ?? []}
          placeholder="Search countries"
        />
        <TokenSelect
          name="contentLanguages"
          label="Creator content languages"
          hint="Optional. The language of the content, not the audience."
          options={LANGUAGES}
          selected={brand?.contentLanguages ?? []}
          placeholder="Search languages"
        />
      </div>

      <div>
        <label className={label} htmlFor="brand-needs">
          Customer needs or use cases
        </label>
        <input
          id="brand-needs"
          name="customerNeeds"
          maxLength={600}
          defaultValue={brand?.customerNeeds ?? ''}
          placeholder="Wants café-level espresso without a benchtop grinder"
          className={`${field} mt-1.5`}
        />
        <p className={hint}>Optional. Used to suggest search topics.</p>
      </div>

      <div>
        <label className={label} htmlFor="brand-website">
          Website
        </label>
        <input
          id="brand-website"
          name="website"
          type="url"
          inputMode="url"
          maxLength={400}
          defaultValue={brand?.website ?? ''}
          placeholder="northbeam.com"
          className={`${field} mt-1.5`}
        />
        <p className={hint}>Optional, and saved as a reference only — adfit does not read it.</p>
      </div>

      {state.message ? (
        <p
          role="status"
          className={`rounded-lg px-2.5 py-2 text-[12px] ${
            state.status === 'error' ? 'border border-rose/30 bg-rose-wash text-ink' : 'border border-line bg-paper text-ink-muted'
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <Submit
        label={mode === 'onboarding' ? 'Save and continue' : brand ? 'Save changes' : 'Add brand'}
        pendingLabel="Saving…"
      />
    </form>
  );
}

function humanise(value: string): string {
  return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
