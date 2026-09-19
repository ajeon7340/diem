'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import {
  businessOnboardingSchema,
  creatorOnboardingSchema,
  handleSchema,
  youtubeHandleSchema,
} from '@/lib/schemas';
import {
  createAnonClient,
  createServiceClient,
  createSessionClient,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import { getViewer } from '@/lib/access/viewer';
import { analyzeAndStore } from '@/lib/ingest/store';
import { nextHandle, suggestHandle } from '@/lib/report/handle-suggest';
import { enqueueAnalysisJob } from '@/lib/ingest/jobs';
import { DEMO_ROLE_COOKIE, type DemoRole } from '@/lib/data/fixtures';
import { resolveChannel, type ResolvedChannel } from '@/lib/youtube/resolve';

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
 * Live handle availability for the signup form.
 *
 * Handles are public — they are URLs — so this exposes nothing a visitor could
 * not learn by loading `/@handle`. It runs on the anon client because a brand
 * new user checks availability before their session exists.
 */
export async function checkHandleAvailability(
  raw: string,
): Promise<{ available: boolean; reason?: string }> {
  const parsed = handleSchema.safeParse(raw);
  if (!parsed.success) {
    return { available: false, reason: parsed.error.issues[0]?.message };
  }

  if (!isSupabaseConfigured()) {
    // Fixture mode: only the two demo handles are taken.
    const taken = ['marahwoods', 'quietcircuit'].includes(parsed.data);
    return taken ? { available: false, reason: 'That handle is taken' } : { available: true };
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc('is_handle_available', { p_handle: parsed.data });

  if (error) {
    console.error('[is_handle_available] rpc failed', error.message);
    // Don't claim availability we could not confirm; the unique index is the
    // real arbiter and will reject a collision at insert time anyway.
    return { available: false, reason: 'Could not check right now' };
  }

  return data === true ? { available: true } : { available: false, reason: 'That handle is taken' };
}

/**
 * Resolve the channel the creator pasted, and propose the rest of the form
 * from it.
 *
 * The old form asked for a handle first, in a field whose rules are ours
 * ("3-30 characters, letters numbers underscores dots") and whose consequence
 * is permanent. The creator already told us who they are the moment they
 * pasted their channel; asking them to invent an identifier before that is
 * friction for nothing.
 *
 * Returns a PROPOSAL, never a decision. The handle comes back editable and
 * pre-checked, the display name comes back as the channel's own title, and a
 * channel with no ASCII form — @가재맨 — returns a null handle rather than a
 * romanisation nobody asked for, embedded permanently in their URL.
 */
export async function resolveChannelPreview(rawUrl: string): Promise<{
  ok: boolean;
  message?: string;
  channel?: {
    channelId: string;
    youtubeHandle: string;
    title: string;
    subscribers: number | null;
    thumbnail: string | null;
  };
  /** Free and checked, or null when nothing safe could be derived. */
  suggestedHandle?: string | null;
}> {
  const parsed = youtubeHandleSchema.safeParse(rawUrl);
  if (!parsed.success || !parsed.data) {
    return { ok: false, message: parsed.success ? 'Paste your channel URL.' : parsed.error.issues[0]?.message };
  }

  const resolved = await resolveChannel(parsed.data);
  if (!resolved.ok) return { ok: false, message: resolved.message };

  const base = suggestHandle({
    youtubeHandle: resolved.channel.handle,
    title: resolved.channel.title,
  });

  // Walk a few numbered variants rather than handing back one that is taken.
  // Bounded: after a handful of collisions the creator picks, which is a
  // better outcome than name7 and faster than looping.
  let suggested: string | null = null;
  if (base) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : nextHandle(base, attempt + 1);
      const { available } = await checkHandleAvailability(candidate);
      if (available) {
        suggested = candidate;
        break;
      }
    }
  }

  return {
    ok: true,
    channel: {
      channelId: resolved.channel.channelId,
      youtubeHandle: resolved.channel.handle,
      title: resolved.channel.title,
      subscribers: resolved.channel.subscribers,
      thumbnail: resolved.channel.thumbnail,
    },
    suggestedHandle: suggested,
  };
}

