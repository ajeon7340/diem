import 'server-only';

import { cache } from 'react';

import type {
  BrandSetupState,
  CampaignCategory,
  CampaignObjective,
  ClimatePreference,
  CustomerType,
  Viewer,
} from '@/types';
import { CAMPAIGN_CATEGORIES, CAMPAIGN_OBJECTIVES } from '@/types';
import type { OrganizationMemberRow } from '@/types/database';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { demoViewer } from '@/lib/data/demo';

const ANONYMOUS: Viewer = {
  userId: null,
  organization: null,
  isProAgency: false,
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

  // One read now. It used to be two in parallel, the second asking whether
  // this user was also a creator — there is no such thing any more.
  const membership = await supabase
    .from('organization_members')
    .select('id, organization_id, user_id, role, created_at, organizations(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<OrganizationMemberRow>();

  const org = membership.data?.organizations ?? null;

  return {
    userId: user.id,
    organization: org
      ? {
          id: org.id,
          name: org.name,
          billingPlan: org.billing_plan,
          // Narrowed against the vocabulary rather than trusted, same as the
          // fields below: the column is free text with a CHECK, and a value
          // that stopped being valid must not reach the UI as though it were.
          customerType: (['brand', 'agency'] as const).includes(
            org.customer_type as CustomerType,
          )
            ? (org.customer_type as CustomerType)
            : null,
          defaultBrandId: org.default_brand_id ?? null,
          // Narrowed against the vocabulary rather than trusted, same as the
          // fields below. A value that stopped being valid must not route
          // somebody back through onboarding they already finished.
          brandSetupState: (['pending', 'skipped', 'done'] as const).includes(
            org.brand_setup_state as BrandSetupState,
          )
            ? (org.brand_setup_state as BrandSetupState)
            : 'skipped',
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
          // Narrowed against the fixed vocabulary rather than trusted, same
          // reasoning as categories/objectives above: a stale or malformed
          // value must not reach the fit-summary prompt as though it still
          // meant something.
          climatePreference: (['warm', 'edgy_ok'] as const).includes(
            org.climate_preference as ClimatePreference,
          )
            ? (org.climate_preference as ClimatePreference)
            : null,
          createdAt: org.created_at,
        }
      : null,
    isProAgency: org?.billing_plan === 'pro_agency',
  };
});
