import 'server-only';

import { AiError, aiModel, generateStructured } from '@/lib/ai/provider';
import type { CommentCluster, CommentRisk, Promotion } from '@/types';

/**
 * How one channel reads against one brief.
 *
 * WHAT THIS MAY AND MAY NOT SAY is the whole design. Without a creator's
 * authorisation there are no demographics, no conversions and no revenue —
 * only public uploads and public comments — and a read that implies otherwise
 * is worse than no read, because a buyer will act on it.
 *
 * So the schema forces every claim to name its evidence, and the prompt is
 * told the specific overreaches to refuse. `confidence` exists so the model
 * can decline: a candidate with 40 comments and no sponsored history is not a
 * weak fit, it is an unknown one, and those are different purchases.
 */

export interface CandidateFit {
  /** One line a buyer could paste into a deck. */
  verdict: string;
  /** Topic overlap between what this channel makes and what the brand sells. */
  relevance: string;
  /** What the comments show about interest and questions. Never conversion. */
  audienceSignal: string;
  /** Sponsored history, or the absence of one, said plainly. */
  sponsorshipRead: string;
  /** Concrete brand-safety findings with their basis, or an explicit absence. */
  brandRisk: string;
  /** Collaboration angles that follow from what was actually observed. */
  suggestedAngles: string[];
  /** What a buyer should confirm before signing. */
  beforeYouSign: string[];
  /** Honest self-assessment of how much the evidence supports. */
  confidence: 'insufficient' | 'directional' | 'supported';
  /** Why, when confidence is not 'supported'. Null when it is. */
  confidenceReason: string | null;
}

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    verdict: { type: 'string', description: 'One sentence a buyer could paste into a deck.' },
    relevance: { type: 'string', description: 'Topic overlap with the brand, from the uploads and clusters given.' },
    audienceSignal: {
      type: 'string',
      description:
        'What the comments show about interest and questions. Describe COMMENTERS, never viewers, and never predict conversion.',
    },
    sponsorshipRead: { type: 'string', description: 'Sponsored history or its absence, with the disclosure basis.' },
    brandRisk: { type: 'string', description: 'Findings with their basis, or an explicit statement that none were found and over what corpus.' },
    suggestedAngles: { type: 'array', items: { type: 'string' }, description: '2-4 concrete angles.' },
    beforeYouSign: { type: 'array', items: { type: 'string' }, description: '2-4 things to confirm with the creator.' },
    confidence: { type: 'string', enum: ['insufficient', 'directional', 'supported'] },
    confidenceReason: { type: 'string', description: 'Why, or the exact string NONE when confidence is supported.' },
  },
  required: [
    'verdict', 'relevance', 'audienceSignal', 'sponsorshipRead',
    'brandRisk', 'suggestedAngles', 'beforeYouSign', 'confidence', 'confidenceReason',
  ],
};

const SYSTEM = `You advise an advertiser deciding whether to work with a YouTube creator.

You are given PUBLIC data only — uploads, view counts, public comments, and
YouTube's own paid-placement disclosures — plus the advertiser's brief. You
have no analytics access, no demographics, no conversion data and no revenue
data, and you must never write as though you do.

REFUSE THESE SPECIFICALLY. They are the ways this read goes wrong:

- Never describe the AUDIENCE from comments. People who comment are a small,
  self-selected slice of who watches. Say "commenters", and say how many.
- Never turn purchase-related language into a conversion or sales prediction.
  "Where can I buy this" is interest expressed in a comment; it is not a
  purchase and not a rate.
- Never state age, gender or location of viewers. You have not been given
  them and nothing public supplies them.
- Never call a video sponsored unless the disclosure says so. An inferred
  marker is a guess and must be worded as one.
- Never attribute a view difference to sponsorship as cause. A sponsored post
  performing differently is an observation, not an effect.
- Never invent a fee, a CPM or a rate. If none was supplied, say pricing was
  not provided.

CONFIDENCE IS A REAL ANSWER. Use "insufficient" when the corpus is too thin or
the classifier has not run — a candidate nobody can assess is not a weak
candidate, and telling a buyer the difference is the most useful thing here.
Every figure you cite must be one you were given. Under 45 words per field.`;

export interface CandidateFitInput {
  brief: {
    name: string;
    brand: string | null;
    product: string | null;
    audience: string | null;
    objective: string | null;
    avoidTopics: string | null;
  };
  channel: {
    title: string;
    handle: string | null;
    description: string | null;
    subscribers: number | null;
    medianViews: number | null;
    engagementRate: number | null;
    uploadsInWindow: number | null;
    windowDays: number | null;
  };
  comments: {
    analysed: number;
    scanned: number | null;
    sentiment: number | null;
    purchaseIntentRate: number | null;
    intentBasis: string | null;
    /** How many comments the rate is over. A rate over four is not a finding. */
    intentScored: number | null;
    clusters: CommentCluster[];
    risks: CommentRisk[];
  };
  promotions: Promotion[];
  /** Only when the customer supplied one. Never derived. */
  proposedFee: { amount: number; currency: string } | null;
}

