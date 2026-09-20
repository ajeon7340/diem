'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Pencil } from 'lucide-react';

import { countryName, languageName } from '@/lib/locale/vocabulary';
import type { SearchContext } from '@/lib/discovery/context';

/**
 * Which brand this search is for, which campaign, and what that means in
 * practice — at the top of the filter panel, above everything a search changes.
 *
 * SELECTING NAVIGATES rather than setting client state, for the same reason the
 * mode tabs do: "the search I ran for Northbeam" is a thing colleagues send
 * each other, and a selection that lives only in React cannot be sent.
 *
 * THE CAMPAIGN LIST IS FILTERED BY BRAND. A campaign belongs to exactly one
 * brand, and offering an agency every campaign in the workspace under whichever
 * client happens to be selected is how a brief ends up read against the wrong
 * product.
 *
 * The summary is three short lines, not the profile. Anyone who wants to change
 * it goes to Settings — deliberately a different surface, because editing a
 * saved profile while narrowing a search is exactly the conflation this model
 * exists to prevent.
 */
export function ContextBar({
  context,
  brands,
  campaigns,
}: {
  context: SearchContext;
  brands: { id: string; name: string }[];
  campaigns: { id: string; name: string; brandId: string | null }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    // A search already viewed has its own URL; changing the brand starts a new
    // one rather than pretending the stored result was run for this brand.
    router.push(`${pathname.startsWith('/discover/') ? '/discover' : pathname}?${query}`);
  }

  const forBrand = campaigns.filter((c) => !context.brand || c.brandId === context.brand.id);

  if (brands.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-paper px-2.5 py-2">
        <p className="text-[11px] leading-relaxed text-ink-muted">
          No brand saved yet. Searching works without one —{' '}
          <Link href="/settings?section=brands" className="text-indigo underline-offset-4 hover:underline">
            add brand context
          </Link>{' '}
          to stop retyping the product each time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-[11px] font-medium text-ink" htmlFor="context-brand">
          Brand
        </label>
        <select
          id="context-brand"
          value={context.brand?.id ?? ''}
          onChange={(event) => go({ brand: event.target.value || null, campaign: null })}
          className="mt-1 min-h-9 w-full rounded-lg border border-line bg-surface px-2 text-[12px] text-ink"
        >
          <option value="">No brand</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      {forBrand.length > 0 ? (
        <div>
          <label className="block text-[11px] font-medium text-ink" htmlFor="context-campaign">
            Campaign <span className="font-normal text-ink-faint">· optional</span>
          </label>
          <select
            id="context-campaign"
            value={context.campaign?.id ?? ''}
            onChange={(event) => go({ campaign: event.target.value || null })}
            className="mt-1 min-h-9 w-full rounded-lg border border-line bg-surface px-2 text-[12px] text-ink"
          >
            <option value="">No campaign</option>
            {forBrand.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {context.brand ? (
        <div className="rounded-lg border border-line bg-paper px-2.5 py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-ink-muted">
              {context.brand.sells ? (
                <span className="line-clamp-2 text-ink">{context.brand.sells}</span>
              ) : (
                <span className="text-ink-faint">No description saved.</span>
              )}
              {context.brand.markets.length || context.brand.contentLanguages.length ? (
                <span className="mt-1 block text-ink-faint">
                  {[
                    context.brand.markets.map(countryName).join(', '),
                    context.brand.contentLanguages.map(languageName).join(', '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              ) : null}
            </p>
            <Link
              href="/settings?section=brands"
              aria-label="Edit brand profile"
              title="Edit in Settings"
              className="shrink-0 rounded p-1 text-ink-faint hover:text-ink"
            >
              <Pencil size={13} aria-hidden />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
