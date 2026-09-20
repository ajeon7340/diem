'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { getViewer } from '@/lib/access/viewer';
import { onboardingDestination } from '@/lib/channel/state';
import { brandSchema } from '@/lib/schemas-brand';
import { validCountries, validLanguages } from '@/lib/locale/vocabulary';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Saving, archiving and defaulting a brand.
 *
 * ASYNC FUNCTIONS ONLY in this file — see `app/actions/state.ts`. A constant
 * exported beside an action 500s every action in the module on a production
 * build while the page still renders fine.
 *
 * Every write goes through `save_brand`, which is where "does this workspace
 * own this brand" is decided once rather than at each call site, and where the
 * idempotency lives: a retried action or a double-submitted form updates the
 * row it created instead of leaving an agency with two clients nobody can tell
 * apart.
 */

export interface BrandState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
  brandId?: string;
  redirectTo?: string;
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0] ?? 'form')] ??= issue.message;
  return out;
}

export async function saveBrand(_prev: BrandState, form: FormData): Promise<BrandState> {
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) {
    return { status: 'error', message: 'Sign in and name a workspace first.' };
  }

  const parsed = brandSchema.safeParse({
    id: form.get('brandId') || null,
    name: form.get('name'),
    sells: form.get('sells'),
    categories: form.getAll('categories'),
    website: form.get('website'),
    customerNeeds: form.get('customerNeeds'),
    markets: form.getAll('markets'),
    contentLanguages: form.getAll('contentLanguages'),
    makeDefault: form.get('makeDefault'),
  });

  if (!parsed.success) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrors(parsed.error.issues) };
  }

  const { data, error } = await createSessionClient().rpc('save_brand', {
    p_org: viewer.organization.id,
    p_id: parsed.data.id,
    p_name: parsed.data.name,
    p_sells: parsed.data.sells,
    p_categories: parsed.data.categories,
    p_website: parsed.data.website,
    p_customer_needs: parsed.data.customerNeeds,
    p_markets: parsed.data.markets,
    p_languages: parsed.data.contentLanguages,
    p_make_default: parsed.data.makeDefault,
  });

  if (error) {
    // Both of these mean the same thing to a customer — this is not your brand
    // — and saying which would confirm that an id exists somewhere else.
    if (error.message.includes('brand_not_in_workspace') || error.message.includes('not_a_member')) {
      return { status: 'error', message: 'That brand is not in this workspace.' };
    }
    console.error('[brand] save failed', error.message);
    return { status: 'error', message: 'Could not save this brand. Please try again.' };
  }

  const brandId = data as string | null;
  revalidatePath('/settings');
  revalidatePath('/discover');

  const destination = form.get('continueTo');
  if (destination === 'onboarding') {
    return {
      status: 'success',
      brandId: brandId ?? undefined,
      redirectTo: onboardingDestination(form.get('channel'), brandId),
    };
  }
  return { status: 'success', message: 'Brand saved.', brandId: brandId ?? undefined };
}

/**
 * "Set up later", which is an ANSWER and is recorded as one.
 *
 * Somebody with a channel ready to analyse should reach their first report
 * without describing their company first. The state stops them being asked
 * again on the next sign-in, and every later surface offers a small prompt
 * rather than a wall.
 */
export async function skipBrandSetup(form: FormData): Promise<void> {
  const viewer = await getViewer();
  const channel = form.get('channel');
  if (viewer.organization && isSupabaseConfigured()) {
    await createSessionClient()
      .from('organizations')
      .update({ brand_setup_state: 'skipped' })
      .eq('id', viewer.organization.id);
    revalidatePath('/', 'layout');
  }
  redirect(onboardingDestination(channel, null));
}

export async function setDefaultBrand(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) return;
  const brandId = String(form.get('brandId') ?? '');

  // Scoped through `brands` rather than trusting the id: the column grant lets
  // a member write `default_brand_id`, and without this check they could point
  // it at a row in another workspace and read the name back off the selector.
  const { data: owned } = await createSessionClient()
    .from('brands')
    .select('id')
    .eq('id', brandId)
    .eq('organization_id', viewer.organization.id)
    .maybeSingle<{ id: string }>();
  if (!owned) return;

  await createSessionClient()
    .from('organizations')
    .update({ default_brand_id: brandId })
    .eq('id', viewer.organization.id);
  revalidatePath('/settings');
  revalidatePath('/discover');
}

