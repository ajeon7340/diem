'use server';

import { revalidatePath } from 'next/cache';

import { getViewer } from '@/lib/access/viewer';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { parseAccessToken } from '@/lib/schemas';
import type { DemographicsRequestState, GrantReviewState } from '@/lib/report/policy-state';

/**
 * A Pro agency asks a creator to release their demographics.
 *
 * Both writes go through SECURITY DEFINER functions because the client holds
 * no INSERT or UPDATE on `demographics_grants` at all — an organisation able
 * to write `status` would approve its own request, which is the same hole as
 * an org admin setting their own billing_plan. The checks below produce the
 * error message; the database produces the guarantee.
 */
export async function requestDemographics(
  _prev: DemographicsRequestState,
  formData: FormData,
): Promise<DemographicsRequestState> {
  const creatorId = String(formData.get('creatorId') ?? '');
  const handle = String(formData.get('handle') ?? '');

  if (!parseAccessToken(creatorId)) {
    return { status: 'error', message: 'Unknown creator.' };
  }

  const viewer = await getViewer();
  if (!viewer.isProAgency || !viewer.organization) {
    return { status: 'error', message: 'Demographics requests require a Pro Agency plan.' };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: 'success',
      message: 'Request sent. The creator will see it on their dashboard.',
    };
  }

  const supabase = createSessionClient();
  const { error } = await supabase.rpc('request_demographics', { p_creator_id: creatorId });

  if (error) {
    console.error('[demographics_grants] request failed', { creatorId, error: error.message });
    return { status: 'error', message: 'Could not send the request.' };
  }

  if (handle) revalidatePath(`/@${handle}`);
  return {
    status: 'success',
    message: 'Request sent. The creator will see it on their dashboard.',
  };
}

/**
 * The creator approves or revokes one organisation.
 *
 * `owns_creator` inside the function is the gate, so passing someone else's
 * grant id changes nothing. Revoking is a first-class outcome rather than a
 * hidden setting: an approval a creator cannot take back is not really an
 * approval, and III.E.3.b rests on this being their decision.
 */
export async function reviewDemographicsGrant(
  _prev: GrantReviewState,
  formData: FormData,
): Promise<GrantReviewState> {
  const grantId = String(formData.get('grantId') ?? '');
  const decision = String(formData.get('decision') ?? '');

  if (!parseAccessToken(grantId)) {
    return { status: 'error', message: 'Unknown request.' };
  }
  if (decision !== 'approve' && decision !== 'revoke') {
    return { status: 'error', message: 'Unknown decision.' };
  }

  const viewer = await getViewer();
  if (!viewer.creatorId) {
    return { status: 'error', message: 'Only the creator can decide this.' };
  }

  if (!isSupabaseConfigured()) {
    return { status: 'success', message: decision === 'approve' ? 'Approved.' : 'Revoked.' };
  }

  const supabase = createSessionClient();
  const { error } = await supabase.rpc('review_demographics_grant', {
    p_grant_id: grantId,
    p_approve: decision === 'approve',
  });

  if (error) {
    console.error('[demographics_grants] review failed', { grantId, error: error.message });
    return { status: 'error', message: 'Could not record that decision.' };
  }

  revalidatePath('/dashboard/requests');
  return { status: 'success', message: decision === 'approve' ? 'Approved.' : 'Revoked.' };
}