function brief(input: CandidateFitInput): string {
  const { brief: b, channel: c, comments: m, promotions, proposedFee } = input;
  const lines = [
    `# The advertiser's brief`,
    `Campaign: ${b.name}`,
    b.brand ? `Brand: ${b.brand}` : 'Brand: not stated',
    b.product ? `What they sell: ${b.product}` : 'What they sell: not stated',
    b.audience ? `Who they sell to: ${b.audience}` : 'Who they sell to: not stated',
    b.objective ? `Objective: ${b.objective}` : 'Objective: not stated',
    b.avoidTopics ? `Will not be placed beside: ${b.avoidTopics}` : '',
    '',
    `# The channel (public data)`,
    `${c.title}${c.handle ? ` (${c.handle})` : ''}`,
    c.description ? `Channel description: ${c.description.slice(0, 500)}` : '',
    c.subscribers === null ? 'Subscribers: hidden' : `Subscribers: ${c.subscribers}`,
    c.medianViews === null ? '' : `Median views per upload: ${c.medianViews}`,
    c.engagementRate === null
      ? ''
      : `Engagement rate (likes+comments over views): ${(c.engagementRate * 100).toFixed(2)}%`,
    c.uploadsInWindow !== null && c.windowDays !== null
      ? `Uploads read: ${c.uploadsInWindow} over ${c.windowDays} days`
      : '',
    '',
    `# Comments (public, and a self-selected slice of viewers)`,
    `Comments read: ${m.analysed}`,
    m.scanned === null ? '' : `Comments the safety scan read: ${m.scanned}`,
    m.sentiment === null
      ? 'Sentiment: NOT MEASURED — the classifier has not run on this channel'
      : `Sentiment of commenters: ${m.sentiment.toFixed(0)}/100`,
    m.purchaseIntentRate === null
      ? 'Purchase-related language: NOT MEASURED'
      : `Comments containing purchase-related language: ${(m.purchaseIntentRate * 100).toFixed(1)}% of ${
          m.intentScored ?? 'an unstated number of'
        } comments (basis: ${m.intentBasis ?? 'unstated'}). ${
          m.intentScored !== null && m.intentScored < 40
            ? 'THAT DENOMINATOR IS TOO SMALL TO GENERALISE FROM — say so rather than quoting the percentage as a finding.'
            : ''
        }`.trim(),
    m.clusters.length
      ? `What commenters talk about:\n${m.clusters
          .slice(0, 8)
          .map((c2) => `- ${c2.label}: ${Math.round(c2.share * 100)}% (${c2.commentCount})`)
          .join('\n')}`
      : 'Comment clustering: NOT RUN',
    m.risks.length
      ? `Safety findings over ${m.scanned ?? 'an unstated number of'} comments:\n${m.risks
          .map((r) => `- ${r.category}: ${r.count}, of which ${r.byCreator} written by the creator`)
          .join('\n')}`
      : 'Safety findings: none found in what was scanned',
    '',
    `# Sponsored history`,
    promotions.length === 0
      ? 'No paid placement found in the uploads read. That is what was read, not a claim that none exists.'
      : promotions
          .slice(0, 10)
          .map(
            (p) =>
              `- "${p.title}" · disclosure: ${p.disclosure}${
                p.disclosure === 'explicit'
                  ? ' (the creator flagged it to YouTube)'
                  : p.disclosure === 'affiliate'
                    ? ' (tracked link, NOT disclosed)'
                    : ' (text marker only — a guess)'
              }${p.views === null ? '' : ` · ${p.views} views`}`,
          )
          .join('\n'),
    '',
    proposedFee
      ? `# Pricing\nThe advertiser was quoted ${proposedFee.amount} ${proposedFee.currency} for a placement. Nothing public reveals a creator's rate; this figure came from the advertiser.`
      : '# Pricing\nNo fee supplied. Do not estimate one.',
  ];
  return lines.filter(Boolean).join('\n');
}

export async function readCandidate(
  input: CandidateFitInput,
): Promise<{ ok: true; fit: CandidateFit; model: string } | { ok: false; reason: string }> {
  try {
    const { data } = await generateStructured<CandidateFit>({
      system: SYSTEM,
      // The channel half is the cacheable half: one channel is read against
      // several briefs by the same customer, and only the brief changes.
      cachedUser: brief(input).split('# The advertiser')[0] || undefined,
      user: brief(input),
      schema: SCHEMA,
      toolName: 'record_candidate_fit',
      maxTokens: 4_000,
    });
    return {
      ok: true,
      fit: {
        ...data,
        confidenceReason:
          data.confidenceReason?.trim().toUpperCase() === 'NONE' ? null : data.confidenceReason,
      },
      model: aiModel(),
    };
  } catch (error) {
    if (error instanceof AiError) return { ok: false, reason: error.message };
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
