'use server';

import { revalidatePath } from 'next/cache';

import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getViewer } from '@/lib/access/viewer';
import { parseAccessToken } from '@/lib/schemas';

export interface ReviewState {
  status: 'idle' | 'success' | 'error';
  message?: string;
}


/**
 * Creator approves or rejects a 1:1 proposal.
 *
 * The update names only `status`. Everything the approval implies — rotating
 * `access_token`, stamping `expires_at` 14 days out, resetting the view counter
 * — happens in the `access_requests` status trigger, and the client holds a
 * column-level grant on `(status, expires_at)` only. So this action cannot mint
 * a token or extend a grant even if it tried.
 */
export async function reviewAccessRequest(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const requestId = String(formData.get('requestId') ?? '');
  const decision = String(formData.get('decision') ?? '');

  if (!parseAccessToken(requestId)) {
    return { status: 'error', message: 'Unknown request.' };
  }

  if (decision !== 'approved' && decision !== 'rejected') {
    return { status: 'error', message: 'Unknown decision.' };
  }

  const viewer = await getViewer();
  if (!viewer.creatorId) {
    return { status: 'error', message: 'Only the creator can review proposals.' };
  }

  if (!isSupabaseConfigured()) {
    revalidatePath('/dashboard/requests');
    return {
      status: 'success',
      message: decision === 'approved' ? 'Approved — access link sent.' : 'Proposal declined.',
    };
  }

  const supabase = createSessionClient();
  const { error } = await supabase
    .from('access_requests')
    .update({ status: decision })
    .eq('id', requestId);

  if (error) {
    console.error('[access_requests] review failed', { requestId, error: error.message });
    return { status: 'error', message: 'Could not save that decision. Please try again.' };
  }

  // TODO(phase-2): email the requester their time-limited link on approval.
  revalidatePath('/dashboard/requests');
  return {
    status: 'success',
    message: decision === 'approved' ? 'Approved — access link sent.' : 'Proposal declined.',
  };
}
