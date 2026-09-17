'use server';

import { revalidatePath } from 'next/cache';

import { offerInputSchema, parseAccessToken } from '@/lib/schemas';
import { createAnonClient, createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getViewer } from '@/lib/access/viewer';

export interface OfferFormState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
}


/**
 * Sends a formal offer.
 *
 * Routed through `submit_offer()` for both senders. The RPC re-validates the
 * Track A token on the same terms that unlocked the report, and independently
 * re-checks the Pro-agency entitlement — so a stale page or a hand-crafted POST
 * cannot send an offer the viewer was never entitled to send.
 */
export async function submitOffer(
  _prev: OfferFormState,
  formData: FormData,
): Promise<OfferFormState> {
  const parsed = offerInputSchema.safeParse({
    handle: formData.get('handle'),
    companyName: formData.get('companyName'),
    senderName: formData.get('senderName'),
    senderEmail: formData.get('senderEmail'),
    deliverables: formData.get('deliverables'),
    amount: formData.get('amount'),
    currency: formData.get('currency') || undefined,
    flightStart: formData.get('flightStart'),
    flightEnd: formData.get('flightEnd'),
    exclusivityDays: formData.get('exclusivityDays'),
    usageRights: formData.get('usageRights'),
    notes: formData.get('notes'),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      fieldErrors[field] ??= issue.message;
    }
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors };
  }

  const token = parseAccessToken(formData.get('token')?.toString());

  if (!isSupabaseConfigured()) {
    return { status: 'success', message: 'Offer sent.' };
  }

  // A token holder has no session; a Pro member does. Use whichever client
  // carries the credential the RPC will check.
  const viewer = token ? null : await getViewer();
  const supabase = token ? createAnonClient() : createSessionClient();

  if (!token && !viewer?.isProAgency) {
    return {
      status: 'error',
      message: 'You need a valid access link or a Pro Agency plan to send an offer.',
    };
  }

  const { error } = await supabase.rpc('submit_offer', {
    p_creator_handle: parsed.data.handle,
    p_company_name: parsed.data.companyName,
    p_sender_name: parsed.data.senderName,
    p_sender_email: parsed.data.senderEmail,
    p_deliverables: parsed.data.deliverables,
    p_amount: parsed.data.amount,
    p_currency: parsed.data.currency,
    p_flight_start: parsed.data.flightStart,
    p_flight_end: parsed.data.flightEnd,
    p_exclusivity_days: parsed.data.exclusivityDays,
    p_usage_rights: parsed.data.usageRights,
    p_notes: parsed.data.notes,
    p_token: token,
  });

  if (error) {
    console.error('[submit_offer] rpc failed', { handle: parsed.data.handle, error: error.message });

    if (error.message.includes('invalid_grant')) {
      return {
        status: 'error',
        message: 'Your access link has expired or been revoked. Request access again to send an offer.',
      };
    }
    if (error.message.includes('creator_not_found')) {
      return { status: 'error', message: 'This creator is no longer accepting offers.' };
    }
    return { status: 'error', message: 'Could not send the offer. Please try again.' };
  }

  // TODO(phase-2): notify the creator by email that an offer is waiting.
  revalidatePath('/dashboard/offers');
  return { status: 'success', message: 'Offer sent.' };
}

export interface OfferDecisionState {
  status: 'idle' | 'success' | 'error';
  message?: string;
}


/**
 * Creator accepts or declines. The client holds a column grant on `status`
 * alone, so this cannot alter the fee or the terms it is responding to.
 */
export async function respondToOffer(
  _prev: OfferDecisionState,
  formData: FormData,
): Promise<OfferDecisionState> {
  const offerId = parseAccessToken(formData.get('offerId')?.toString());
  const decision = String(formData.get('decision') ?? '');

  if (!offerId) return { status: 'error', message: 'Unknown offer.' };
  if (decision !== 'accepted' && decision !== 'declined') {
    return { status: 'error', message: 'Unknown decision.' };
  }

  const viewer = await getViewer();
  if (!viewer.creatorId) {
    return { status: 'error', message: 'Only the creator can respond to an offer.' };
  }

  if (!isSupabaseConfigured()) {
    revalidatePath('/dashboard/offers');
    return { status: 'success', message: decision === 'accepted' ? 'Offer accepted.' : 'Offer declined.' };
  }

  const supabase = createSessionClient();
  const { error } = await supabase.from('offers').update({ status: decision }).eq('id', offerId);

  if (error) {
    console.error('[offers] respond failed', { offerId, error: error.message });
    return { status: 'error', message: 'Could not save that decision. Please try again.' };
  }

  revalidatePath('/dashboard/offers');
  return {
    status: 'success',
    message: decision === 'accepted' ? 'Offer accepted.' : 'Offer declined.',
  };
}