/**
 * Archive, never delete.
 *
 * A client who leaves must not take the record of what was run for them. The
 * campaigns, their briefs and their candidate lists all stay; the brand simply
 * stops appearing in selectors.
 */
export async function archiveBrand(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) return;
  const brandId = String(form.get('brandId') ?? '');
  const restore = form.get('restore') === 'true';

  const supabase = createSessionClient();
  await supabase
    .from('brands')
    .update({ archived_at: restore ? null : new Date().toISOString() })
    .eq('id', brandId)
    .eq('organization_id', viewer.organization.id);

  if (!restore && viewer.organization.defaultBrandId === brandId) {
    // A default pointing at an archived brand would keep selecting it on every
    // search while the selector no longer offers it.
    await supabase.from('organizations').update({ default_brand_id: null }).eq('id', viewer.organization.id);
  }
  revalidatePath('/settings');
  revalidatePath('/discover');
}

/**
 * Promote what is currently in the search panel to the brand's defaults.
 *
 * EXPLICIT, AND ONLY THIS. The discovery form writes nothing to a brand on its
 * own: somebody trying a different market to see what comes back must not
 * discover a week later that their saved profile changed underneath them. This
 * runs from one named button, saves the three fields that are genuinely brand
 * attributes — what is sold, the market, the language — and deliberately leaves
 * TOPICS alone, because topics describe a search and not a company.
 */
export async function saveSearchAsBrandDefaults(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) return;
  const brandId = String(form.get('brandId') ?? '');
  if (!brandId) return;

  const supabase = createSessionClient();
  const { data: brand } = await supabase
    .from('brands')
    .select('id, markets, content_languages')
    .eq('id', brandId)
    .eq('organization_id', viewer.organization.id)
    .maybeSingle<{ id: string; markets: string[]; content_languages: string[] }>();
  if (!brand) return;

  const sells = String(form.get('product') ?? '').trim().slice(0, 600);
  const market = validCountries(String(form.get('market') ?? ''));
  const language = validLanguages(String(form.get('language') ?? ''));

  // ADDED TO THE FRONT, not replacing the list. A brand selling into four
  // markets that searched one of them has not stopped selling into the other
  // three, and overwriting the list here would quietly delete three saved
  // answers to record one.
  const markets = [...new Set([...market, ...(brand.markets ?? [])])].slice(0, 12);
  const languages = [...new Set([...language, ...(brand.content_languages ?? [])])].slice(0, 12);

  const { error } = await supabase
    .from('brands')
    .update({
      ...(sells ? { sells } : {}),
      markets,
      content_languages: languages,
    })
    .eq('id', brandId)
    .eq('organization_id', viewer.organization.id);
  if (error) console.error('[brand] defaults save failed', error.message);

  revalidatePath('/discover');
  revalidatePath('/settings');
}

/**
 * Attach an existing campaign to a brand, one at a time, by a person.
 *
 * The safe linking path for everything that predates brands. `campaigns.brand`
 * is free text somebody typed, and two campaigns reading "Northbeam" may be two
 * clients at one agency; a migration that linked them on a string match would
 * merge client relationships silently. This is the alternative: a human says
 * which, and the trigger in 0041 refuses a brand from another workspace.
 */
export async function linkCampaignBrand(form: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer.organization || !isSupabaseConfigured()) return;
  const campaignId = String(form.get('campaignId') ?? '');
  const brandId = String(form.get('brandId') ?? '') || null;

  const { error } = await createSessionClient()
    .from('campaigns')
    .update({ brand_id: brandId })
    .eq('id', campaignId)
    .eq('organization_id', viewer.organization.id);
  if (error) console.error('[brand] campaign link failed', error.message);

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath('/settings');
}
