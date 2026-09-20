/**
 * What a call to the Data API actually costs, read off Google's own table
 * rather than remembered.
 *
 * `client.ts` has carried `COST = { search: 100 }` since it was written, which
 * is the figure everyone knows. IT IS NOT WHAT THE TABLE SAYS TODAY. Fetched
 * from developers.google.com/youtube/v3/determine_quota_cost on 2026-09-20,
 * the `search` / `list` cell reads, verbatim:
 *
 *     "100 quota per day. Each call costs 1 quota."
 *
 * — a separate DAILY CAP ON SEARCH CALLS, not a hundred units burned per call.
 * `videos` / `insert` carries the identical sentence; every other list method
 * on the page is still a flat 1.
 *
 * WHY BOTH READINGS ARE IMPLEMENTED. One sentence on one page, scraped once,
 * is not enough to bet a feature's budget on in either direction. Reading it
 * the new way and being wrong exhausts a shared 10,000-unit budget in a
 * hundred searches and takes channel analysis down with it. Reading it the old
 * way and being wrong throttles discovery to a tenth of what the operator is
 * entitled to. So the ledger tracks TWO numbers — units, and search calls —
 * and a run stops at whichever bound it reaches first. That is correct under
 * either reading, costs nothing but a counter, and means the day the table
 * changes again only `SEARCH_COST_UNITS` moves.
 *
 * None of this is a quota WORKAROUND. There is one project, one key, one
 * budget; these numbers only decide when to stop.
 */

/** Verbatim, so a future reader can see what was read and when. */
export const SEARCH_COST_SOURCE = {
  url: 'https://developers.google.com/youtube/v3/determine_quota_cost',
  readAt: '2026-09-20',
  cell: '100 quota per day. Each call costs 1 quota.',
} as const;

/**
 * Units charged for one `search.list` call.
 *
 * 1 is what the table says now. Set `ADFIT_YOUTUBE_SEARCH_UNITS=100` to bill it
 * the historical way — an operator whose console disagrees with the doc should
 * believe the console.
 */
export const SEARCH_COST_UNITS = 1;

/**
 * Search calls available in a day, from the same cell. Independent of units.
 * This is the bound that actually binds discovery: every mode here is built out
 * of searches, and a hundred of them is not many.
 */
export const SEARCH_CALLS_PER_DAY = 100;

/** Documented cost of everything else this product calls. All 1. */
export const LIST_COST_UNITS = 1;

export interface QuotaBudget {
  /** Units this run may spend in total. */
  units: number;
  /** `search.list` calls this run may make. */
  searchCalls: number;
}

export interface QuotaSpend {
  units: number;
  searchCalls: number;
  otherCalls: number;
}

export type QuotaStop = 'units' | 'search_calls' | null;

/**
 * A run's own meter.
 *
 * Deliberately per-run and not a global day counter: this process does not own
 * the project's quota — the channel-analysis worker, the trending chart and any
 * other deployment share it — so a number kept here could only ever be a guess
 * at the day's total, and a guess presented as a budget is worse than a bound.
 * What this CAN say truthfully is how much THIS run spent and why it stopped,
 * and that is what the result reports.
 */
export class QuotaLedger {
  private spend: QuotaSpend = { units: 0, searchCalls: 0, otherCalls: 0 };

  constructor(private readonly budget: QuotaBudget) {}

  /** Would one more search fit? Asked BEFORE the call, never after. */
  canSearch(): boolean {
    return (
      this.spend.searchCalls < this.budget.searchCalls &&
      this.spend.units + searchUnits() <= this.budget.units
    );
  }

  canRead(count = 1): boolean {
    return this.spend.units + LIST_COST_UNITS * count <= this.budget.units;
  }

  recordSearch(): void {
    this.spend.searchCalls += 1;
    this.spend.units += searchUnits();
  }

  recordRead(count = 1): void {
    this.spend.otherCalls += count;
    this.spend.units += LIST_COST_UNITS * count;
  }

  /**
   * Why a run stopped, or null if it did not. A partial result has to be able
   * to say which bound it hit — "we stopped early" with no reason reads as a
   * failure, and this is not one.
   */
  exhausted(): QuotaStop {
    if (this.spend.searchCalls >= this.budget.searchCalls) return 'search_calls';
    if (this.spend.units + searchUnits() > this.budget.units) return 'units';
    return null;
  }

  read(): QuotaSpend {
    return { ...this.spend };
  }
}

function searchUnits(): number {
  const raw = process.env.ADFIT_YOUTUBE_SEARCH_UNITS;
  if (!raw || raw.trim() === '') return SEARCH_COST_UNITS;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : SEARCH_COST_UNITS;
}

/** The unit cost this deployment is currently billing a search at. */
export const searchUnitCost = searchUnits;
