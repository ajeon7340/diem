'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef } from 'react';

import {
  changedKeys,
  clearChip,
  readFilters,
  touchesRun,
  writeFilters,
  type FilterState,
} from '@/lib/discovery/filter-state';

/**
 * The filter state, and the URL is the only copy of it.
 *
 * NO SECOND SOURCE OF TRUTH. Not a context, not a store, not a `useState`
 * mirror. Every consumer reads `useSearchParams` and writes with
 * `router.replace`, so the filter panel, the chip bar and the chat cannot
 * disagree about what is applied — and a search somebody wants to send a
 * colleague, bookmark or reach with the back button is an address.
 *
 * `replace`, NOT `push`, for filter edits: dragging a range through five
 * values should not put five entries in the browser's history. A RUN is a
 * navigation and gets its own entry, because going back to the previous
 * result set is exactly what somebody means by back.
 *
 * THE PREVIOUS STATE IS REMEMBERED FOR ONE UNDO. Chat applies a patch the
 * customer did not type key by key, so there has to be a way back to what they
 * had. One step, in memory — anything deeper is the back button's job.
 */
export function useFilterState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();

  const filters = useMemo(() => readFilters(new URLSearchParams(query)), [query]);
  const previous = useRef<FilterState | null>(null);

  const write = useCallback(
    (next: FilterState) => {
      const url = writeFilters(next, new URLSearchParams(query));
      router.replace(`${pathname}?${url}`, { scroll: false });
    },
    [pathname, query, router],
  );

  /** Apply a patch, remembering what it replaced so it can be undone once. */
  const apply = useCallback(
    (patch: Partial<FilterState>) => {
      const changed = changedKeys(filters, patch);
      if (changed.length === 0) return { changed, needsRun: false };
      previous.current = filters;
      write({ ...filters, ...patch });
      return { changed, needsRun: touchesRun(filters, patch) };
    },
    [filters, write],
  );

  const undo = useCallback(() => {
    if (!previous.current) return false;
    const target = previous.current;
    previous.current = null;
    write(target);
    return true;
  }, [write]);

  const clear = useCallback(
    (key: keyof FilterState) => {
      previous.current = filters;
      write(clearChip(filters, key));
    },
    [filters, write],
  );

  const reset = useCallback(() => {
    previous.current = filters;
    const url = new URLSearchParams(query);
    for (const key of Object.keys(filters)) url.delete(key);
    router.replace(url.toString() ? `${pathname}?${url}` : pathname, { scroll: false });
  }, [filters, pathname, query, router]);

  return {
    filters,
    /** The query string, for posting the same state the URL holds. */
    query,
    apply,
    clear,
    reset,
    undo,
    canUndo: previous.current !== null,
  };
}
