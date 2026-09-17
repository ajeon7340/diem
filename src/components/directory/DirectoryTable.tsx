'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { BadgeCheck, CheckCircle2, Send } from 'lucide-react';

import type { DirectoryListing } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  sendCampaignBrief,
  type BriefFormState,
} from '@/app/actions/campaign-brief';
import { CURRENCIES } from '@/lib/schemas';
import { compactNumber, currency, percent, score, shortDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { INITIAL_BRIEF_STATE } from '@/app/actions/state';

const FATIGUE_TONE = { low: 'emerald', moderate: 'slate', high: 'rose' } as const;
const FIELD = cn(
  'h-9 w-full rounded-md border border-line bg-surface px-3 text-[12px] text-ink',
  'placeholder:text-ink-faint outline-none focus:border-indigo focus:ring-2 focus:ring-indigo/20',
);

function SendButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || count === 0}>
      <Send className="h-3.5 w-3.5" aria-hidden />
      {pending ? 'Sending…' : `Send to ${count}`}
    </Button>
  );
}

/**
 * Selection drives the bulk-proposal composer. Every selected id is posted as a
 * `creatorIds` entry and re-checked by RLS on insert, so a stale row in this
 * table cannot widen who receives a brief.
 */
export function DirectoryTable({ listings }: { listings: DirectoryListing[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction] = useFormState<BriefFormState, FormData>(
    sendCampaignBrief,
    INITIAL_BRIEF_STATE,
  );

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  // Only warn when the list actually mixes bases — a homogeneous column needs
  // no caveat, and a caveat that is always there stops being read.
  const mixedIntentBasis =
    new Set(
      listings
        .filter((l) => l.purchaseIntentRate !== null)
        .map((l) => l.intentBasis ?? 'unrecorded'),
    ).size > 1;

  const allSelected = listings.length > 0 && selected.size === listings.length;

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (state.status === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald" aria-hidden />
        <p className="text-[14px] font-medium text-ink">
          Brief sent to {state.sentCount} {state.sentCount === 1 ? 'creator' : 'creators'}
        </p>
        <p className="max-w-[46ch] text-[12px] leading-relaxed text-ink-muted">
          Each creator receives the brief in their dashboard and can accept or decline
          individually.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction}>
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name="creatorIds" value={id} />
      ))}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-10 px-5 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all creators"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(listings.map((l) => l.id)))
                  }
                  className="h-3.5 w-3.5 cursor-pointer accent-indigo"
                />
              </th>
              {['Creator', 'Audience', 'Purchase intent', 'Est. CPM', 'Sentiment', 'Ad fatigue', 'Comment climate', 'Min. budget', 'Analysed'].map(
                (heading) => (
                  <th key={heading} scope="col" className="rail whitespace-nowrap px-4 py-2.5">
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => (
              <tr
                key={listing.id}
                className={cn(
                  'border-b border-line transition-colors last:border-b-0 hover:bg-paper',
                  selected.has(listing.id) && 'bg-indigo-wash/60',
                )}
              >
                <td className="px-5 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${listing.displayName}`}
                    checked={selected.has(listing.id)}
                    onChange={() => toggle(listing.id)}
                    className="h-3.5 w-3.5 cursor-pointer accent-indigo"
                  />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/@${listing.handle}`} className="group block">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink group-hover:text-indigo">
                      {listing.displayName}
                      {listing.isVerified ? (
                        <BadgeCheck className="h-3.5 w-3.5 text-emerald" aria-label="Verified" />
                      ) : null}
                    </span>
                    <span className="tnum text-[11px] text-ink-faint">
                      @{listing.handle}
                      {listing.niche ? ` · ${listing.niche}` : ''}
                    </span>
                  </Link>
                </td>
                <td className="tnum px-4 py-3 text-[13px] text-ink">
                  {compactNumber(listing.totalFollowers)}
                </td>
                {/* The rate and the denominator it is a share of, together.
                    These are not one quantity: a product-basis figure divides
                    by the comments that had a product in frame, an
                    all-comments figure divides by everything. The second is
                    wider by construction and reads lower for the same
                    audience, so a column showing only the percentages ranks
                    creators partly on which pipeline happened to run. */}
                <td className="px-4 py-3">
                  <span className="tnum block text-[13px] font-medium text-ink">
                    {listing.purchaseIntentRate === null
                      ? '—'
                      : percent(listing.purchaseIntentRate)}
                  </span>
                  {listing.purchaseIntentRate === null ? null : (
                    <span className="block text-[10px] text-ink-faint">
                      {listing.intentBasis === 'product_comments'
                        ? 'of product comments'
                        : listing.intentBasis === 'all_comments'
                          ? 'of all comments'
                          : 'basis not recorded'}
                    </span>
                  )}
                </td>
                <td className="tnum px-4 py-3 text-[13px] text-ink">
                  {listing.estimatedCpm === null ? '—' : currency(Math.round(listing.estimatedCpm))}
                </td>
                <td className="tnum px-4 py-3 text-[13px] text-ink">
                  {listing.sentimentScore === null ? '—' : score(listing.sentimentScore)}
                </td>
                <td className="px-4 py-3">
                  {listing.adFatigueLevel ? (
                    <Badge tone={FATIGUE_TONE[listing.adFatigueLevel]}>
                      {listing.adFatigueLevel}
                    </Badge>
                  ) : (
                    <span className="text-[12px] text-ink-faint">not sponsored</span>
                  )}
                </td>
                {/* The read, not the flag count.
                    This column was "N / M flags raised", and on a creator whose
                    only pass is the risk census it printed a green "clear" —
                    over a section with 180 findings in it, because none of them
                    are flags and none of them are the creator's doing. Both
                    facts are true and the cell was still telling a buyer the
                    wrong thing. The climate label answers what the column was
                    being read for; the flag counts stay on the report.

                    Only `warm` is coloured. `ordinary` is the absence of a
                    finding, not a finding, and green would make it look like
                    one — the same mistake the composite score made. */}
                <td className="px-4 py-3 text-[13px] text-ink">
                  {listing.climateLabel === null ? (
                    <span className="text-[12px] text-ink-faint">not read</span>
                  ) : (
                    <span className={listing.climateLabel === 'warm' ? 'text-emerald' : undefined}>
                      {listing.climateLabel}
                    </span>
                  )}
                  {listing.raisedFlags !== null && listing.raisedFlags > 0 ? (
                    <span className="tnum block text-[10px] text-ink-faint">
                      {listing.raisedFlags} of {listing.checkedFlags ?? 0} flags raised
                    </span>
                  ) : null}
                </td>
                <td className="tnum px-4 py-3 text-[13px] text-ink-muted">
                  {listing.minimumBudget === null ? '—' : currency(listing.minimumBudget)}
                </td>
                <td className="tnum px-4 py-3 text-[12px] text-ink-faint">
                  {shortDate(listing.lastAnalyzedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stated once under the column rather than per row. The sort ranks the
          percentages as if they were one quantity, and until every creator's
          classifier emits per-product cells they are not — so the ordering is
          a starting point for reading, not a league table. */}
      {mixedIntentBasis ? (
        <p className="border-t border-line px-5 py-2.5 text-[11px] leading-relaxed text-ink-faint">
          Purchase intent is measured against two different denominators in this list. A
          product-comment figure divides by the comments that had a product in frame; an
          all-comment figure divides by everything, so it reads lower for the same audience.
          Sorting on this column compares them anyway — read the basis under each figure before
          treating the order as a ranking.
        </p>
      ) : null}

      {selected.size > 0 ? (
        <div className="border-t border-line bg-paper px-5 py-5">
          <h3 className="rail">
            Bulk proposal · {selected.size} {selected.size === 1 ? 'creator' : 'creators'}
          </h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input name="title" required placeholder="Brief title" maxLength={140} className={FIELD} />
            <input
              name="objective"
              required
              placeholder="Campaign objective"
              maxLength={200}
              className={FIELD}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input name="budgetMin" inputMode="numeric" placeholder="Budget min" className={cn(FIELD, 'tnum')} />
            <input name="budgetMax" inputMode="numeric" placeholder="Budget max" className={cn(FIELD, 'tnum')} />
            <select name="budgetCurrency" aria-label="Currency" defaultValue="USD" className={cn(FIELD, 'tnum cursor-pointer')}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <textarea
            name="briefNote"
            rows={3}
            maxLength={4000}
            placeholder="Deliverables, flight dates, and anything the creator needs to decide."
            className={cn(FIELD, 'mt-3 h-auto resize-none py-2.5 leading-relaxed')}
          />

          {state.status === 'error' && state.message ? (
            <p className="mt-3 rounded-md border border-rose/30 bg-rose-wash px-3 py-2 text-[12px] text-rose">
              {state.message}
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <SendButton count={selected.size} />
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[12px] text-ink-muted underline-offset-4 hover:underline"
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
