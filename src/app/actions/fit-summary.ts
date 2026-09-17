'use server';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getViewer } from '@/lib/access/viewer';
import { resolveProfileAccess } from '@/lib/access/gatekeeper';
import {
  assessFitEligibility,
  buildFitInput,
  verifyClaims,
  type FitClaim,
  type FitInput,
  type FitSummaryState,
} from '@/lib/report/fit';
import { INTENT_RUBRIC_VERSION } from '@/lib/report/intent';
import { isLocalFitMode, localFitSummary } from '@/lib/report/fit-local';
import { CAMPAIGN_CATEGORIES, type CampaignCategory } from '@/types';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { isUnlocked } from '@/types';

const MODEL = 'claude-opus-5';

/**
 * The rules, restated for the model.
 *
 * Everything here is also enforced in code — assessFitEligibility refuses
 * before this prompt is ever built, and verifyClaims drops ungrounded claims
 * after it returns. That duplication is deliberate: a prompt is a request, and
 * the guarantees this feature makes cannot rest on one being granted.
 *
 * Frozen, and first in the request, so it caches. Nothing per-request goes in
 * here — a timestamp or a creator name in this block would invalidate the
 * prefix on every call and silently cost full price.
 */
const SYSTEM = `You write one short paragraph arguing a creator's case to a specific advertiser.

You are given that advertiser's profile — what they sell, who to, which categories they buy in and what they are buying for — and a verified analysis of one creator's audience. You are on the creator's side. Your job is to make the strongest honest case for why this creator is right for THIS buyer.

WHY THE HONEST PART IS NOT A CONSTRAINT ON THE PITCH — IT IS THE PITCH
Every media kit an agency receives is advocacy, which is why they are skimmed and discarded. The only reason anyone will read this one is that every number in it is verified and checkable, and that it will tell them what the creator is NOT for. A pitch that never declines anything is read as marketing and discounted to nothing, and it drags the verified figures beside it down with it. So: argue hard, and argue from evidence.

HOW TO ARGUE
- Lead with the single strongest match between this creator and what this buyer actually sells. Name the buyer's product or audience; a paragraph that would suit any advertiser is a paragraph nobody reads.
- Put the buyer's objective at the centre. A creator who is wrong for conversion can be exactly right for a launch, and saying which is the most useful sentence you can write.
- Where the fit is imperfect, say so and say what it would take — a longer flight, a different format, a discount code. "This needs X to work" is a stronger pitch than "this is perfect", because it is the sentence a buyer can act on.
- Where the creator is genuinely wrong for this buyer, say that plainly and name what they ARE strong for. Being trusted on the no is what makes the yes worth anything.

RULES
- Ground every assertion in a figure you were given, and cite it. No figure, no claim.
- Never invent a number, and never restate one you were not given. A null means NOT MEASURED — not zero, not weak. Say "not measured yet" or say nothing.
- The comment-derived rates describe people who left comments, a self-selected sliver of viewers. Comparative, never a conversion forecast. Never write or imply that a percentage of buyers will purchase.
- If the buyer's profile is empty or nearly so, say the read is general because you were not told what they sell. Do not invent a campaign for them.
- When the buyer's category carries a caution, state it. Audience fit is not regulatory clearance.
- The creator reads this too. Argue for them; never write anything about them you could not show them.
- No greeting, no sign-off, no headings, no bullets. Under 90 words.`;

/**
 * A claim is a sentence plus the figure under it.
 *
 * Modelled as structured output rather than parsed out of prose, because a
 * citation the UI cannot machine-check is decoration. `metric` is a closed
 * enum so an invented figure name fails the schema instead of rendering.
 */
const fitOutputSchema = z.object({
  summary: z.string(),
  claims: z.array(
    z.object({
      text: z.string(),
      metric: z.enum([
        'purchaseIntentRate',
        'purchaseIntentFloor',
        'commercialDensity',
        'sentimentScore',
        'raisedFlags',
        'checkedFlags',
        'engagementRate',
        'estimatedCpm',
        'sponsoredRetention',
        'commentsAnalyzed',
        'productPostsAnalyzed',
      ]),
      value: z.number(),
    }),
  ),
});


