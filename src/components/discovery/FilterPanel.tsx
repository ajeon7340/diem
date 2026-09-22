'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';

import { startDiscovery } from '@/app/actions/discovery';
import { INITIAL_DISCOVERY } from '@/app/actions/state';
import { COUNTRIES, LANGUAGES } from '@/lib/locale/vocabulary';
import { LOCALE_PARAMETER_DISCLOSURE } from '@/lib/youtube/search-contract';
import { SUBSCRIBER_STEPS, VIEW_STEPS, stepLabel } from '@/lib/discovery/ranges';
import { appliedCount, readFilters, writeFilters, type Filters } from '@/lib/discovery/filters';
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
const HELP = 'mt-1 text-[11px] leading-relaxed text-ink-muted';

export function FilterPanel({
  mode,
  campaignId,
  brandId,
  modeExtra,
}: {
  mode: DiscoveryMode;
  campaignId: string | null;
  brandId: string | null;
  /** The reference-channel or competitor inputs, for the other two modes. */
  modeExtra?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = readFilters(new URLSearchParams(params.toString()));
  const applied = appliedCount(filters);
  const [state, action] = useFormState(startDiscovery, INITIAL_DISCOVERY);
  const [sheetOpen, setSheetOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  function apply(next: Partial<Filters>) {
    const query = writeFilters({ ...filters, ...next }, new URLSearchParams(params.toString()));
    router.replace(`${pathname}?${query}`, { scroll: false });
  }

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
      {/* Mode: a search mode, not a tab. Each one swaps everything below it. */}
      <div className="shrink-0 border-b border-line px-3 py-3">
        <div role="tablist" aria-label="Search mode" className="flex gap-1">
          {(Object.keys(DISCOVERY_MODES) as DiscoveryMode[]).map((id) => (
            <a
              key={id}
              role="tab"
              aria-selected={mode === id}
              href={`/discover?mode=${id}${campaignId ? `&campaign=${campaignId}` : ''}`}
              className={cn(
                'press min-h-8 flex-1 rounded-[var(--r-md)] px-2 text-center text-[12px] font-medium transition-colors duration-150',
                mode === id ? 'bg-indigo text-white' : 'text-ink-muted hover:bg-black/[0.04] hover:text-ink',
              )}
            >
              {{ criteria: 'By criteria', similar: 'Similar to', competitor: 'Competitors' }[id]}
            </a>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">{DISCOVERY_MODES[mode].blurb}</p>
      </div>

      <form
        id="discovery-search"
        action={action}
        className="flex min-h-0 flex-1 flex-col"
      >
        <input type="hidden" name="mode" value={mode} />
        {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
        {brandId ? <input type="hidden" name="brandId" value={brandId} /> : null}
        {/* The URL is the state; the form posts exactly what it says. */}
        {filters.category ? <input type="hidden" name="categories" value={filters.category} /> : null}
        {filters.market ? <input type="hidden" name="market" value={filters.market} /> : null}
        {filters.language ? <input type="hidden" name="language" value={filters.language} /> : null}
        {filters.subsFrom !== null ? <input type="hidden" name="minSubscribers" value={filters.subsFrom} /> : null}
        {filters.subsTo !== null ? <input type="hidden" name="maxSubscribers" value={filters.subsTo} /> : null}
        {filters.viewsFrom !== null ? <input type="hidden" name="viewsFrom" value={filters.viewsFrom} /> : null}
        {filters.viewsTo !== null ? <input type="hidden" name="viewsTo" value={filters.viewsTo} /> : null}
        {filters.within ? <input type="hidden" name="publishedWithinDays" value={filters.within} /> : null}
        {filters.length ? <input type="hidden" name="formats" value={filters.length} /> : null}
        {filters.exclude ? <input type="hidden" name="excludeTopics" value={filters.exclude} /> : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === 'criteria' ? (
            <>
              <Section title="Category" defaultOpen>
                <div className="flex flex-wrap gap-1.5">
                  {CAMPAIGN_CATEGORIES.map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={filters.category === id}
                      onClick={() => apply({ category: filters.category === id ? null : id })}
                      className={cn(
                        'press min-h-8 rounded-full border px-2.5 text-[12px] transition-colors duration-150',
                        filters.category === id
                          ? 'border-indigo bg-indigo text-white'
                          : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
                      )}
                    >
                      {CATEGORY_LABEL[id]}
                    </button>
                  ))}
                </div>
                <p className={HELP}>One category becomes the search term.</p>
              </Section>

              <Section title="Market & language" defaultOpen>
                <label className={LABEL} htmlFor="market">Market</label>
                <select
                  id="market"
                  value={filters.market ?? ''}
                  onChange={(event) => apply({ market: event.target.value || null })}
                  className={cn(SELECT_FIELD, 'mt-1.5')}
                >
                  <option value="">Anywhere</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
                <label className={cn(LABEL, 'mt-3')} htmlFor="language">Content language</label>
                <select
                  id="language"
                  value={filters.language ?? ''}
                  onChange={(event) => apply({ language: event.target.value || null })}
                  className={cn(SELECT_FIELD, 'mt-1.5')}
                >
                  <option value="">Any language</option>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
                <p className={HELP}>{LOCALE_PARAMETER_DISCLOSURE}</p>
              </Section>

              <Section title="Subscriber range" defaultOpen>
                <Range
                  from={filters.subsFrom}
                  to={filters.subsTo}
                  steps={SUBSCRIBER_STEPS}
                  presets={[[10_000, 100_000], [100_000, 1_000_000], [1_000_000, null]]}
                  onChange={(from, to) => apply({ subsFrom: from, subsTo: to })}
                  label="Subscribers"
                />
                <p className={HELP}>Narrows the channels a run read. A hidden count is kept, not dropped.</p>
              </Section>

              <Section title="Avg. views range" defaultOpen>
                <Range
                  from={filters.viewsFrom}
                  to={filters.viewsTo}
                  steps={VIEW_STEPS}
                  presets={[[10_000, 100_000], [100_000, 1_000_000], [1_000_000, null]]}
                  onChange={(from, to) => apply({ viewsFrom: from, viewsTo: to })}
                  label="Typical views"
                />
                <p className={HELP}>Median views of the videos this search reads, not a channel average.</p>
              </Section>

              <Section title="Last upload">
                <select
                  aria-label="Published within"
                  value={filters.within ?? ''}
                  onChange={(event) => apply({ within: event.target.value ? Number(event.target.value) : null })}
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
                  value={filters.length ?? ''}
                  onChange={(event) =>
                    apply({ length: (event.target.value || null) as Filters['length'] })
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
                  value={filters.exclude}
                  onChange={(event) => apply({ exclude: event.target.value })}
                  placeholder="crypto, gambling"
                  maxLength={200}
                  className={NUMBER_FIELD}
                />
                <p className={HELP}>Drops a channel when a retrieved title carries one of these.</p>
              </Section>
            </>
          ) : (
            <div className="p-3">{modeExtra}</div>
          )}
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
            onClick={() => router.replace(pathname + (campaignId ? `?campaign=${campaignId}` : ''), { scroll: false })}
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

      <aside
        aria-label="Search filters"
        className={cn(
          'flex flex-col border-r border-line bg-black/[0.02]',
          sheetOpen
            ? 'fixed inset-x-0 bottom-0 z-40 max-h-[85dvh] rounded-t-[var(--r-xl)] border-r-0 bg-paper shadow-[var(--shadow-overlay)]'
            : 'hidden',
          'lg:static lg:z-auto lg:flex lg:h-full lg:max-h-none lg:rounded-none lg:bg-black/[0.02] lg:shadow-none',
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
 * Two number fields and a few presets.
 *
 * NOT A SLIDER. The values people care about here are round and exact —
 * 10,000, 100,000, a million — and a slider makes those the hardest ones to
 * hit. A preset gives the common case in one tap and the fields give the rest.
 */
function Range({
  from,
  to,
  steps,
  presets,
  onChange,
  label,
}: {
  from: number | null;
  to: number | null;
  steps: number[];
  presets: [number, number | null][];
  onChange: (from: number | null, to: number | null) => void;
  label: string;
}) {
  const parse = (value: string) => {
    const n = Number(value.replace(/[,\s]/g, ''));
    return value.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
  };
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          inputMode="numeric"
          aria-label={`${label}, minimum`}
          placeholder="Min"
          defaultValue={from ?? ''}
          key={`from-${from ?? ''}`}
          onBlur={(event) => onChange(parse(event.target.value), to)}
          className={NUMBER_FIELD}
        />
        <span aria-hidden className="text-[12px] text-ink-faint">–</span>
        <input
          inputMode="numeric"
          aria-label={`${label}, maximum`}
          placeholder="Max"
          defaultValue={to ?? ''}
          key={`to-${to ?? ''}`}
          onBlur={(event) => onChange(from, parse(event.target.value))}
          className={NUMBER_FIELD}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {presets.map(([low, high]) => {
          const on = from === low && to === high;
          return (
            <button
              key={`${low}-${high}`}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : low, on ? null : high)}
              className={cn(
                'press min-h-7 rounded-full border px-2 text-[11px] tabular-nums transition-colors duration-150',
                on ? 'border-indigo bg-indigo-wash text-indigo' : 'border-line text-ink-muted hover:text-ink',
              )}
            >
              {stepLabel(low)}–{high === null ? '∞' : stepLabel(high)}
            </button>
          );
        })}
      </div>
      <datalist id={`${label}-steps`}>
        {steps.map((step) => (
          <option key={step} value={step} />
        ))}
      </datalist>
    </div>
  );
}
