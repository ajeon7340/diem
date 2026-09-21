import { matchedTerms } from '@/lib/discovery/candidates';
import type { ChannelReportView } from '@/lib/channel/report';
import type { VideoEvidence } from '@/lib/ingest/analyze';

/**
 * What a brand needs, checked one requirement at a time against collected
 * evidence.
 *
 * THIS IS THE HONEST HALF OF A RELEVANCE ANALYSIS, and it is deterministic on
 * purpose. Every row is a term the customer wrote in their own brand or
 * campaign, looked for in text this collection actually retrieved, with the
 * matching videos cited. No model, no gate, nothing derived — the same
 * category of operation discovery already performs when it reports which query
 * terms appear in a title.
 *
 * FOUR STATUSES, AND THE THIRD IS THE ONE THAT MATTERS:
 *
 *   supported     the evidence shows it, and names which videos
 *   partial       some evidence, not enough to call it settled
 *   unverified    NOT A MISMATCH. Public data cannot answer this, or this
 *                 sample did not happen to cover it. A buyer reading an
 *                 unverified row should reach for the phone, not cross the
 *                 creator off.
 *   conflicting   the evidence points the other way, and cites where
 *
 * "SUPPORTED" IS ABOUT ONE REQUIREMENT. It is not an endorsement of the
 * creator, and the label says as much wherever it is rendered.
 *
 * WHAT NO ROW HERE MAY EVER CLAIM: that a title proves the product was used or
 * endorsed, that content language establishes where the audience is, that
 * YouTube's paid-promotion flag names an advertiser, or that having made a
 * format before means they will offer it again.
 */

export type RequirementStatus = 'supported' | 'partial' | 'unverified' | 'conflicting';

export const STATUS_LABEL: Record<RequirementStatus, string> = {
  supported: 'Supported',
  partial: 'Partly supported',
  unverified: 'Unverified',
  conflicting: 'Conflicting evidence',
};

export interface RequirementRow {
  id: string;
  /** What the brand or campaign asked for, in the customer's own words. */
  requirement: string;
  /** Where it came from, so a reader can go and change it. */
  source: 'brand' | 'campaign';
  status: RequirementStatus;
  /** One line. Never longer, never a paragraph. */
  finding: string;
  /** Video ids from the collected sample. Required for supported/conflicting. */
  evidence: string[];
  /** The question this row leaves open. Always present. */
  confirm: string;
}

export interface RelevanceContext {
  brand: {
    id: string;
    name: string;
    sells: string | null;
    categories: string[];
    customerNeeds: string | null;
    contentLanguages: string[];
    markets: string[];
  };
  campaign: {
    id: string;
    name: string;
    product: string | null;
    useCase: string | null;
    objective: string | null;
    avoidTopics: string | null;
  } | null;
}