/**
 * Influencer registration: claims a handle and publishes the profile.
 *
 * A plain INSERT, not an RPC — 0001 already grants `authenticated` a
 * column-scoped INSERT on `creators` behind the `creators_owner_insert` policy.
 * The grant deliberately omits `is_verified`, so a creator cannot self-award
 * the verified badge on the way in; that stays the ingestion worker's to set
 * once OAuth data is confirmed.
 */
export async function createCreatorProfile(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = creatorOnboardingSchema.safeParse({
    handle: formData.get('handle'),
    youtubeHandle: formData.get('youtubeHandle'),
    displayName: formData.get('displayName'),
    niche: formData.get('niche'),
    bio: formData.get('bio'),
    budgetMin: formData.get('budgetMin'),
    budgetMax: formData.get('budgetMax'),
    budgetNegotiable: formData.get('budgetNegotiable'),
    isDirectoryVisible: formData.get('isDirectoryVisible'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  // Resolve the channel BEFORE writing anything, and before the fixture branch
  // — this needs the YouTube key, not a database, so the demo exercises it too.
  //
  // Onboarding used to write a `creators` row and nothing else: no channel was
  // recorded anywhere, so Studio — the one page that pays a creator back on day
  // one with no advertiser present — was permanently empty for every real
  // signup, with nothing in the product explaining why.
  //
  // A handle that does not resolve is worse than no handle at all: it looks
  // connected and never fills in. Checked here, returned as a field error,
  // while nothing is written and the creator is still looking at the field.
  let channel: ResolvedChannel | null = null;
  if (parsed.data.youtubeHandle) {
    const resolved = await resolveChannel(parsed.data.youtubeHandle);
    if (!resolved.ok) {
      return {
        status: 'error',
        message: resolved.message,
        fieldErrors: { youtubeHandle: resolved.message },
      };
    }
    channel = resolved.channel;
  }

  if (!isSupabaseConfigured()) {
    setDemoRole('creator');
    return {
      status: 'success',
      message: 'Profile created.',
      // The fixture set has no row for a freshly invented handle, so send the
      // demo user to the seeded creator profile they now "own".
      redirectTo: '/@marahwoods',
    };
  }

  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Your sign-in link expired. Request a new one.' };
  }

  const { data: created, error } = await supabase
    .from('creators')
    .insert({
    user_id: user.id,
    handle: parsed.data.handle,
    display_name: parsed.data.displayName,
    niche: parsed.data.niche,
    bio: parsed.data.bio,
    budget_min: parsed.data.budgetMin,
    // One figure given: store it as both ends. "from $15,000" is a different
    // claim from "$15,000" — it implies a ceiling the creator did not name —
    // and a null max also drops them out of any filter with an upper bound.
    budget_max: parsed.data.budgetMax ?? parsed.data.budgetMin,
    budget_negotiable: parsed.data.budgetNegotiable,
    // Kept in step so anything still reading the old column agrees with the
    // range rather than quietly contradicting it.
    minimum_budget: parsed.data.budgetMin,
    is_directory_visible: parsed.data.isDirectoryVisible,
    // Declared, not connected — see migration 0022. Enough for Studio, never
    // a basis for serving demographics.
    youtube_handle: channel?.handle ?? null,
    youtube_channel_id: channel?.channelId ?? null,
    youtube_checked_at: channel ? new Date().toISOString() : null,
    })
    .select('id')
    .single<{ id: string }>();

  if (error) {
    // 23505 covers both unique indexes on the table: handle and user_id.
    if (error.code === '23505') {
      return error.message.includes('user_id')
        ? { status: 'error', message: 'This account already has a creator profile.' }
        : { status: 'error', fieldErrors: { handle: 'That handle is taken' } };
    }
    if (error.code === '23514') {
      return { status: 'error', fieldErrors: { handle: 'That handle is not allowed' } };
    }

    console.error('[creators] insert failed', error.message);
    return { status: 'error', message: 'Could not create your profile. Please try again.' };
  }

  // Build the report NOW, from public data, before the creator lands on their
  // own profile.
  //
  // Without this a signup ends on "Access granted, but the report is still
  // generating — the AI pipeline runs after the creator connects their
  // accounts", which was true of nothing: no pipeline ran, then or later, and
  // the page said so forever. Measured at ~2-3s for 25 uploads and ~600
  // comments, about 15 quota units.
  //
  // Bounded deliberately. A channel with 1,400 uploads must not turn one
  // signup into a full census — `scripts/analyze-creator.ts` does the deep
  // pass, and this is the one that has to finish while someone is waiting.
  //
  // Never throws: the creator row is already written and their handle is
  // already taken, so a YouTube outage must not bounce them back to the form.
  if (channel) {
    const analysis = await analyzeAndStore(created.id, channel.channelId, {
      maxVideos: 25,
      maxComments: 600,
    });
    if (!analysis.ok) {
      console.error('[onboarding] analysis failed', { handle: parsed.data.handle, reason: analysis.reason });
    }

    // And QUEUE the pass that cannot run here.
    //
    // The analysis above reads public figures and no model: uploads, cadence,
    // engagement, disclosure, a keyword risk census. The classification is a
    // different size — 6,369 comments on @가재맨 was 43 model calls and 5m30s —
    // so it is recorded as owed and `scripts/worker.ts` pays it. Until this
    // line existed the debt was never recorded and never paid: sentiment,
    // purchase intent and the comment axes stayed null for every real signup
    // unless somebody remembered to run the script by hand.
    //
    // Failure here is logged and swallowed. The creator row is written, the
    // handle is taken, and a queue that is briefly unreachable must not bounce
    // them back to a form they can no longer submit —
    // `npm run worker -- --enqueue-missing` picks up whatever this dropped.
    // BOTH passes, as two jobs. They read the same comments and measure
    // different things — what an ad would sit beside, and what the section is
    // about and wants — so either can fail or be retried without taking the
    // other with it.
    const service = createServiceClient();
    for (const kind of ['classify_comments', 'classify_intent'] as const) {
      const queued = await enqueueAnalysisJob(service, created.id, kind);
      if (!queued.ok) {
        console.error('[onboarding] could not queue a pass', {
          handle: parsed.data.handle,
          kind,
          reason: queued.reason,
        });
      }
    }
  }

  revalidatePath('/', 'layout');
  return { status: 'success', message: 'Profile created.', redirectTo: `/@${parsed.data.handle}` };
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
    return { status: 'success', message: 'Workspace created.', redirectTo: '/directory' };
  }

  const viewer = await getViewer();
  if (!viewer.userId) {
    return { status: 'error', message: 'Your sign-in link expired. Request a new one.' };
  }
  if (viewer.organization) {
    return { status: 'success', message: 'Workspace ready.', redirectTo: '/directory' };
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
      return { status: 'success', message: 'Workspace ready.', redirectTo: '/directory' };
    }
    if (error.message.includes('not_authenticated')) {
      return { status: 'error', message: 'Your sign-in link expired. Request a new one.' };
    }

    console.error('[create_organization] rpc failed', error.message);
    return { status: 'error', message: 'Could not create your workspace. Please try again.' };
  }

  const orgId = (created as { organization_id: string }[] | null)?.[0]?.organization_id;
  const { industry, sells, audience, categories, objectives, climatePreference } = parsed.data;
  const hasProfile =
    industry ||
    sells ||
    audience ||
    categories.length > 0 ||
    objectives.length > 0 ||
    climatePreference !== null;

  if (orgId && hasProfile) {
    const { error: profileError } = await supabase
      .from('organizations')
      .update({
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
  return { status: 'success', message: 'Workspace created.', redirectTo: '/directory' };
}