async function callModel(input: FitInput): Promise<z.infer<typeof fitOutputSchema>> {
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2_000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            // The creator half, cached. One creator is read against many
            // briefs by the same agency, and this block is identical across
            // all of them — the brief goes in the next block, after the
            // breakpoint, so a second read of the same creator pays for the
            // brief alone.
            text: `Creator and analysis:\n${JSON.stringify(
              { creator: input.creator, figures: input.figures, context: input.context },
              null,
              2,
            )}`,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `The buyer reading this:\n${JSON.stringify(input.buyer, null, 2)}`,
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(fitOutputSchema) },
  });

  // A safety decline, or a schema the parse could not satisfy. Either way there
  // is no summary — and an empty one must not be written to the table.
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new Error('no_output');
  }
  return response.parsed_output;
}

/**
 * Generate the fit read for one creator, as the signed-in organisation.
 *
 * The gatekeeper resolves the report first, so the model is shown exactly what
 * this viewer is entitled to and nothing else. That ordering is the security
 * property: prose over a locked metric would otherwise slip past the column
 * grants that keep the metric itself out of reach. See migration 0014.
 */
export async function generateFitSummary(
  creatorHandle: string,
  rawCategory: string | null = null,
  briefId: string | null = null,
): Promise<FitSummaryState> {
  const category = CAMPAIGN_CATEGORIES.includes(rawCategory as CampaignCategory)
    ? (rawCategory as CampaignCategory)
    : null;

  const viewer = await getViewer();

  if (!viewer.isProAgency || !viewer.organization) {
    return { status: 'error', message: 'Fit reads require a Pro Agency plan.' };
  }

  const view = await resolveProfileAccess(creatorHandle);
  if (!view) return { status: 'error', message: 'Creator not found.' };

  // Not merely "is there a report" — is there one THIS viewer may read. An
  // unlocked view is the only branch on which `report` exists at all.
  const report = isUnlocked(view) ? view.report : null;

  const eligibility = assessFitEligibility(report, true);
  if (!eligibility.ok) {
    return { status: 'refused', message: eligibility.message };
  }

  const input = buildFitInput({
    creator: view.creator,
    report: report!,
    organizationName: viewer.organization.name,
    profile: viewer.organization,
    brief: null,
    category,
    eligibility,
  });

  // Fixture demo with no key: answer from the stand-in rather than erroring,
  // so the whole surface can be driven locally. Everything downstream is
  // unchanged — the claims below are verified against the report exactly as a
  // model's are, and nothing is written to fit_summaries.
  if (isLocalFitMode()) {
    const local = localFitSummary(view.creator.handle, category);
    if (!local) {
      return {
        status: 'error',
        message: 'No local stand-in for this creator. Set ANTHROPIC_API_KEY to generate one.',
      };
    }
    const localClaims = verifyClaims(local.claims, report!);
    return {
      status: 'success',
      summary: local.summary,
      claims: localClaims,
      droppedClaims: local.claims.length - localClaims.length,
      source: 'local',
    };
  }

  let output: z.infer<typeof fitOutputSchema>;
  try {
    output = await callModel(input);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return { status: 'error', message: 'Busy right now — try again in a moment.' };
    }
    console.error('[fit_summaries] generation failed', {
      handle: creatorHandle,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'error', message: 'Could not generate a fit read.' };
  }

  // The model's claims are checked against the report before anything is
  // stored. A sentence whose figure does not match is dropped, however well it
  // reads — this is the only evidence in the report a reader cannot verify by
  // following a link, so it is verified for them.
  const claims = verifyClaims(output.claims as FitClaim[], report!);
  const dropped = output.claims.length - claims.length;

  if (dropped > 0) {
    console.warn('[fit_summaries] dropped ungrounded claims', {
      handle: creatorHandle,
      dropped,
      of: output.claims.length,
    });
  }

  if (isSupabaseConfigured()) {
    const supabase = createSessionClient();
    // Session client, so the RLS policy re-checks org membership and the paid
    // plan on write. The viewer check above is for the message, not the gate.
    const { error } = await supabase.from('fit_summaries').upsert(
      {
        creator_id: view.creator.id,
        organization_id: viewer.organization.id,
        brief_id: briefId,
        summary: output.summary,
        claims,
        confidence: eligibility.confidence,
        model_version: MODEL,
        rubric_version: report!.intent?.rubricVersion ?? INTENT_RUBRIC_VERSION,
        report_analyzed_at: report!.lastAnalyzedAt,
      },
      { onConflict: 'creator_id,organization_id,brief_id' },
    );

    if (error) {
      console.error('[fit_summaries] write failed', { error: error.message });
      // The read still stands even if it could not be stored — returning it
      // beats discarding work the buyer already paid inference for.
    }
  }

  revalidatePath(`/@${creatorHandle}`);

  return {
    status: 'success',
    summary: output.summary,
    claims,
    droppedClaims: dropped,
    source: 'model',
  };
}
