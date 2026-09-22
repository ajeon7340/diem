'use server';

import { BRAND_PATH, channelDestination } from '@/lib/channel/state';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { businessOnboardingSchema } from '@/lib/schemas';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getViewer } from '@/lib/access/viewer';
import { DEMO_ROLE_COOKIE, type DemoRole } from '@/lib/data/demo';
import { describeWriteFailure } from '@/lib/data/failure';

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
  // Step 1 of two. The workspace is named here and the BRAND is described on
  // the next screen, because they are different things: an agency's own
  // description is not product context for its clients, and one form asking for
  // both is how they got collapsed in the first place.
  const destination = channelDestination(formData.get('channel'), BRAND_PATH);
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
  // Idempotent: a retried action or a double-submitted form finds the workspace
  // it already made and moves on rather than failing on a unique violation.
  if (viewer.organization) {
    return {
      status: 'success',
      message: 'Workspace ready.',
      redirectTo:
        viewer.organization.brandSetupState === 'pending'
          ? destination
          : channelDestination(formData.get('channel')),
    };
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
    return { status: 'error', message: describeWriteFailure(error, 'create your workspace', 'onboarding') };
  }

  const orgId = (created as { organization_id: string }[] | null)?.[0]?.organization_id;
  const { industry, sells, audience, categories, objectives, climatePreference } = parsed.data;

  if (orgId) {
    const { error: profileError } = await supabase
      .from('organizations')
      .update({
        customer_type: customerType,
        // The brand step has not been answered yet. 'pending' is what brings a
        // returning customer back to it; 'skipped' would be a decision they
        // have not made.
        brand_setup_state: 'pending',
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

export interface WorkspaceState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Edit the workspace after setup.
 *
 * The two fields signup asks for are the two fields that can be changed here,
 * and they are the only two the database will accept from a client: 0001
 * grants `update (name)` and 0037 grants `update (customer_type)`, so a
 * forged field in this form reaches a column the caller holds no privilege on
 * and the statement fails. `billing_plan` is unreachable by construction for
 * the same reason — an admin can rename their workspace, not sell themselves a
 * plan.
 *
 * WHY EDITABLE AT ALL: a team name typed in the thirty seconds before somebody
 * could see their first report is exactly the kind of thing that comes out
 * wrong, and until now there was no way to correct it — the value was written
 * once at signup and never writable again.
 */
export async function updateWorkspace(
  _prev: WorkspaceState,
  formData: FormData,
): Promise<WorkspaceState> {
  if (!isSupabaseConfigured()) {
    return { status: 'error', message: 'A database is required to change workspace settings.' };
  }

  const viewer = await getViewer();
  if (!viewer.organization) return { status: 'error', message: 'Sign in to change settings.' };

  const name = String(formData.get('organizationName') ?? '').trim();
  if (name.length < 2 || name.length > 120) {
    return {
      status: 'error',
      fieldErrors: { organizationName: 'Use between 2 and 120 characters.' },
    };
  }

  const customerType = formData.get('customerType');
  if (customerType !== 'brand' && customerType !== 'agency') {
    return { status: 'error', fieldErrors: { customerType: 'Choose brand or agency.' } };
  }

  const { error } = await createSessionClient()
    .from('organizations')
    .update({ name, customer_type: customerType })
    .eq('id', viewer.organization.id);

  if (error) {
    console.error('[workspace] update failed', error.message);
    // RLS admits owners and admins only. A member who is neither gets the same
    // "no rows" outcome as a missing workspace, and saying which would tell
    // them something about the org they are not entitled to.
    return { status: 'error', message: 'Could not save. Only a workspace owner or admin can.' };
  }

  // The name is in the header on every page, so the whole shell is stale.
  revalidatePath('/', 'layout');
  return { status: 'success', message: 'Workspace updated.' };
}
