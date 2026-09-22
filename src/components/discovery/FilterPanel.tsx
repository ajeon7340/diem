'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Search, SlidersHorizontal, X } from 'lucide-react';

import { startDiscovery } from '@/app/actions/discovery';
import { INITIAL_DISCOVERY } from '@/app/actions/state';
import { COUNTRIES, LANGUAGES } from '@/lib/locale/vocabulary';
import { LOCALE_PARAMETER_DISCLOSURE } from '@/lib/youtube/search-contract';
import { SUBSCRIBER_STEPS, VIEW_STEPS, stepLabel } from '@/lib/discovery/ranges';
import { useFilterState } from './useFilterState';
import { ModeForm, type FilterDefaults } from './SearchForms';
import type { SearchContext } from '@/lib/discovery/context';
import { appliedCount, type FilterState } from '@/lib/discovery/filter-state';
import { DISCOVERY_MODES, type DiscoveryMode } from '@/lib/discovery/types';
import { CAMPAIGN_CATEGORIES, CATEGORY_LABEL } from '@/types';
import { cn } from '@/lib/cn';

/**
 * The page's conditions, in their own column.
 *
 * NAVIGATION AND FILTERS NEVER SHARE A COLUMN. One says where you are in the
 * application, the other says what you are asking of this page; a rail that
 * holds both gives a reader two answers to "where am I" and makes the filters
 * look like destinations.
 *
 * NOTHING IS BEHIND "MORE FILTERS". A single accordion holding every optional
 * condition meant a customer could not find out what this product can filter
 * on without opening it, and most never did. The sections are all here; the
 * four that matter most are open, the rest are one click and a scroll away.
 *
 * THE URL IS THE STATE. Every control writes to the query string and reads
 * back from it, so a filtered search is an address: shareable, bookmarkable,
 * and survivable by the back button. It also means this panel and the results
 * area cannot disagree about what is applied, because there is one copy.
 *
 * THREE SEPARATE SEARCHES, NOT THREE TABS. Each mode replaces the whole filter
 * set because each asks the index a different question, so the control is
 * labelled as a mode and carries a line saying what it does.
 */

const NUMBER_FIELD =
  'min-h-9 w-full rounded-[var(--r-md)] border border-line bg-surface px-2 text-[13px] text-ink tabular-nums placeholder:text-ink-faint';
const SELECT_FIELD =
  'min-h-9 w-full rounded-[var(--r-md)] border border-line bg-surface px-2 text-[13px] text-ink';
const LABEL = 'block text-[12px] font-medium text-ink';

/**
 * The markets this product is used for, first.
 *
 * An alphabetical list of 250 countries puts Afghanistan above the United
 * States, which is a list sorted for the alphabet rather than for anybody
 * using it. These twelve are the ones the rest of the product already treats
 * as common, in `LocalePicker`.
 */
const POPULAR_MARKETS = ['US', 'GB', 'KR', 'JP', 'CA', 'AU', 'DE', 'FR', 'ES', 'BR', 'IN', 'ID'];
const HELP = 'mt-1 text-[11px] leading-relaxed text-ink-muted';

