'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { getViewer } from '@/lib/access/viewer';
import { createServiceClient, createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { aiConfigured } from '@/lib/ai/provider';
import { identifyBrands } from '@/lib/discovery/competitors';
import { suggestCompetitors } from '@/lib/discovery/ai';
import {
  competitorSchema,
  criteriaSchema,
  similarSchema,
  termList,
} from '@/lib/discovery/schemas';
import type { DiscoveryMode } from '@/lib/discovery/types';

/**
 * Starting, confirming, cancelling and harvesting a discovery run.
 *
 * ASYNC FUNCTIONS ONLY in this file — see `app/actions/state.ts`. A constant
 * exported beside an action 500s every action in the module on a production
 * build while the page still renders fine, which is how it survived review last
 * time. `npm run verify:actions` is the guard.
 *
 * Jobs are queued through the service client because `analysis_jobs` holds no
 * INSERT grant for `authenticated`: a row there spends quota and, where
 * approval is configured, model tokens, and the ability to create one is not
 * delegated to anybody who can name a channel. CANCELLING is the exception and
 * goes through a SECURITY DEFINER function the customer may call, because
 * stopping work you asked for is not a privileged operation.
 */

export interface DiscoveryState {
  message?: string;
  fieldErrors?: Record<string, string>;
  searchId?: string;
}

export async function startDiscovery(_: DiscoveryState, form: FormData): Promise<DiscoveryState> {
  const viewer = await getViewer();
  if (!viewer.organization || !viewer.userId || !isSupabaseConfigured()) {
    return { message: 'Sign in and name a workspace before searching.' };
  }
  if (!process.env.YOUTUBE_API_KEY) {
    return {
      message:
        'Creator search is not configured on this deployment. An operator needs to add YouTube API access.',
    };
  }

  const mode = String(form.get('mode') ?? '') as DiscoveryMode;
  const parsed = parseInput(mode, form);
  if (!parsed.ok) return parsed.state;

  const supabase = createSessionClient();
  // The brand is recorded so the search can be read back with the context it
  // ran under. The trigger in 0041 refuses an id from another workspace, so a
  // forged field fails the insert rather than leaking a name back through a
  // selector.
  const brandId = String(form.get('brandId') ?? '') || null;
  const { data: search, error } = await supabase
    .from('discovery_searches')
    .insert({
      organization_id: viewer.organization.id,
      created_by: viewer.userId,
      mode,
      campaign_id: parsed.campaignId,
      brand_id: brandId,
      params: parsed.params,
      reference_channel_id: mode === 'similar' ? String(form.get('channel') ?? '').slice(0, 200) : null,
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !search) return { message: 'Could not start this search. Please try again.' };

  // Competitor mode does NOT queue a search here. Step A names brands, a person
  // confirms them, and only then does anything get searched for — see the note
  // in `lib/discovery/competitors.ts` on why an unconfirmed name must never
  // reach a query.
  if (mode === 'competitor') {
    await runBrandStep(search.id, parsed.params);
    redirect(`/discover/${search.id}`);
  }

  const queued = await queueSearch(search.id, mode === 'similar' ? 'discover_similar' : 'discover_criteria');
  if (!queued.ok) return { message: queued.message, searchId: search.id };

  redirect(`/discover/${search.id}`);
}

type Parsed =
  | { ok: true; params: Record<string, unknown>; campaignId: string | null }
  | { ok: false; state: DiscoveryState };

function parseInput(mode: DiscoveryMode, form: FormData): Parsed {
  const raw = Object.fromEntries(form.entries());

  if (mode === 'criteria') {
    const result = criteriaSchema.safeParse({
      ...raw,
      categories: form.getAll('categories'),
      subscribers: form.getAll('subscribers'),
      views: form.getAll('views'),
      formats: form.getAll('formats'),
    });
    if (!result.success) return { ok: false, state: { fieldErrors: flatten(result.error) } };
    return { ok: true, params: result.data, campaignId: result.data.campaignId };
  }

  if (mode === 'similar') {
    const result = similarSchema.safeParse({ ...raw, dimensions: form.getAll('dimensions') });
    if (!result.success) return { ok: false, state: { fieldErrors: flatten(result.error) } };
    return { ok: true, params: result.data, campaignId: result.data.campaignId };
  }

  if (mode === 'competitor') {
    const result = competitorSchema.safeParse(raw);
    if (!result.success) return { ok: false, state: { fieldErrors: flatten(result.error) } };
    return { ok: true, params: result.data, campaignId: result.data.campaignId };
  }

  return { ok: false, state: { message: 'Pick one of the three ways to search.' } };
}

function flatten(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Step A, run inline.
 *
 * Inline rather than queued because it is one short model call and the customer
 * is looking at the form: making them wait on a worker poll for a list they
 * have to confirm anyway would put a background job between two halves of one
 * conversation. It also CANNOT FAIL THE SEARCH — with no approval, no provider
 * or a model outage, the customer's own entries are stored and the page says
 * automatic suggestions are unavailable.
 */
async function runBrandStep(searchId: string, params: Record<string, unknown>): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.organization || !viewer.userId) return;

  const input = competitorSchema.parse(params);
  const { brands } = await identifyBrands(input, aiConfigured() ? suggestCompetitors : null);
  if (brands.length === 0) return;

  const now = new Date().toISOString();
  const { error } = await createSessionClient().from('competitor_brands').insert(
    brands.map((brand) => ({
      organization_id: viewer.organization!.id,
      search_id: searchId,
      campaign_id: input.campaignId,
      name: brand.name,
      relation: brand.relation,
      rationale: brand.rationale,
      products: [],
      source: brand.source,
      // A model suggestion arrives UNCONFIRMED and stays that way until a
      // person says otherwise. The database refuses a confirmed row with no
      // confirming person — see competitor_brands_confirmation_is_an_act.
      confirmed: brand.confirmed,
      confirmed_at: brand.confirmed ? now : null,
      confirmed_by: brand.confirmed ? viewer.userId : null,
    })),
  );
  if (error) console.error('[discovery] could not store brands', error.message);
}

export async function addBrand(_: DiscoveryState, form: FormData): Promise<DiscoveryState> {
  const viewer = await getViewer();
  if (!viewer.organization || !viewer.userId || !isSupabaseConfigured()) {
    return { message: 'Sign in first.' };
  }
  const searchId = String(form.get('searchId') ?? '');
  const name = String(form.get('name') ?? '').trim().slice(0, 120);
  if (!name) return { message: 'Name the brand.' };

  const now = new Date().toISOString();
  const { error } = await createSessionClient().from('competitor_brands').insert({
    organization_id: viewer.organization.id,
    search_id: searchId,
    name,
    relation: 'direct',
    rationale: 'You entered this brand.',
    products: termList(5, 120).parse(form.get('products')),
    source: 'customer',
    confirmed: true,
    confirmed_at: now,
    confirmed_by: viewer.userId,
  });
  if (error) {
    return { message: error.code === '23505' ? 'That brand is already on this search.' : 'Could not add that brand.' };
  }
  revalidatePath(`/discover/${searchId}`);
  return { message: `${name} confirmed.`, searchId };
}

export async function confirmBrand(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.organization || !viewer.userId || !isSupabaseConfigured()) return;
  const id = String(form.get('brandId') ?? '');
  const searchId = String(form.get('searchId') ?? '');
  const confirmed = form.get('confirmed') !== 'false';

  await createSessionClient()
    .from('competitor_brands')
    .update({
      confirmed,
      confirmed_at: confirmed ? new Date().toISOString() : null,
      confirmed_by: confirmed ? viewer.userId : null,
    })
    .eq('id', id);
  revalidatePath(`/discover/${searchId}`);
}

