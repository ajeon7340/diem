'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import {
  NO_RANGE,
  SUBSCRIBER_STEPS,
  VIEW_STEPS,
  rangeIsSet,
  stepLabel,
  type Range,
} from '@/lib/discovery/ranges';

/**
 * The filters that narrow the results already on the page, held where both
 * columns can see them.
 *
 * WHY A CONTEXT AND NOT A PROP. These controls belong in the filter rail beside
 * the search fields — that is where somebody looks for "subscribers between X
 * and Y" — but the rows they hide are in the other column. The two are siblings
 * under the page, so the state sits above both of them rather than being lifted
 * into a server component that cannot hold it.
 *
 * NOTHING HERE TOUCHES THE SEARCH. Subscriber count and typical views are not
 * parameters `search.list` accepts; they are read off rows that came back. So
 * changing one is instant, costs no quota, and is reversible — which is exactly
 * why they are NOT in the form with the Search button. The fields that do change
 * the query (location, language, video length) stay there, because changing one
 * of those means asking YouTube a different question.
 *
 * WHAT IS DELIBERATELY ABSENT. Follower growth, engagement rate and likes
 * growth are the obvious neighbours of these two, and none of them can be
 * honest here: a search reads each channel once, so there is no earlier figure
 * to measure growth against, and the videos it retrieves carry view counts but
 * not likes. An empty control for each would look like a feature that had not
 * been switched on.
 */

interface Narrowing {
  subscribers: Range;
  views: Range;
  set: (key: 'subscribers' | 'views', range: Range) => void;
  clear: () => void;
}

const UNNARROWED: Narrowing = {
  subscribers: NO_RANGE,
  views: NO_RANGE,
  set: () => {},
  clear: () => {},
};

const NarrowingContext = createContext<Narrowing | null>(null);

/** Unfiltered when there is no provider, so a results list renders alone. */
export function useNarrowing(): Narrowing {
  return useContext(NarrowingContext) ?? UNNARROWED;
}

export function NarrowingProvider({ children }: { children: React.ReactNode }) {
  const [subscribers, setSubscribers] = useState<Range>(NO_RANGE);
  const [views, setViews] = useState<Range>(NO_RANGE);

  const set = useCallback((key: 'subscribers' | 'views', range: Range) => {
    (key === 'subscribers' ? setSubscribers : setViews)(range);
  }, []);

  const clear = useCallback(() => {
    setSubscribers(NO_RANGE);
    setViews(NO_RANGE);
  }, []);

  const value = useMemo(
    () => ({ subscribers, views, set, clear }),
    [subscribers, views, set, clear],
  );

  return <NarrowingContext.Provider value={value}>{children}</NarrowingContext.Provider>;
}

const select =
  'min-h-9 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-1.5 text-[12px] text-ink focus:outline-none';

/**
 * Two ends of one range.
 *
 * THE UPPER END ONLY OFFERS VALUES ABOVE THE LOWER ONE, so "from 100K to 10K"
 * — a filter that can only ever return nothing — is not reachable. Raising the
 * lower end past the upper one clears the upper rather than silently swapping
 * them, because a filter that rewrites itself is a filter nobody trusts.
 */
function RangePair({
  label,
  steps,
  value,
  onChange,
}: {
  label: string;
  steps: number[];
  value: Range;
  onChange: (range: Range) => void;
}) {
  const set = rangeIsSet(value);
  return (
    <div>
      <p className="text-[12px] font-medium text-ink">{label}</p>
      <div
        className={`mt-1.5 flex items-center gap-1 rounded-lg border bg-surface px-1 ${
          set ? 'border-indigo' : 'border-line'
        }`}
      >
        <select
          aria-label={`${label}, from`}
          className={select}
          value={value.min ?? ''}
          onChange={(event) => {
            const min = event.target.value ? Number(event.target.value) : null;
            const max = min !== null && value.max !== null && value.max <= min ? null : value.max;
            onChange({ min, max });
          }}
        >
          <option value="">From</option>
          {steps.map((step) => (
            <option key={step} value={step}>
              {stepLabel(step)}
            </option>
          ))}
        </select>
        <span aria-hidden className="text-[12px] text-ink-faint">
          –
        </span>
        <select
          aria-label={`${label}, to`}
          className={select}
          value={value.max ?? ''}
          onChange={(event) =>
            onChange({ ...value, max: event.target.value ? Number(event.target.value) : null })
          }
        >
          <option value="">To</option>
          {steps
            .filter((step) => value.min === null || step > value.min)
            .map((step) => (
              <option key={step} value={step}>
                {stepLabel(step)}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

/**
 * The rail section. Sits below the search form, outside it, so the Search
 * button never looks like the thing that applies these.
 */
export function PerformanceFilters() {
  const { subscribers, views, set, clear } = useNarrowing();
  const anySet = rangeIsSet(subscribers) || rangeIsSet(views);

  return (
    <section className="shrink-0 space-y-3 border-t border-line p-4" aria-label="Narrow these results">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="rail">Performance</h2>
        {anySet ? (
          <button
            type="button"
            onClick={clear}
            className="min-h-6 text-[11px] text-indigo underline-offset-4 hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>

      <RangePair
        label="Subscribers"
        steps={SUBSCRIBER_STEPS}
        value={subscribers}
        onChange={(range) => set('subscribers', range)}
      />
      <RangePair
        label="Typical views"
        steps={VIEW_STEPS}
        value={views}
        onChange={(range) => set('views', range)}
      />

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Narrows these results as you change them. No growth or engagement rates — a search reads each
        channel once, and doesn’t retrieve likes.
      </p>
    </section>
  );
}