export function FilterPanel({
  mode,
  campaignId,
  brandId,
  defaults,
  context,
}: {
  mode: DiscoveryMode;
  campaignId: string | null;
  brandId: string | null;
  /** Prefilled from the brand and from a stored run, with provenance. */
  defaults?: FilterDefaults;
  context?: SearchContext;
}) {
  const { filters, apply, reset } = useFilterState();
  const popular = POPULAR_MARKETS.flatMap((code) => COUNTRIES.filter((c) => c.code === code));
  const rest = COUNTRIES.filter((c) => !POPULAR_MARKETS.includes(c.code));
  const applied = appliedCount(filters);
  const [state, action] = useFormState(startDiscovery, INITIAL_DISCOVERY);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSheetOpen(false);
        opener.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const body = (
    <>
      {/*
        * ONE HEADER BAND. The tabs sat in a padded block whose height was
        * whatever its content came to, so the panel's first row started a few
        * pixels off the rail's logo row and the results bar started off both.
        * All three are `--header-h` now and the eye reads one line across.
        */}
      <div className="flex h-[var(--header-h)] shrink-0 items-center gap-2 border-b border-line px-3">
        <div role="tablist" aria-label="Search mode" className="flex min-w-0 flex-1 gap-1">
          {(Object.keys(DISCOVERY_MODES) as DiscoveryMode[]).map((id) => (
            <Link
              key={id}
              role="tab"
              aria-selected={mode === id}
              href={`/discover?mode=${id}${campaignId ? `&campaign=${campaignId}` : ''}`}
              // Equal thirds with the same box on every tab, active or not:
              // when only the selected one had a background, the three sat at
              // three different apparent widths and the row read as ragged.
              className={cn(
                'press flex h-8 flex-1 items-center justify-center rounded-[var(--r-md)] px-1 text-center text-[12px] font-medium',
                'truncate transition-colors duration-150',
                mode === id
                  ? 'bg-indigo text-white'
                  : 'bg-black/[0.03] text-ink-muted hover:bg-black/[0.06] hover:text-ink',
              )}
            >
              {{ criteria: 'By criteria', similar: 'Similar to', competitor: 'Competitors' }[id]}
            </Link>
          ))}
        </div>
        {/* Minimise the filter column, so a comparison table can have the
            width back without losing the filters that produced it. */}
        <button
          type="button"
          onClick={() => setMinimised(true)}
          aria-label="Minimise filters"
          title="Minimise filters"
          className="press hidden h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-md)] text-ink-faint hover:bg-black/[0.04] hover:text-ink lg:flex"
        >
          <PanelLeftClose size={16} aria-hidden />
        </button>
      </div>
      <p className="shrink-0 border-b border-line px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
        {DISCOVERY_MODES[mode].blurb}
      </p>

      <form
        id="discovery-search"
        action={action}
        className="flex min-h-0 flex-1 flex-col"
      >
        <input type="hidden" name="mode" value={mode} />
        {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
        {brandId ? <input type="hidden" name="brandId" value={brandId} /> : null}
        {/*
          * ONLY RUN FILTERS ARE POSTED.
          *
          * The narrow ones are deliberately absent. Sending them would make
          * the server drop rows before they ever reach the browser, and then
          * loosening a range could not widen the results — it would need
          * another search, which is the cost this whole split exists to
          * avoid. The run fetches the widest honest set; narrowing happens
          * over it, in memory, for free.
          */}
        {filters.category ? <input type="hidden" name="categories" value={filters.category} /> : null}
        {filters.market ? <input type="hidden" name="market" value={filters.market} /> : null}
        {filters.contentLanguage ? <input type="hidden" name="language" value={filters.contentLanguage} /> : null}
        {filters.publishedWithinDays ? <input type="hidden" name="publishedWithinDays" value={filters.publishedWithinDays} /> : null}
        {filters.videoLength ? <input type="hidden" name="formats" value={filters.videoLength} /> : null}
        {filters.similarToChannel ? <input type="hidden" name="channel" value={filters.similarToChannel} /> : null}
        {filters.competitorBrand ? <input type="hidden" name="knownCompetitors" value={filters.competitorBrand} /> : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === 'criteria' ? null : (
            /* The other two modes ask for a channel or a brand, plus the
               fields that shape their run. They render INSIDE this form —
               `bare` strips their own <form> and footer — so the page has one
               Search button and one Reset instead of two of each. */
            <Section title={mode === 'similar' ? 'Reference channel' : 'Competing brands'} defaultOpen>
              <ModeForm
                bare
                mode={mode}
                campaignId={campaignId}
                defaults={defaults}
                context={context}
              />
            </Section>
          )}

          {mode === 'criteria' ? (
            <>
              <Section title="Category" defaultOpen>
                <label className="sr-only" htmlFor="category">Category</label>
                <select
                  id="category"
                  value={filters.category ?? ''}
                  onChange={(event) =>
                    apply({ category: (event.target.value || null) as FilterState['category'] })
                  }
                  className={SELECT_FIELD}
                >
                  <option value="">Any category</option>
                  {CAMPAIGN_CATEGORIES.map((id) => (
                    <option key={id} value={id}>{CATEGORY_LABEL[id]}</option>
                  ))}
                </select>
                <p className={HELP}>One category becomes the search term.</p>
              </Section>

              <Section title="Market" defaultOpen>
                <label className={LABEL} htmlFor="market">Market</label>
                <select
                  id="market"
                  value={filters.market ?? ''}
                  onChange={(event) => apply({ market: event.target.value || null })}
                  className={cn(SELECT_FIELD, 'mt-1.5')}
                >
                  <option value="">Anywhere</option>
                  {/* The dozen markets this product is actually used for, then
                      the rest. Scrolling past Afghanistan to reach the United
                      States is a list sorted for the alphabet, not the user. */}
                  <optgroup label="Common">
                    {popular.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="All markets">
                    {rest.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </optgroup>
                </select>
                <p className={HELP}>{LOCALE_PARAMETER_DISCLOSURE}</p>
              </Section>

              {/* OPTIONAL, AND COLLAPSED TO SAY SO. A content language is a
                  search preference most runs do not need, and it is not an
                  audience: a Korean-language video is watched wherever it is
                  watched. */}
              <Section title="Content language">
                <label className="sr-only" htmlFor="language">Content language</label>
                <select
                  id="language"
                  value={filters.contentLanguage ?? ''}
                  onChange={(event) => apply({ contentLanguage: event.target.value || null })}
                  className={SELECT_FIELD}
                >
                  <option value="">Any language (default)</option>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
                <p className={HELP}>Optional. Language is not a location.</p>
              </Section>

            </>
          ) : null}

          {/* NARROW FILTERS APPLY IN EVERY MODE: they read figures on the
              candidates a run returned, and every mode returns candidates. */}
              <Section title="Subscriber range" defaultOpen>
                <Range
                  from={filters.subscriberMin}
                  to={filters.subscriberMax}
                  steps={SUBSCRIBER_STEPS}
                  onChange={(from, to) => apply({ subscriberMin: from, subscriberMax: to })}
                  label="Subscribers"
                />
                <p className={HELP}>Narrows the channels a run read. A hidden count is kept, not dropped.</p>
              </Section>

              <Section title="Avg. views range" defaultOpen>
                <Range
                  from={filters.avgViewsMin}
                  to={filters.avgViewsMax}
                  steps={VIEW_STEPS}
                  onChange={(from, to) => apply({ avgViewsMin: from, avgViewsMax: to })}
                  label="Typical views"
                />
                <p className={HELP}>Median views of the videos this search reads, not a channel average.</p>
              </Section>

              <Section title="Last upload">
                <select
                  aria-label="Published within"
                  value={filters.publishedWithinDays ?? ''}
                  onChange={(event) => apply({ publishedWithinDays: event.target.value ? Number(event.target.value) : null })}
                  className={SELECT_FIELD}
                >
                  <option value="">Any time</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="365">Last year</option>
                </select>
                <p className={HELP}>Sent to YouTube, so it narrows the index rather than the results.</p>
              </Section>

              <Section title="Video length">
                <select
                  aria-label="Video length"
                  value={filters.videoLength ?? ''}
                  onChange={(event) =>
                    apply({ videoLength: (event.target.value || null) as FilterState['videoLength'] })
                  }
                  className={SELECT_FIELD}
                >
                  <option value="">Any length</option>
                  <option value="short">Under 4 min</option>
                  <option value="medium">4–20 min</option>
                  <option value="long">Over 20 min</option>
                </select>
              </Section>

              <Section title="Excluded keywords">
                <input
                  aria-label="Excluded keywords"
                  value={filters.excludedKeywords}
                  onChange={(event) => apply({ excludedKeywords: event.target.value })}
                  placeholder="crypto, gambling"
                  maxLength={200}
                  className={NUMBER_FIELD}
                />
                <p className={HELP}>Drops a channel when a retrieved title carries one of these.</p>
              </Section>

        </div>

        {/* Sticky, so Search is reachable without scrolling the sections. */}
        <div className="sticky bottom-0 shrink-0 border-t border-line bg-surface p-3">
          {state.message ? (
            <p role="alert" className="mb-2 rounded-[var(--r-md)] border border-amber/30 bg-amber-wash px-2.5 py-2 text-[12px] leading-relaxed text-ink">
              {state.message}
            </p>
          ) : null}
          <Submit applied={applied} />
          <button
            type="button"
            onClick={reset}
            className="press mt-1.5 min-h-9 w-full rounded-[var(--r-md)] text-[13px] text-ink-muted hover:bg-black/[0.04] hover:text-ink"
          >
            Reset
          </button>
        </div>
      </form>
    </>
  );

  return (
    <>
      {/* Below md the panel is a bottom sheet behind one button. */}
      <button
        ref={opener}
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-expanded={sheetOpen}
        className="press m-3 inline-flex min-h-10 items-center gap-2 self-start rounded-[var(--r-md)] border border-line bg-surface px-3 text-[13px] font-medium text-ink lg:hidden"
      >
        <SlidersHorizontal size={15} aria-hidden />
        Filters
        {applied ? (
          <span className="tnum rounded-full bg-indigo px-1.5 text-[11px] text-white">{applied}</span>
        ) : null}
      </button>

      {sheetOpen ? (
        <div
          className="fixed inset-0 z-30 bg-ink/30 lg:hidden"
          onClick={() => setSheetOpen(false)}
          aria-hidden
        />
      ) : null}

      {minimised ? (
        <aside
          aria-label="Search filters, minimised"
          className="hidden shrink-0 flex-col items-center gap-2 border-r border-line bg-black/[0.02] py-3 lg:flex"
        >
          <button
            type="button"
            onClick={() => setMinimised(false)}
            aria-label="Expand filters"
            title="Expand filters"
            className="press flex h-8 w-8 items-center justify-center rounded-[var(--r-md)] text-ink-faint hover:bg-black/[0.04] hover:text-ink"
          >
            <PanelLeftOpen size={16} aria-hidden />
          </button>
          {applied ? (
            <span
              className="tnum rounded-full bg-indigo px-1.5 py-0.5 text-[11px] text-white"
              title={`${applied} filter${applied === 1 ? '' : 's'} applied`}
            >
              {applied}
            </span>
          ) : null}
          {/* Search stays reachable while minimised: the form is still in the
              DOM, so the filters it posts are the ones that were set. */}
          <button
            type="submit"
            form="discovery-search"
            aria-label="Search"
            title="Search"
            className="press flex h-8 w-8 items-center justify-center rounded-[var(--r-md)] bg-indigo text-white hover:bg-indigo-hover"
          >
            <Search size={15} strokeWidth={2} aria-hidden />
          </button>
        </aside>
      ) : null}

      <aside
        aria-label="Search filters"
        className={cn(
          'flex flex-col border-r border-line bg-black/[0.02]',
          minimised && 'lg:hidden',
          sheetOpen
            ? 'fixed inset-x-0 bottom-0 z-40 max-h-[85dvh] rounded-t-[var(--r-xl)] border-r-0 bg-paper shadow-[var(--shadow-overlay)]'
            : 'hidden',
          'lg:static lg:z-auto lg:flex lg:h-full lg:w-[320px] lg:max-h-none lg:rounded-none lg:bg-black/[0.02] lg:shadow-none',
        )}
      >
        <button
          type="button"
          onClick={() => {
            setSheetOpen(false);
            opener.current?.focus();
          }}
          className="flex items-center justify-between border-b border-line px-3 py-3 text-[13px] font-medium text-ink lg:hidden"
        >
          Filters
          <X size={16} aria-hidden />
        </button>
        {body}
      </aside>
    </>
  );
}

function Submit({ applied }: { applied: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="press inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--r-md)] bg-indigo text-[13px] font-medium text-white hover:bg-indigo-hover disabled:bg-indigo/40"
    >
      {pending ? 'Searching…' : (<><Search size={15} strokeWidth={2} aria-hidden /> Search</>)}
      {applied && !pending ? (
        <span className="tnum rounded-full bg-white/20 px-1.5 text-[11px]">{applied}</span>
      ) : null}
    </button>
  );
}

/** A collapsible section. Open ones carry the conditions people set most. */
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-line last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[12px] font-medium text-ink">
        {title}
        <ChevronDown
          size={14}
          aria-hidden
          className="text-ink-faint transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

/**
 * Two ends, each chosen from a list of steps.
 *
 * NOT OPEN NUMBER FIELDS. "At least 17,428 subscribers" is a precision the
 * retrieved rows do not have, and a free field invites it; the values people
 * actually mean here are round. A list also removes the debounce problem
 * entirely — there is no partial value to recompute over, so narrowing stays
 * synchronous on every change.
 *
 * THE UPPER END ONLY OFFERS VALUES ABOVE THE LOWER ONE, so a range that can
 * only ever return nothing is unreachable. Raising the floor past the ceiling
 * clears the ceiling rather than silently swapping them: a filter that
 * rewrites itself is a filter nobody trusts.
 */
function Range({
  from,
  to,
  steps,
  onChange,
  label,
}: {
  from: number | null;
  to: number | null;
  steps: number[];
  onChange: (from: number | null, to: number | null) => void;
  label: string;
}) {
  const value = (raw: string) => (raw === '' ? null : Number(raw));
  return (
    <div className="flex items-center gap-1 rounded-[var(--r-md)] border border-line bg-surface px-1">
      <select
        aria-label={`${label}, from`}
        value={from ?? ''}
        onChange={(event) => {
          const next = value(event.target.value);
          const ceiling = next !== null && to !== null && to <= next ? null : to;
          onChange(next, ceiling);
        }}
        className="min-h-9 min-w-0 flex-1 bg-transparent px-1.5 text-[13px] tabular-nums text-ink focus:outline-none"
      >
        <option value="">From</option>
        {steps.map((step) => (
          <option key={step} value={step}>{stepLabel(step)}</option>
        ))}
      </select>
      <span aria-hidden className="text-[12px] text-ink-faint">–</span>
      <select
        aria-label={`${label}, to`}
        value={to ?? ''}
        onChange={(event) => onChange(from, value(event.target.value))}
        className="min-h-9 min-w-0 flex-1 bg-transparent px-1.5 text-[13px] tabular-nums text-ink focus:outline-none"
      >
        <option value="">To</option>
        {steps
          .filter((step) => from === null || step > from)
          .map((step) => (
            <option key={step} value={step}>{stepLabel(step)}</option>
          ))}
      </select>
    </div>
  );
}
