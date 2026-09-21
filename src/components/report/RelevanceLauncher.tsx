'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';

import { analyseRelevance } from '@/app/actions/relevance';
import { INITIAL_RELEVANCE } from '@/app/actions/state';

/**
 * Pick a brand, optionally a campaign, and run the analysis.
 *
 * REUSES SAVED CONTEXT AND ASKS FOR NOTHING ELSE. Everything the analysis needs
 * — what the brand sells, its categories, the campaign's product and objective —
 * is already on the brand and campaign records. There is no form here beyond
 * choosing which of them to read against, because a page that demanded a brief
 * before showing a report would be asking for what it already has.
 *
 * Changing the brand navigates rather than setting state, so a colleague can be
 * sent the analysis for one client rather than the page it lives on.
 */
function Submit({ hasStored }: { hasStored: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="primary-action disabled:opacity-60">
      {pending ? 'Analysing…' : hasStored ? 'Run again' : 'Analyse relevance'}
    </button>
  );
}

export function RelevanceLauncher({
  channelId,
  brands,
  campaigns,
  selectedBrand,
  selectedCampaign,
  hasStored,
}: {
  channelId: string;
  brands: { id: string; name: string }[];
  campaigns: { id: string; name: string; brandId: string | null }[];
  selectedBrand: string | null;
  selectedCampaign: string | null;
  hasStored: boolean;
}) {
  const [state, action] = useFormState(analyseRelevance, INITIAL_RELEVANCE);
  const router = useRouter();
  const params = useSearchParams();

  function go(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    query.set('view', 'relevance');
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    router.push(`/channels/${channelId}?${query}`);
  }

  const forBrand = campaigns.filter((c) => !selectedBrand || c.brandId === selectedBrand);

  if (brands.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[12px] text-ink-muted">
        Add a brand in Settings to analyse relevance. The channel report above needs no brand.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="channelId" value={channelId} />
      <input type="hidden" name="brandId" value={selectedBrand ?? ''} />
      {selectedCampaign ? <input type="hidden" name="campaignId" value={selectedCampaign} /> : null}

      <label className="text-[12px]">
        <span className="block font-medium text-ink">Brand</span>
        <select
          value={selectedBrand ?? ''}
          onChange={(event) => go({ brand: event.target.value || null, campaign: null })}
          className="mt-1 min-h-10 rounded-lg border border-line bg-surface px-2.5 text-[13px]"
        >
          <option value="">Choose a brand…</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </label>

      {forBrand.length > 0 ? (
        <label className="text-[12px]">
          <span className="block font-medium text-ink">
            Campaign <span className="font-normal text-ink-faint">optional</span>
          </span>
          <select
            value={selectedCampaign ?? ''}
            onChange={(event) => go({ campaign: event.target.value || null })}
            className="mt-1 min-h-10 rounded-lg border border-line bg-surface px-2.5 text-[13px]"
          >
            <option value="">Brand only</option>
            {forBrand.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <Submit hasStored={hasStored} />
      {state.message ? (
        <p role="status" className="w-full text-[12px] text-ink-muted">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
