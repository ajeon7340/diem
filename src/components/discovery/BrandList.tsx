'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { addBrand, confirmBrand, findCollaborations, removeBrand } from '@/app/actions/discovery';
import { INITIAL_DISCOVERY } from '@/app/actions/state';
import { Badge } from '@/components/ui/Badge';
import type { CompetitorBrandRow } from '@/lib/data/discovery';

/**
 * Step A on screen: the brands, and the act of confirming one.
 *
 * THE CONFIRM BUTTON IS THE FEATURE. A suggested name is a prompt, not a
 * finding, and it is shown as one — labelled with where it came from, sorted
 * below the brands the customer entered, and unable to reach a search until
 * somebody says it is real. The collaboration search refuses to run on a list
 * with nothing confirmed rather than running and returning an empty result that
 * reads like a finding about the market.
 */

const RELATION_LABEL: Record<CompetitorBrandRow['relation'], string> = {
  direct: 'Direct competitor',
  adjacent: 'Adjacent alternative',
  uncertain: 'Uncertain',
};

export function BrandList({
  searchId,
  brands,
  suggestionsUnavailable,
}: {
  searchId: string;
  brands: CompetitorBrandRow[];
  suggestionsUnavailable: string | null;
}) {
  const [added, add] = useFormState(addBrand, INITIAL_DISCOVERY);
  const [search, run] = useFormState(findCollaborations, INITIAL_DISCOVERY);

  const confirmed = brands.filter((b) => b.confirmed);
  const proposed = brands.filter((b) => !b.confirmed);

  return (
    <section className="surface-card p-5">
      <h2 className="text-[15px] font-semibold text-ink">Competing brands</h2>
      <p className="mt-1 max-w-[68ch] text-[12px] leading-relaxed text-ink-muted">
        Collaboration search runs against confirmed brands only. Suggestions are a starting point — adfit has no
        source that lists a product’s competitors, and it does not read competitors’ websites.
      </p>

      {suggestionsUnavailable ? (
        <p className="mt-3 rounded-xl border border-amber/30 bg-amber-wash px-3 py-2 text-[12px] leading-relaxed text-ink">
          {suggestionsUnavailable}
        </p>
      ) : null}

      <form action={add} className="mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="searchId" value={searchId} />
        <label className="flex-1">
          <span className="block text-[12px] font-medium text-ink">Add a brand</span>
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Comandante"
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[13px]"
          />
        </label>
        <label className="flex-1">
          <span className="block text-[12px] font-medium text-ink">Products (optional)</span>
          <input
            name="products"
            maxLength={400}
            placeholder="C40, X25"
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[13px]"
          />
        </label>
        <Submit>Add and confirm</Submit>
      </form>
      {added.message ? (
        <p role="status" className="mt-2 text-[12px] text-ink-muted">
          {added.message}
        </p>
      ) : null}

      <BrandGroup
        title={`Confirmed (${confirmed.length})`}
        empty="Nothing confirmed yet. A search cannot run without at least one."
        brands={confirmed}
        searchId={searchId}
      />
      {proposed.length > 0 ? (
        <BrandGroup
          title={`Suggested — not confirmed (${proposed.length})`}
          empty=""
          brands={proposed}
          searchId={searchId}
        />
      ) : null}

      <form action={run} className="mt-5 border-t border-line pt-4">
        <input type="hidden" name="searchId" value={searchId} />
        <Submit primary>Find public collaboration evidence</Submit>
        {search.message ? (
          <p role="status" className="mt-2 max-w-[68ch] text-[12px] leading-relaxed text-ink-muted">
            {search.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function BrandGroup({
  title,
  empty,
  brands,
  searchId,
}: {
  title: string;
  empty: string;
  brands: CompetitorBrandRow[];
  searchId: string;
}) {
  return (
    <div className="mt-5">
      <p className="rail">{title}</p>
      {brands.length === 0 ? (
        <p className="mt-2 text-[12px] text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
          {brands.map((brand) => (
            <li key={brand.id} className="flex flex-wrap items-start gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-ink">{brand.name}</span>
                  <Badge tone={brand.relation === 'direct' ? 'indigo' : 'slate'}>
                    {RELATION_LABEL[brand.relation]}
                  </Badge>
                  <Badge tone={brand.source === 'customer' ? 'emerald' : 'amber'}>
                    {brand.source === 'customer' ? 'You entered this' : 'Suggested — confirm before searching'}
                  </Badge>
                </div>
                {brand.rationale ? (
                  <p className="mt-1 max-w-[70ch] text-[12px] leading-relaxed text-ink-muted">{brand.rationale}</p>
                ) : null}
                {brand.products.length ? (
                  <p className="mt-1 text-[11px] text-ink-faint">Products: {brand.products.join(', ')}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <form action={confirmBrand}>
                  <input type="hidden" name="brandId" value={brand.id} />
                  <input type="hidden" name="searchId" value={searchId} />
                  <input type="hidden" name="confirmed" value={brand.confirmed ? 'false' : 'true'} />
                  <button
                    type="submit"
                    className="inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-[12px] font-medium text-ink hover:bg-paper"
                  >
                    {brand.confirmed ? 'Unconfirm' : 'Confirm'}
                  </button>
                </form>
                <form action={removeBrand}>
                  <input type="hidden" name="brandId" value={brand.id} />
                  <input type="hidden" name="searchId" value={searchId} />
                  <button
                    type="submit"
                    className="inline-flex min-h-9 items-center rounded-lg px-2 text-[12px] text-ink-muted hover:text-rose"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Submit({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        primary
          ? 'primary-action disabled:opacity-60'
          : 'inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-4 text-[13px] font-medium text-ink hover:bg-paper disabled:opacity-60'
      }
    >
      {pending ? 'Working…' : children}
    </button>
  );
}
