import type { RelevanceContext } from './requirements';

/**
 * The brief, reduced to a string that changes when the question changes.
 *
 * A stored analysis is stale for two independent reasons: the EVIDENCE was
 * recollected, or the BRIEF was edited. The first is a timestamp comparison.
 * The second needs this — an answer written against "a GBP 180 hand grinder" is
 * not an answer about "a GBP 40 travel kettle", however current its figures are.
 *
 * Only the fields that change the ANSWER are included. A campaign's name or a
 * brand's website can be corrected without invalidating an assessment, and
 * including them would make every typo fix look like a new question.
 */
export function contextFingerprint(context: RelevanceContext): string {
  const parts = [
    'b',
    context.brand.id,
    context.brand.sells ?? '',
    context.brand.categories.join('|'),
    context.brand.customerNeeds ?? '',
    context.brand.contentLanguages.join('|'),
    context.brand.markets.join('|'),
    'c',
    context.campaign?.id ?? '',
    context.campaign?.product ?? '',
    context.campaign?.useCase ?? '',
    context.campaign?.objective ?? '',
    context.campaign?.avoidTopics ?? '',
  ];
  return hash(parts.join('\u0000'));
}

/**
 * A short, stable digest. FNV-1a rather than a crypto hash: this decides
 * whether to show "the brief has changed", not whether to trust anything, and a
 * 64-bit digest in hex is small enough to read in a database row.
 */
function hash(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((code << 5) | (code >>> 3)), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export type Freshness = 'current' | 'evidence_changed' | 'brief_changed' | 'missing';

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  current: 'Current',
  evidence_changed: 'Evidence recollected since this was written',
  brief_changed: 'The brief has changed since this was written',
  missing: 'Not analysed yet',
};

/**
 * Is a stored analysis still about the question being asked?
 *
 * Evidence is checked first: a recollection replaces the figures every claim
 * rests on, so it outranks a brief edit that may have changed one word.
 */
export function freshnessOf(
  stored: { evidenceFetchedAt: string; contextFingerprint: string } | null,
  currentEvidenceAt: string,
  currentFingerprint: string,
): Freshness {
  if (!stored) return 'missing';
  if (stored.evidenceFetchedAt !== currentEvidenceAt) return 'evidence_changed';
  if (stored.contextFingerprint !== currentFingerprint) return 'brief_changed';
  return 'current';
}
