import 'server-only';

import { cache } from 'react';

import type { CampaignCategory, CampaignObjective, Viewer } from '@/types';
import { CAMPAIGN_CATEGORIES, CAMPAIGN_OBJECTIVES } from '@/types';
import type { OrganizationMemberRow } from '@/types/database';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { demoViewer } from '@/lib/data/fixtures';

const ANONYMOUS: Viewer = {
  userId: null,
  organization: null,
  isProAgency: false,
  creatorId: null,
};

/**
 * Who is asking. Resolved once per request and shared by the gatekeeper, the
 * directory, and the dashboard.
 *
 * This is identity, not authorisation: `isProAgency` decides what the UI says
 * and which query we bother to run, but the actual gate is the RLS policy on
 * `report_metrics`. If this function were wrong in the permissive direction,
 * the database would still return nothing.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  if (!isSupabaseConfigured()) return demoViewer();

  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return ANONYMOUS;

  const [membership, creator] = await Promise.all([
    supabase
      .from('organization_members')
      .select('id, organization_id, user_id, role, created_at, organizations(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle<OrganizationMemberRow>(),
    supabase.from('creators').select('id').eq('user_id', user.id).maybeSingle<{ id: string }>(),
  ]);

  const org = membership.data?.organizations ?? null;

  return {
    userId: user.id,
    organization: org
      ? {
          id: org.id,
          name: org.name,
          billingPlan: org.billing_plan,
          industry: org.industry ?? null,
          sells: org.sells ?? null,
          audience: org.audience ?? null,
          // Narrowed against the fixed vocabularies rather than trusted: a
          // stale value left over from a renamed category must not reach the
          // prompt as though it still meant something.
          categories: (org.categories ?? []).filter((c): c is CampaignCategory =>
            (CAMPAIGN_CATEGORIES as readonly string[]).includes(c),
          ),
          objectives: (org.objectives ?? []).filter((o): o is CampaignObjective =>
            (CAMPAIGN_OBJECTIVES as readonly string[]).includes(o),
          ),
          createdAt: org.created_at,
        }
      : null,
    isProAgency: org?.billing_plan === 'pro_agency',
    creatorId: creator.data?.id ?? null,
  };
});
