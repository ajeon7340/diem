'use server';

import { headers } from 'next/headers';

import { accessRequestInputSchema } from '@/lib/schemas';
import { createAnonClient, isSupabaseConfigured } from '@/lib/supabase/server';

export interface ProposalFormState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  /** Keyed by form field name so the sheet can render inline errors. */
  fieldErrors?: Record<string, string>;
}


/**
 * Fixed-window limiter, per instance only. It exists so one browser cannot spam
 * a creator's inbox during the MVP; replace with a shared store (Upstash or a
 * Postgres table) before this runs on more than one node.
 */
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
const attempts = new Map<string, { count: number; resetAt: number }>();

function overRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

function clientKey(): string {
  const header = headers();
  const forwarded = header.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || header.get('x-real-ip') || 'unknown';
}

/**
 * Track A submission, bound to the proposal sheet via `useFormState`.
 *
 * Writes through `request_creator_access` rather than an INSERT: the function
 * is SECURITY DEFINER, so `status`, `access_token`, and `expires_at` are set by
 * the database and cannot be forged from the client. The brand stays anonymous
 * — no account required to propose.
 */
export async function submitProposal(
  _prev: ProposalFormState,
  formData: FormData,
): Promise<ProposalFormState> {
  const parsed = accessRequestInputSchema.safeParse({
    handle: formData.get('handle'),
    companyName: formData.get('companyName'),
    requesterName: formData.get('requesterName'),
    requesterEmail: formData.get('requesterEmail'),
    campaignObjective: formData.get('campaignObjective'),
    proposedBudget: formData.get('proposedBudget'),
    budgetCurrency: formData.get('budgetCurrency') || undefined,
    pitchNote: formData.get('pitchNote'),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      fieldErrors[field] ??= issue.message;
    }
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors };
  }

  if (overRateLimit(`${clientKey()}:${parsed.data.handle}`)) {
    return {
      status: 'error',
      message: 'Too many requests from this network. Try again in a few minutes.',
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: 'success',
      message: 'Proposal sent. The creator reviews every request personally.',
    };
  }

  const supabase = createAnonClient();
  const { error } = await supabase.rpc('request_creator_access', {
    p_handle: parsed.data.handle,
    p_company_name: parsed.data.companyName,
    p_requester_name: parsed.data.requesterName,
    p_requester_email: parsed.data.requesterEmail,
    p_campaign_objective: parsed.data.campaignObjective,
    p_proposed_budget: parsed.data.proposedBudget,
    p_budget_currency: parsed.data.budgetCurrency,
    p_pitch_note: parsed.data.pitchNote,
  });

  if (error) {
    console.error('[request_creator_access] rpc failed', {
      handle: parsed.data.handle,
      error: error.message,
    });

    if (error.message.includes('creator_not_found')) {
      return { status: 'error', message: 'This profile is no longer accepting proposals.' };
    }
    return { status: 'error', message: 'Could not send your proposal. Please try again.' };
  }

  // TODO(phase-2): enqueue the creator notification (email + dashboard badge).
  return {
    status: 'success',
    message: 'Proposal sent. The creator reviews every request personally.',
  };
}
