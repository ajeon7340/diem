import 'server-only';

import type { AccessRequest, DemographicsGrant, InboundBrief, Offer } from '@/types';
import type {
  AccessRequestRow,
  BriefRecipientRow,
  DemographicsGrantRow,
  OfferRow,
} from '@/types/database';
import {
  toAccessRequest,
  toDemographicsGrant,
  toInboundBrief,
  toOffer,
} from '@/lib/mappers';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { fixtureCreatorById } from '@/lib/data/fixtures';
import type { QueueItem } from '@/lib/report/moderation';
import type { FitClaim } from '@/lib/report/fit';
import {
  FIXTURE_ACCESS_REQUESTS,
  FIXTURE_BRIEFS,
  FIXTURE_OFFERS,
  fixtureModerationQueue,
} from './fixtures';

/**
 * The creator's inbox. Read through the session client so RLS scopes it to the
 * caller's own creator row — the `creatorId` argument narrows the query, it
 * does not authorise it.
 */
export async function getCreatorRequests(creatorId: string): Promise<AccessRequest[]> {
  if (!isSupabaseConfigured()) {
    return FIXTURE_ACCESS_REQUESTS.filter((request) => request.creatorId === creatorId);
  }

  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('access_requests')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
    .returns<AccessRequestRow[]>();

  if (error) {
    console.error('[access_requests] inbox query failed', error.message);
    return [];
  }

  return (data ?? []).map(toAccessRequest);
}

/** Handle for a creator id, used to bounce an already-onboarded user home. */
export async function getCreatorHandle(creatorId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createSessionClient();
  const { data } = await supabase
    .from('creators')
    .select('handle')
    .eq('id', creatorId)
    .maybeSingle<{ handle: string }>();

  return data?.handle ?? null;
}

/**
 * Offers addressed to this creator. RLS scopes the read to rows they own — the
 * `creatorId` argument narrows the query, it does not authorise it.
 */
export async function getCreatorOffers(creatorId: string): Promise<Offer[]> {
  if (!isSupabaseConfigured()) {
    return FIXTURE_OFFERS.filter((offer) => offer.creatorId === creatorId);
  }

  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
    .returns<OfferRow[]>();

  if (error) {
    console.error('[offers] inbox query failed', error.message);
    return [];
  }

  return (data ?? []).map(toOffer);
}

/**
 * Bulk campaign briefs sent to this creator by Pro agencies. Until now these
 * were written by Track B and never surfaced anywhere — agencies were briefing
 * into a void.
 */
export async function getCreatorBriefs(creatorId: string): Promise<InboundBrief[]> {
  if (!isSupabaseConfigured()) return FIXTURE_BRIEFS;

  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('campaign_brief_recipients')
    .select(
      'id, brief_id, status, sent_at, campaign_briefs(title, objective, brief_note, budget_min, budget_max, budget_currency, organizations(name))',
    )
    .eq('creator_id', creatorId)
    .order('sent_at', { ascending: false })
    .returns<BriefRecipientRow[]>();

  if (error) {
    console.error('[campaign_brief_recipients] query failed', error.message);
    return [];
  }

  return (data ?? []).map(toInboundBrief);
}


/**
 * Who has asked to see this creator's demographics, and who already can.
 *
 * RLS scopes it to the caller's own creator row; `creatorId` narrows the
 * query rather than authorising it, as everywhere else in this module.
 */
export async function getDemographicsGrants(creatorId: string): Promise<DemographicsGrant[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createSessionClient();
  const { data, error } = await supabase
    // The view, not the table: `organizations_member_read` hides the requesting
    // organisation's name from the creator, and an unnamed party is not what
    // III.E.3.b asks them to approve. See migration 0026.
    .from('demographics_grant_inbox')
    .select('*')
    .eq('creator_id', creatorId)
    .order('requested_at', { ascending: false })
    .returns<DemographicsGrantRow[]>();

  if (error) {
    console.error('[demographics_grants] inbox query failed', error.message);
    return [];
  }
  return data.map(toDemographicsGrant);
}

/**
 * The creator's moderation queue.
 *
 * RLS is creator-only on this table — no agency reads it on any plan. A brand
 * needs the rollup so they can price a placement; nothing about that decision
 * requires a browsable archive of abuse aimed at a person.
 */
export async function getModerationQueue(creatorId: string): Promise<QueueItem[]> {
  if (!isSupabaseConfigured()) return fixtureModerationQueue(creatorId);

  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('comment_moderation_queue')
    .select('*')
    .eq('creator_id', creatorId)
    .order('likes', { ascending: false, nullsFirst: false })
    .limit(300)
    .returns<
      {
        id: string;
        comment_id: string;
        video_id: string;
        video_title: string | null;
        excerpt: string;
        category: QueueItem['category'];
        by_creator: boolean;
        likes: number | null;
        published_at: string | null;
        status: QueueItem['status'];
      }[]
    >();

  if (error) {
    console.error('[comment_moderation_queue] read failed', error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    commentId: row.comment_id,
    videoId: row.video_id,
    videoTitle: row.video_title,
    excerpt: row.excerpt,
    category: row.category,
    byCreator: row.by_creator,
    likes: row.likes,
    publishedAt: row.published_at,
    status: row.status,
  }));
}

/**
 * The YouTube handle a creator has connected, for Studio.
 *
 * Reads `social_accounts` directly rather than the directory view: Studio is
 * the creator looking at themselves, and the view is built for buyers — it only
 * carries creators who opted into the directory, which a creator using Studio
 * on day one very plausibly has not.
 */
export async function getCreatorYouTubeHandle(creatorId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    const creator = fixtureCreatorById(creatorId);
    return creator?.platforms.find((p) => p.platform === 'youtube')?.handle ?? null;
  }

  const supabase = createSessionClient();

  // The declared handle first. It is what onboarding writes and what Studio
  // needs, and it exists for creators who have authorised nothing. An OAuth
  // connection is a stronger claim but a rarer one, and it is not required to
  // read a channel's public uploads — see migration 0022.
  const { data: declared } = await supabase
    .from('creators')
    .select('youtube_handle')
    .eq('id', creatorId)
    .maybeSingle<{ youtube_handle: string | null }>();

  if (declared?.youtube_handle) return declared.youtube_handle;

  const { data } = await supabase
    .from('social_accounts')
    .select('channel_handle')
    .eq('creator_id', creatorId)
    .eq('platform', 'youtube')
    .maybeSingle<{ channel_handle: string | null }>();

  return data?.channel_handle ?? null;
}

/**
 * The cached fit read for this creator, as seen by this organisation.
 *
 * Cached because the read is written on view, and an LLM call on every page
 * load would be slow, expensive, and — worse — non-deterministic: two people
 * at the same agency opening the same creator would see different arguments
 * for the same numbers, and neither would trust either.
 *
 * Null in fixture mode so the demo exercises the generation path rather than a
 * pre-baked answer.
 */
export async function getFitSummary(
  creatorId: string,
  organizationId: string,
): Promise<{
  summary: string;
  claims: FitClaim[];
  reportAnalyzedAt: string | null;
} | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('fit_summaries')
    .select('summary, claims, report_analyzed_at')
    .eq('creator_id', creatorId)
    .eq('organization_id', organizationId)
    .is('brief_id', null)
    .maybeSingle<{ summary: string; claims: FitClaim[]; report_analyzed_at: string | null }>();

  if (error || !data) return null;
  return {
    summary: data.summary,
    claims: data.claims ?? [],
    reportAnalyzedAt: data.report_analyzed_at,
  };
}
