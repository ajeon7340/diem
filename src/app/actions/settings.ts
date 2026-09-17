'use server';

import { revalidatePath } from 'next/cache';

import { creatorOnboardingSchema } from '@/lib/schemas';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getViewer } from '@/lib/access/viewer';

export interface SettingsState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
}


/**
 * Creator profile settings.
 *
 * Reuses the onboarding schema, so the handle rules and the reserved-route
 * check are defined once. The UPDATE names only columns the client holds a
 * grant on — `is_verified` is deliberately absent from that grant, so this
 * cannot self-award the badge no matter what is posted.
 */
export async function updateCreatorSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = creatorOnboardingSchema.safeParse({
    handle: formData.get('handle'),
    displayName: formData.get('displayName'),
    niche: formData.get('niche'),
    bio: formData.get('bio'),
    budgetMin: formData.get('budgetMin'),
    budgetMax: formData.get('budgetMax'),
    budgetNegotiable: formData.get('budgetNegotiable'),
    isDirectoryVisible: formData.get('isDirectoryVisible'),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      fieldErrors[field] ??= issue.message;
    }
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors };
  }

  const viewer = await getViewer();
  if (!viewer.creatorId) {
    return { status: 'error', message: 'Only the creator can change these settings.' };
  }

  if (!isSupabaseConfigured()) {
    revalidatePath('/dashboard/settings');
    return { status: 'success', message: 'Settings saved.' };
  }

  const supabase = createSessionClient();
  const { error } = await supabase
    .from('creators')
    .update({
      handle: parsed.data.handle,
      display_name: parsed.data.displayName,
      niche: parsed.data.niche,
      bio: parsed.data.bio,
      budget_min: parsed.data.budgetMin,
    budget_max: parsed.data.budgetMax,
    budget_negotiable: parsed.data.budgetNegotiable,
    minimum_budget: parsed.data.budgetMin,
      is_directory_visible: parsed.data.isDirectoryVisible,
    })
    .eq('id', viewer.creatorId);

  if (error) {
    if (error.code === '23505') {
      return { status: 'error', fieldErrors: { handle: 'That handle is taken' } };
    }
    if (error.code === '23514') {
      return { status: 'error', fieldErrors: { handle: 'That handle is not allowed' } };
    }
    console.error('[creators] settings update failed', error.message);
    return { status: 'error', message: 'Could not save your settings. Please try again.' };
  }

  revalidatePath('/', 'layout');
  return { status: 'success', message: 'Settings saved.' };
}

export interface RevokeState {
  status: 'idle' | 'success' | 'error';
  message?: string;
}


/**
 * Pulls an approved access grant back before it expires.
 *
 * The schema always allowed this — `expires_at` is in the creator's column
 * grant — but nothing in the UI exposed it, so "revocable" was a claim the
 * product made and could not honour. Setting the expiry into the past closes
 * the link on the next read: `get_report_by_token` reports it as expired, which
 * is a better dead end for the holder than a silent failure.
 */
export async function revokeAccess(_prev: RevokeState, formData: FormData): Promise<RevokeState> {
  const requestId = String(formData.get('requestId') ?? '');
  const viewer = await getViewer();

  if (!viewer.creatorId) {
    return { status: 'error', message: 'Only the creator can revoke access.' };
  }

  if (!isSupabaseConfigured()) {
    revalidatePath('/dashboard/requests');
    return { status: 'success', message: 'Access revoked.' };
  }

  const supabase = createSessionClient();
  const { error } = await supabase
    .from('access_requests')
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', requestId)
    .eq('creator_id', viewer.creatorId);

  if (error) {
    console.error('[access_requests] revoke failed', { requestId, error: error.message });
    return { status: 'error', message: 'Could not revoke that link. Please try again.' };
  }

  revalidatePath('/dashboard/requests');
  return { status: 'success', message: 'Access revoked. The link no longer opens the report.' };
}