export async function removeBrand(form: FormData): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const searchId = String(form.get('searchId') ?? '');
  await createSessionClient().from('competitor_brands').delete().eq('id', String(form.get('brandId') ?? ''));
  revalidatePath(`/discover/${searchId}`);
}

/** Step B. Refuses outright rather than quietly searching for nothing. */
export async function findCollaborations(_: DiscoveryState, form: FormData): Promise<DiscoveryState> {
  if (!isSupabaseConfigured()) return { message: 'Sign in first.' };
  const searchId = String(form.get('searchId') ?? '');

  const { data: confirmed } = await createSessionClient()
    .from('competitor_brands')
    .select('id')
    .eq('search_id', searchId)
    .eq('confirmed', true)
    .limit(1);

  if (!confirmed?.length) {
    return {
      message:
        'Confirm at least one brand first. Searching for a name nobody confirmed spends the day’s search budget and returns an empty result that reads like a finding.',
      searchId,
    };
  }

  const queued = await queueSearch(searchId, 'discover_collabs');
  if (!queued.ok) return { message: queued.message, searchId };
  revalidatePath(`/discover/${searchId}`);
  return { searchId, message: 'Collaboration search queued.' };
}

async function queueSearch(
  searchId: string,
  kind: 'discover_criteria' | 'discover_similar' | 'discover_collabs',
): Promise<{ ok: true } | { ok: false; message: string }> {
  const service = createServiceClient();
  if (!service) {
    return {
      ok: false,
      message: 'Background search is not configured on this deployment. An operator runs the worker.',
    };
  }
  const { error } = await service.rpc('queue_discovery_search', { p_search: searchId, p_kind: kind });
  // A duplicate is not an error: the RPC returns false when a job for this
  // search is already queued or running, which is the correct answer to a
  // double-submitted form and to a retried server action alike.
  if (error) return { ok: false, message: 'Could not queue this search. Please try again.' };
  return { ok: true };
}