/** Words worth looking for. Short ones match everything and mean nothing. */
export function terms(text: string | null | undefined, max = 8): string[] {
  return [
    ...new Set(
      (text ?? '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length >= 4)
        .map((word) => word.toLowerCase()),
    ),
  ].slice(0, max);
}

function searchable(report: ChannelReportView): { video: VideoEvidence; text: string }[] {
  return report.videos.map((video) => ({ video, text: video.title }));
}

/** Videos whose retrieved text contains any of these terms. */
function hits(report: ChannelReportView, wanted: string[]): { ids: string[]; matched: string[] } {
  const ids: string[] = [];
  const matched = new Set<string>();
  for (const { video, text } of searchable(report)) {
    const found = matchedTerms(wanted, text);
    if (found.length === 0) continue;
    ids.push(video.id);
    for (const term of found) matched.add(term);
  }
  return { ids, matched: [...matched] };
}

/**
 * Build the matrix.
 *
 * REQUIREMENTS COME FROM THE CONTEXT, never from a generic checklist. A brand
 * that named no categories gets no category row — an empty row is a question
 * nobody asked, and it makes the matrix look thorough while saying nothing.
 */
export function requirementMatrix(
  report: ChannelReportView,
  context: RelevanceContext,
): RequirementRow[] {
  const rows: RequirementRow[] = [];
  const { brand, campaign } = context;
  const sampled = report.videos.length;
  const bounded = `this sample of ${sampled} upload${sampled === 1 ? '' : 's'}`;

  // --- What the creator publishes about ------------------------------------
  for (const category of brand.categories.slice(0, 3)) {
    const { ids } = hits(report, [category, ...terms(category, 3)]);
    rows.push({
      id: `category:${category}`,
      requirement: `Publishes about ${category}`,
      source: 'brand',
      status: ids.length >= 2 ? 'supported' : ids.length === 1 ? 'partial' : 'unverified',
      finding:
        ids.length === 0
          ? `No upload title in ${bounded} names this category.`
          : `${ids.length} upload title${ids.length === 1 ? '' : 's'} in ${bounded} name${ids.length === 1 ? 's' : ''} it.`,
      evidence: ids.slice(0, 4),
      confirm:
        ids.length === 0
          ? 'Ask what share of their output covers this category — the sample is bounded.'
          : 'Titles show the subject was covered, not how it was treated. Watch one before deciding.',
    });
  }

  // --- The product and the problem it solves --------------------------------
  const productText = campaign?.product ?? brand.sells;
  if (productText) {
    const wanted = terms(productText);
    const { ids, matched } = hits(report, wanted);
    rows.push({
      id: 'product',
      requirement: `Covers the product: ${truncate(productText, 70)}`,
      source: campaign?.product ? 'campaign' : 'brand',
      status: ids.length >= 2 ? 'supported' : ids.length === 1 ? 'partial' : 'unverified',
      finding:
        ids.length === 0
          ? `No title in ${bounded} names a word from the product description.`
          : `${ids.length} title${ids.length === 1 ? '' : 's'} name ${matched.slice(0, 3).map((t) => `“${t}”`).join(', ')}.`,
      evidence: ids.slice(0, 4),
      // The line that must never be lost: a title is metadata, not a viewing.
      confirm:
        'A title naming the product is not evidence the creator has used it or would endorse it. Ask what they have actually used.',
    });
  }

  const needText = campaign?.useCase ?? brand.customerNeeds;
  if (needText) {
    const wanted = terms(needText);
    const { ids, matched } = hits(report, wanted);
    rows.push({
      id: 'useCase',
      requirement: `Speaks to the use case: ${truncate(needText, 70)}`,
      source: campaign?.useCase ? 'campaign' : 'brand',
      status: ids.length >= 2 ? 'supported' : ids.length === 1 ? 'partial' : 'unverified',
      finding:
        ids.length === 0
          ? `Nothing in ${bounded} names a word from this use case.`
          : `${ids.length} upload${ids.length === 1 ? '' : 's'} name ${matched.slice(0, 3).map((t) => `“${t}”`).join(', ')}.`,
      evidence: ids.slice(0, 4),
      confirm: 'Confirm the audience they make this for is the one you are trying to reach.',
    });
  }

  // --- Things to stay away from --------------------------------------------
  if (campaign?.avoidTopics) {
    const wanted = terms(campaign.avoidTopics);
    const { ids, matched } = hits(report, wanted);
    rows.push({
      id: 'avoid',
      requirement: `Avoids: ${truncate(campaign.avoidTopics, 70)}`,
      source: 'campaign',
      // A hit here is genuinely a conflict, and it cites where.
      status: ids.length > 0 ? 'conflicting' : 'unverified',
      finding:
        ids.length > 0
          ? `${ids.length} title${ids.length === 1 ? '' : 's'} in ${bounded} name${ids.length === 1 ? 's' : ''} ${matched.slice(0, 3).map((t) => `“${t}”`).join(', ')}.`
          : `Nothing in ${bounded} names these topics — but the sample is bounded and titles are not the whole video.`,
      evidence: ids.slice(0, 4),
      confirm:
        ids.length > 0
          ? 'Read these before deciding — a title can name a topic in order to criticise it.'
          : 'A clean sample is not a clean channel. Ask directly if this matters.',
    });
  }

  // --- Disclosed sponsorship experience ------------------------------------
  const disclosed = report.promotions.filter((p) => p.disclosure === 'explicit');
  rows.push({
    id: 'sponsorship',
    requirement: 'Has run disclosed paid promotions',
    source: 'brand',
    status: disclosed.length > 0 ? 'supported' : 'unverified',
    finding:
      disclosed.length > 0
        ? `${disclosed.length} upload${disclosed.length === 1 ? '' : 's'} in ${bounded} carr${disclosed.length === 1 ? 'ies' : 'y'} YouTube’s paid-promotion flag.`
        : `No upload in ${bounded} carries the flag.`,
    evidence: disclosed.slice(0, 4).map((p) => p.postId),
    // The flag marks the video. It does not name who paid.
    confirm:
      disclosed.length > 0
        ? 'The flag does not say which brand paid. Ask who the sponsors were and whether any exclusivity still applies.'
        : 'Absence in a bounded sample is not a record of never having run one. Ask directly.',
  });

  // --- Content language, which is not audience geography --------------------
  if (brand.contentLanguages.length || brand.markets.length) {
    rows.push({
      id: 'language',
      requirement: brand.contentLanguages.length
        ? `Publishes in ${brand.contentLanguages.join(', ')}`
        : `Relevant to ${brand.markets.join(', ')}`,
      source: 'brand',
      // Always unverified, and the finding says why rather than leaving a blank.
      status: 'unverified',
      finding:
        'Public metadata in this sample does not declare a content language, and nothing public shows where an audience is.',
      evidence: [],
      confirm:
        'Ask which language they publish in and which markets they hear from. Language is not a location, and adfit cannot see either.',
    });
  }

  // --- The objective, which public data cannot settle ----------------------
  if (campaign?.objective) {
    rows.push({
      id: 'objective',
      requirement: `Suits the objective: ${truncate(campaign.objective, 70)}`,
      source: 'campaign',
      status: 'unverified',
      finding: 'Public data shows what was published, not what it achieved for a brand.',
      evidence: [],
      confirm: 'Ask for results from a comparable past collaboration, and how they were measured.',
    });
  }

  return rows;
}

/** A one-line count for the matrix header. Never a percentage or a score. */
export function statusCounts(rows: RequirementRow[]): Record<RequirementStatus, number> {
  const counts: Record<RequirementStatus, number> = {
    supported: 0, partial: 0, unverified: 0, conflicting: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/**
 * Up to three uploads that support a requirement, each tied to the one it
 * supports.
 *
 * NOT "the most popular videos". A relevance card that falls back to whatever
 * got the most views when nothing matched would be presenting unrelated
 * content as evidence, which is the one thing this section must not do. When
 * nothing matches, this returns nothing and the surface says so.
 */
export interface RelevantVideo {
  video: VideoEvidence;
  /** The requirement this upload is evidence for. */
  requirement: string;
  /** Why, in one line, grounded in the retrieved metadata. */
  because: string;
}

export function relevantVideos(
  report: ChannelReportView,
  rows: RequirementRow[],
  limit = 3,
): RelevantVideo[] {
  const byId = new Map(report.videos.map((v) => [v.id, v]));
  const out: RelevantVideo[] = [];
  const used = new Set<string>();

  // Supported rows first, then partial. A conflicting row's evidence belongs in
  // the matrix, not in a card headed "reasons to consider".
  for (const status of ['supported', 'partial'] as const) {
    for (const row of rows.filter((r) => r.status === status)) {
      for (const id of row.evidence) {
        if (out.length >= limit || used.has(id)) continue;
        const video = byId.get(id);
        if (!video) continue;
        used.add(id);
        out.push({
          video,
          requirement: row.requirement,
          because: `Its title matches this requirement. Metadata only — adfit has not watched it.`,
        });
      }
    }
  }
  return out;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
