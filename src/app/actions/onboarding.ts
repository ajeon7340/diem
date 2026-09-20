'use server';

import { channelDestination } from '@/lib/channel/state';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { businessOnboardingSchema } from '@/lib/schemas';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getViewer } from '@/lib/access/viewer';
import { DEMO_ROLE_COOKIE, type DemoRole } from '@/lib/data/demo';

export interface OnboardingState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Where the caller should go next on success. */
  redirectTo?: string;
}


/** Fixture mode only: land the new account in the role it just registered as. */
function setDemoRole(role: DemoRole) {
  cookies().set(DEMO_ROLE_COOKIE, role, { path: '/', sameSite: 'lax' });
}

function collectFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
}

/**
 * Business registration: creates the organization and the owner membership.
 *
 * Must go through `create_organization()` — the client holds no INSERT on
 * either table, which is also what stops it declaring itself `pro_agency`.
 * The new org starts on `free`; only the Stripe webhook can change that.
 */
export async function createOrganization(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const destination = channelDestination(formData.get('channel'));
  const customerType = formData.get('customerType');
  if (customerType !== 'brand' && customerType !== 'agency') return { status: 'error', message: 'Choose brand or agency.' };
  const parsed = businessOnboardingSchema.safeParse({
    organizationName: formData.get('organizationName'),
    industry: formData.get('industry'),
    sells: formData.get('sells'),
    audience: formData.get('audience'),
    categories: formData.getAll('categories'),
    objectives: formData.getAll('objectives'),
    climatePreference: formData.get('climatePreference'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  if (!isSupabaseConfigured()) {
    setDemoRole('free_agency');
    return { status: 'success', message: 'Workspace created.', redirectTo: destination };
  }

  const viewer = await getViewer();
  if (!viewer.userId) {
    return { status: 'error', message: 'Your sign-in link expired. Request a new one.' };
  }
  if (viewer.organization) {
    return { status: 'success', message: 'Workspace ready.', redirectTo: destination };
  }

  const supabase = createSessionClient();
  // The RPC takes the name only: 0001 gives clients no INSERT on
  // `organizations`, so creation has to go through SECURITY DEFINER. The
  // profile is a second write because 0019 granted UPDATE on exactly those
  // columns and nothing else — widening the RPC instead would have meant
  // another definer function with a growing parameter list, and every one of
  // those is a place `billing_plan` could accidentally become settable.
  const { data: created, error } = await supabase.rpc('create_organization', {
    p_name: parsed.data.organizationName,
  });

  if (error) {
    if (error.message.includes('already_in_organization')) {
      return { status: 'success', message: 'Workspace ready.', redirectTo: destination };
    }
    if (error.message.includes('not_authenticated')) {
      return { status: 'error', message: 'Your sign-in link expired. Request a new one.' };
    }

    console.error('[create_organization] rpc failed', error.message);
    return { status: 'error', message: 'Could not create your workspace. Please try again.' };
  }

  const orgId = (created as { organization_id: string }[] | null)?.[0]?.organization_id;
  const { industry, sells, audience, categories, objectives, climatePreference } = parsed.data;

  if (orgId) {
    const { error: profileError } = await supabase
      .from('organizations')
      .update({
        customer_type: customerType,
        industry,
        sells,
        audience,
        categories,
        objectives,
        climate_preference: climatePreference,
      })
      .eq('id', orgId);

    // The workspace exists either way, and sending them back to a blank form
    // would cost them the name too. The profile is editable later; losing it
    // here is a worse outcome than losing it now.
    if (profileError) {
      console.error('[create_organization] profile write failed', profileError.message);
    }
  }

  revalidatePath('/', 'layout');
  return { status: 'success', message: 'Workspace created.', redirectTo: destination };
}