export async function cancelSearch(form: FormData): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const searchId = String(form.get('searchId') ?? '');
  await createSessionClient().rpc('cancel_discovery_search', { p_search: searchId });
  revalidatePath(`/discover/${searchId}`);
}

/**
 * Save candidates to the workspace. Cheap by design: a row, and no analysis.
 *
 * Shortlisting forty channels must not queue forty metered passes. The deep
 * read happens when somebody asks for it or adds the candidate to a campaign.
 */
export async function saveCandidates(_: DiscoveryState, form: FormData): Promise<DiscoveryState> {
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) return { message: 'Sign in first.' };

  const searchId = String(form.get('searchId') ?? '');
  const channelIds = form.getAll('channelId').map(String).filter((id) => /^UC[\w-]{22}$/.test(id));
  if (channelIds.length === 0) return { message: 'Select at least one channel.', searchId };

  const supabase = createSessionClient();
  const { data: rows } = await supabase
    .from('discovery_candidates')
    .select('channel_id, reason, evidence, facts')
    .eq('search_id', searchId)
    .in('channel_id', channelIds)
    .returns<Record<string, unknown>[]>();

  const { data: search } = await supabase
    .from('discovery_searches')
    .select('mode')
    .eq('id', searchId)
    .maybeSingle<{ mode: DiscoveryMode }>();

  // `workspace_candidates` has a composite foreign key onto `workspace_channels`,
  // so the reference has to exist first. That is the point of the key: a saved
  // candidate is always a channel this organisation may read jobs and shares
  // for, rather than a second, parallel notion of "channels we know about".
  const { error: reference } = await supabase.from('workspace_channels').upsert(
    channelIds.map((channel_id) => ({ organization_id: viewer.organization!.id, channel_id })),
    { onConflict: 'organization_id,channel_id', ignoreDuplicates: true },
  );
  if (reference) return { message: 'Could not save to your workspace.', searchId };

  const { error } = await supabase.from('workspace_candidates').upsert(
    channelIds.map((channel_id) => {
      const row = (rows ?? []).find((r) => r.channel_id === channel_id);
      return {
        organization_id: viewer.organization!.id,
        channel_id,
        search_id: searchId,
        discovery_mode: search?.mode ?? null,
        reason: (row?.reason as string) ?? null,
        evidence: row?.evidence ?? [],
        facts: row?.facts ?? {},
      };
    }),
    { onConflict: 'organization_id,channel_id' },
  );
  if (error) return { message: 'Could not save these candidates.', searchId };

  revalidatePath('/discover');
  revalidatePath(`/discover/${searchId}`);
  return { searchId, message: `${channelIds.length} saved. No analysis was started — open one to read it.` };
}

