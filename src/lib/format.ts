const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function compactNumber(value: number): string {
  return COMPACT.format(value);
}

export function exactNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function percent(value: number, fractionDigits = 1): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function score(value: number, fractionDigits = 1): string {
  return value.toFixed(fractionDigits);
}

export function currency(value: number, code = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Explicit UTC so server and client render the same string. */
export function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

export function relativeDays(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/**
 * Deterministic bar heights for locked placeholder geometry, seeded from the
 * creator id so server and client agree. Decoration standing in for data the
 * visitor is not entitled to — never a real value.
 */
export function placeholderBars(seed: string, count: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return Array.from({ length: count }, () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return 0.25 + (Math.abs(h % 1000) / 1000) * 0.7;
  });
}

/**
 * Comment- and mention-level sentiment runs −1 (hostile) to +1 (enthusiastic),
 * while `sentimentScore` runs 0–100. Two scales in one
 * report is a reading hazard, so the signed one is always rendered with its
 * range stated nearby — see SENTIMENT_SCALE.
 */
export const SENTIMENT_SCALE = 'sentiment −1 to +1';

export function signedSentiment(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
}

/**
 * A readable axis maximum for a set of shares.
 *
 * Scaling bars to the largest value fills the track, but then the leader is a
 * *full* bar — and a full bar reads as "all of it" whatever number is printed
 * beside it. 61% drawn edge to edge is a lie the eye believes before it reaches
 * the label.
 *
 * So the axis is rounded up to a readable step at least `headroom`× above the
 * peak. The leader lands around two-thirds to four-fifths of the track: the
 * space is used, the relative shape is exact, and nothing reads as complete.
 * Callers state the resulting maximum so the scale is never implicit.
 */
const AXIS_STEPS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 0.8, 1];

export function axisMax(peak: number, headroom = 1.25): number {
  if (!Number.isFinite(peak) || peak <= 0) return 1;
  const needed = peak * headroom;
  return AXIS_STEPS.find((step) => step >= needed) ?? 1;
}

/** "0–60%" — the label that goes with `axisMax`. */
export function axisLabel(max: number): string {
  return `0–${Math.round(max * 100)}%`;
}

/**
 * Guards a URL that came from stored pipeline output before it is rendered as
 * a clickable link. Anything but http/https is dropped — a `javascript:` href
 * written into a jsonb column would otherwise execute on click.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** "youtube.com" — shown beside an outbound link so the destination is visible. */
export function linkHost(raw: string | null | undefined): string | null {
  const safe = safeExternalUrl(raw);
  if (!safe) return null;
  try {
    return new URL(safe).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Round a set of fractions to integers that sum to exactly `total`.
 *
 * Rounding each share on its own is why a five-bucket split prints 99% or
 * 101%: 29.67 + 54.59 + 10.10 + 5.06 + 0.59 rounds to 30 + 55 + 10 + 5 + 1.
 * Largest remainder (Hamilton) floors every value, then hands the leftover
 * points to whichever buckets were cut hardest, so the printed figures
 * reconcile with the printed whole.
 *
 * Input need not be normalised; anything that does not sum to 1 is scaled.
 * Returns integers in the order given.
 */
export function largestRemainder(values: number[], total = 100): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(sum) || sum <= 0) return values.map(() => 0);

  const exact = values.map((v) => (v / sum) * total);
  const floors = exact.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem);

  const out = [...floors];
  for (let k = 0; left > 0 && k < order.length; k += 1, left -= 1) {
    out[order[k].i] += 1;
  }
  return out;
}

/**
 * A creator's asking range, said the way they gave it.
 *
 * Four states and each one means something different, so none of them may
 * collapse into another: a range, a floor with no ceiling ("from X" — still
 * true, and inventing a ceiling from a multiple would not be), "open to
 * offers", and nothing published at all. The last two look alike and are not:
 * one is a choice the creator made, the other is a blank.
 */
export function budgetRange(
  creator: { budgetMin: number | null; budgetMax: number | null; budgetNegotiable: boolean },
  code = 'USD',
): string | null {
  const { budgetMin, budgetMax, budgetNegotiable } = creator;
  if (budgetMin !== null && budgetMax !== null) {
    return `${currency(budgetMin, code)}–${currency(budgetMax, code)}`;
  }
  if (budgetMin !== null) return `from ${currency(budgetMin, code)}`;
  if (budgetNegotiable) return 'open to offers';
  return null;
}
