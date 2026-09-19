import 'server-only';

import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * The buyer's own history.
 *
 * Every data function in this codebase was `getCreator*`. An agency could send
 * an access request, an offer and a brief to a hundred creators and then had
 * nowhere to see any of them — not the statuses, not which creators had said
 * yes, not which links still worked. They signed up, were dropped on the
 * directory, and that was the product.
 *
 * The database was always ready: `access_requests_org_read`, `offers_org_read`,
 * `campaign_briefs_org_all` and `campaign_brief_recipients_org_read` have
 * existed since 0001 and 0004. Only the reading code and the page were
 * missing — the same shape as every other hole in this repo, one layer up.
 *
 * RLS scopes all of it to the caller's own organisations; `organizationId`
 * narrows the query, it does not authorise it.
 */

export interface OrgAccessRequest {
  id: string;
  creatorHandle: string | null;
  creatorName: string | null;
  status: 'pending' | 'approved' | 'rejected';
  campaignObjective: string;
  proposedBudget: number | null;
  budgetCurrency: string;
  createdAt: string;
  respondedAt: string | null;
  expiresAt: string | null;
  /** The unlock link, only while it is live. See `isLive`. */
  accessToken: string | null;
  /** Approved, not expired, and therefore actually openable right now. */
  isLive: boolean;
}

export interface OrgOffer {
  id: string;
  creatorHandle: string | null;
  creatorName: string | null;
  status: string;
  amount: number | null;
  currency: string;
  deliverables: string | null;
  createdAt: string;
}

export interface OrgBrief {
  id: string;
  title: string;
  objective: string | null;
  createdAt: string;
  recipients: number;
  accepted: number;
  declined: number;
  pending: number;
}

interface CreatorJoin {
  handle: string;
  display_name: string;
}

/**
 * Explicit row shapes, as everywhere else in this module's neighbours.
 *
 * PostgREST embeds come back as `T | T[] | null` depending on the relationship
 * the client infers, and the inferred type collapses to an error union the
 * moment an embed is involved. Naming the shape is what keeps the mapper
 * honest about which fields it is allowed to read.
 */
interface AccessRequestRow {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  campaign_objective: string;
  proposed_budget: number | string | null;
  budget_currency: string | null;
  created_at: string;
  responded_at: string | null;
  expires_at: string | null;
  access_token: string;
  creators?: CreatorJoin | CreatorJoin[] | null;
}

interface OfferRow {
  id: string;
  status: string;
  amount: number | string | null;
  currency: string | null;
  deliverables: string | null;
  created_at: string;
  creators?: CreatorJoin | CreatorJoin[] | null;
}

interface BriefRow {
  id: string;
  title: string;
  objective: string | null;
  created_at: string;
  campaign_brief_recipients?: { status: string }[] | null;
}

function creatorOf(row: { creators?: CreatorJoin | CreatorJoin[] | null }) {
  const c = Array.isArray(row.creators) ? row.creators[0] : row.creators;
  return { handle: c?.handle ?? null, name: c?.display_name ?? null };
}

export async function getOrgAccessRequests(organizationId: string): Promise<OrgAccessRequest[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('access_requests')
    .select(
      'id, status, campaign_objective, proposed_budget, budget_currency, created_at, ' +
        'responded_at, expires_at, access_token, creators(handle, display_name)',
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .returns<AccessRequestRow[]>();

  if (error) {
    console.error('[org/access_requests] query failed', error.message);
    return [];
  }

  const now = Date.now();
  return (data ?? []).map((row) => {
    const expiresAt = row.expires_at;
    // Approved is not the same as usable. A link that expired last week is a
    // different fact from one that was never granted, and an agency deciding
    // whether to ask again needs to know which.
    const live =
      row.status === 'approved' && (expiresAt === null || Date.parse(expiresAt) > now);
    const { handle, name } = creatorOf(row);
    return {
      id: row.id,
      creatorHandle: handle,
      creatorName: name,
      status: row.status,
      campaignObjective: row.campaign_objective,
      proposedBudget: row.proposed_budget === null ? null : Number(row.proposed_budget),
      budgetCurrency: row.budget_currency ?? 'USD',
      createdAt: row.created_at,
      respondedAt: row.responded_at,
      expiresAt,
      // Only while it opens something. Printing a dead token invites a click
      // that lands on an expired page with no explanation.
      accessToken: live ? row.access_token : null,
      isLive: live,
    };
  });
}

export async function getOrgOffers(organizationId: string): Promise<OrgOffer[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('offers')
    .select('id, status, amount, currency, deliverables, created_at, creators(handle, display_name)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .returns<OfferRow[]>();

  if (error) {
    console.error('[org/offers] query failed', error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const { handle, name } = creatorOf(row);
    return {
      id: row.id,
      creatorHandle: handle,
      creatorName: name,
      status: row.status,
      amount: row.amount === null ? null : Number(row.amount),
      currency: row.currency ?? 'USD',
      deliverables: row.deliverables,
      createdAt: row.created_at,
    };
  });
}

export async function getOrgBriefs(organizationId: string): Promise<OrgBrief[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('campaign_briefs')
    .select('id, title, objective, created_at, campaign_brief_recipients(status)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .returns<BriefRow[]>();

  if (error) {
    console.error('[org/briefs] query failed', error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const recipients = row.campaign_brief_recipients ?? [];
    const count = (status: string) => recipients.filter((r) => r.status === status).length;
    return {
      id: row.id,
      title: row.title,
      objective: row.objective,
      createdAt: row.created_at,
      recipients: recipients.length,
      accepted: count('accepted'),
      declined: count('declined'),
      // Everything not yet decided, however it is spelled — a status this
      // function does not know about is still waiting, not missing.
      pending: recipients.length - count('accepted') - count('declined'),
    };
  });
}
