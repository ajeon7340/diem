'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { getViewer } from '@/lib/access/viewer';
import { publicReport } from '@/lib/channel/report';
import { performance as perf } from '@/lib/channel/report';
import { getBrand } from '@/lib/data/brands';
import { getCampaign } from '@/lib/data/campaigns';
import { contextFingerprint } from '@/lib/relevance/fingerprint';
import { requirementMatrix, type RelevanceContext } from '@/lib/relevance/requirements';
import { readCandidate } from '@/lib/report/candidate-fit';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import { aiConfigured, aiModel } from '@/lib/ai/provider';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Run a relevance analysis for one channel and one brand.
 *
 * ASYNC FUNCTIONS ONLY in this file — see `app/actions/state.ts`.
 *
 * THE DETERMINISTIC HALF ALWAYS RUNS. The requirement matrix is term matching
 * against metadata this workspace has already collected: no model, no gate, no
 * spend. The written reading is attempted only where the derived-analysis
 * approval and a provider are both configured, and a failure there costs the
 * narrative and not the analysis — which is the point of storing them in
 * separate columns.
 */

export interface RelevanceState {
  status: 'idle' | 'success' | 'error';
  message?: string;
}

export async function analyseRelevance(
  _prev: RelevanceState,
  form: FormData,
): Promise<RelevanceState> {
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) {
    return { status: 'error', message: 'Sign in first.' };
  }

  const channelId = String(form.get('channelId') ?? '');
  const brandId = String(form.get('brandId') ?? '');
  const campaignId = String(form.get('campaignId') ?? '') || null;
  if (!/^UC[\w-]{22}$/.test(channelId) && channelId !== 'sample') {
    return { status: 'error', message: 'That channel could not be read.' };
  }
  if (!brandId) return { status: 'error', message: 'Choose a brand to analyse against.' };

  const supabase = createSessionClient();
  const { data: row } = await supabase
    .from('channel_analyses')
    .select('*')
    .eq('channel_id', channelId)
    .maybeSingle<Record<string, unknown>>();
  const report = row ? publicReport(row) : null;
  if (!report) {
    return {
      status: 'error',
      message: 'There is no current evidence for this channel. Refresh the analysis first.',
    };
  }

  // Both are read through the session, so a brand or campaign from another
  // workspace simply does not come back — and the trigger in 0042 refuses the
  // write even if one did.
  const [brand, campaign] = await Promise.all([
    getBrand(brandId),
    campaignId ? getCampaign(campaignId) : Promise.resolve(null),
  ]);
  if (!brand) return { status: 'error', message: 'That brand is not in this workspace.' };
  if (campaignId && !campaign) {
    return { status: 'error', message: 'That campaign is not in this workspace.' };
  }

  const context: RelevanceContext = {
    brand: {
      id: brand.id,
      name: brand.name,
      sells: brand.sells,
      categories: brand.categories,
      customerNeeds: brand.customerNeeds,
      contentLanguages: brand.contentLanguages,
      markets: brand.markets,
    },
    campaign: campaign
      ? {
          id: campaign.id,
          name: campaign.name,
          product: campaign.product,
          useCase: campaign.useCase ?? null,
          objective: campaign.objective,
          avoidTopics: campaign.avoidTopics,
        }
      : null,
  };

  const matrix = requirementMatrix(report, context);
  const fingerprint = contextFingerprint(context);

  // The gated reading. A failure here is logged and dropped: the matrix above
  // is the analysis, and losing the prose must not lose it.
  let narrative = null;
  let model: string | null = null;
  if (AMENDMENT_ACCEPTED && aiConfigured()) {
    try {
      const p = perf(report.videos, Date.parse(report.fetchedAt));
      const result = await readCandidate({
        brief: {
          name: campaign?.name ?? `${brand.name} (brand-level)`,
          brand: brand.name,
          product: campaign?.product ?? brand.sells,
          audience: campaign?.audience ?? brand.customerNeeds,
          objective: campaign?.objective ?? null,
          avoidTopics: campaign?.avoidTopics ?? null,
        },
        channel: {
          title: report.title,
          handle: report.handle,
          description: report.description,
          subscribers: report.subscribers,
          medianViews: p.median,
          engagementRate: null,
          uploadsInWindow: report.videos.length,
          windowDays: report.windowDays,
        },
        comments: {
          analysed: report.comments,
          scanned: null,
          sentiment: null,
          purchaseIntentRate: null,
          intentBasis: null,
          intentScored: null,
          clusters: report.clusters,
          risks: [],
        },
        promotions: report.promotions,
        // No fee is quoted at brand level, and a CPM is only ever computed from
        // a figure the customer entered — see the note on `campaign_candidates`.
        proposedFee: null,
      });
      if (result.ok) {
        narrative = result.fit;
        model = aiModel();
      } else {
        console.error('[relevance] narrative declined:', result.reason);
      }
    } catch (error) {
      console.error('[relevance] narrative failed', error instanceof Error ? error.message : error);
    }
  }

  const { error } = await supabase.from('relevance_analyses').upsert(
    {
      organization_id: viewer.organization.id,
      channel_id: channelId,
      brand_id: brandId,
      campaign_id: campaignId,
      evidence_fetched_at: report.fetchedAt,
      context_fingerprint: fingerprint,
      matrix,
      narrative,
      model,
    },
    { onConflict: campaignId ? 'organization_id,channel_id,brand_id,campaign_id' : undefined },
  );

  if (error) {
    console.error('[relevance] save failed', error.message);
    return { status: 'error', message: 'Could not save this analysis. Please try again.' };
  }

  revalidatePath(`/channels/${channelId}`);
  redirect(
    `/channels/${channelId}?view=relevance&brand=${encodeURIComponent(brandId)}${campaignId ? `&campaign=${encodeURIComponent(campaignId)}` : ''}`,
  );
}