/**
 * Add discovered candidates to a campaign, carrying WHY they were found.
 *
 * `discovery_reason` is stored apart from `fit_summary` deliberately: one says
 * why a search surfaced this channel, the other says how it reads against this
 * brief. Collapsing them would let a search match render as a recommendation.
 */
export async function addCandidatesToCampaign(_: DiscoveryState, form: FormData): Promise<DiscoveryState> {
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) return { message: 'Sign in first.' };

  const campaignId = String(form.get('campaignId') ?? '');
  const searchId = String(form.get('searchId') ?? '');
  const channelIds = [...new Set(form.getAll('channelId').map(String))].filter((id) =>
    /^UC[\w-]{22}$/.test(id),
  );
  if (!campaignId) return { message: 'Choose a campaign.', searchId };
  if (channelIds.length === 0) return { message: 'Select at least one channel.', searchId };

  const supabase = createSessionClient();
  const { data: rows } = await supabase
    .from('discovery_candidates')
    .select('channel_id, reason, evidence')
    .eq('search_id', searchId)
    .in('channel_id', channelIds)
    .returns<Record<string, unknown>[]>();

  const { data: search } = await supabase
    .from('discovery_searches')
    .select('mode')
    .eq('id', searchId)
    .maybeSingle<{ mode: DiscoveryMode }>();

  const { data: existing } = await supabase
    .from('campaign_candidates')
    .select('channel_id')
    .eq('campaign_id', campaignId)
    .returns<{ channel_id: string }[]>();

  const already = new Set((existing ?? []).map((r) => r.channel_id));
  const fresh = channelIds.filter((id) => !already.has(id));
  if (fresh.length === 0) return { message: 'Those channels are already on this campaign.', searchId };

  const service = createServiceClient();
  let added = 0;
  const skipped: string[] = [];

  // One at a time so the five-candidate trigger rejects the sixth rather than
  // the whole batch: a customer adding three to a campaign that has four should
  // get one added and a clear sentence, not a failed form.
  for (const channel_id of fresh) {
    const row = (rows ?? []).find((r) => r.channel_id === channel_id);
    const { error } = await supabase.from('campaign_candidates').insert({
      campaign_id: campaignId,
      channel_id,
      discovery_search_id: searchId,
      discovery_mode: search?.mode ?? null,
      discovery_reason: (row?.reason as string) ?? null,
      discovery_evidence: row?.evidence ?? [],
    });
    if (error) {
      skipped.push(channel_id);
      continue;
    }
    added += 1;
    // The public read is what the campaign compares on, and it is shared across
    // customers — so this queues collection rather than running it, and the RPC
    // already declines when current data exists.
    if (service) await service.rpc('queue_channel_collection', { p_channel: channel_id, p_days: 90, p_refresh: false });
  }

  revalidatePath(`/campaigns/${campaignId}`);
  if (added === 0) {
    return { message: 'Could not add these — a campaign compares up to five candidates.', searchId };
  }
  return {
    searchId,
    message:
      skipped.length === 0
        ? `${added} added to the campaign. Their public reads are queued.`
        : `${added} added. ${skipped.length} could not be — a campaign compares up to five candidates.`,
  };
}

/** Start the full public read for one discovered channel, on request. */
export async function analyseCandidate(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) return;
  const channelId = String(form.get('channelId') ?? '');
  if (!/^UC[\w-]{22}$/.test(channelId)) return;

  const supabase = createSessionClient();
  await supabase
    .from('workspace_channels')
    .upsert({ organization_id: viewer.organization.id, channel_id: channelId }, { ignoreDuplicates: true });

  const service = createServiceClient();
  if (service) await service.rpc('queue_channel_collection', { p_channel: channelId, p_days: 90, p_refresh: false });
  redirect(`/channels/${channelId}`);
}

export async function removeSavedCandidate(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) return;
  await createSessionClient()
    .from('workspace_candidates')
    .delete()
    .eq('organization_id', viewer.organization.id)
    .eq('channel_id', String(form.get('channelId') ?? ''));
  revalidatePath('/discover');
}
