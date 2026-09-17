'use server';

import { revalidatePath } from 'next/cache';

import { campaignBriefInputSchema } from '@/lib/schemas';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getViewer } from '@/lib/access/viewer';

export interface BriefFormState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
  sentCount?: number;
}


/**
 * Track B bulk outbound: one brief, many recipients.
 *
 * Both writes go through the session client, so RLS re-checks the entitlement
 * per row — `campaign_brief_recipients` will reject any creator who has not set
 * `is_directory_visible`, even if a stale directory page offered them. The
 * viewer check below is for the error message, not the security.
 */
export async function sendCampaignBrief(
  _prev: BriefFormState,
  formData: FormData,
): Promise<BriefFormState> {
  const viewer = await getViewer();

  if (!viewer.isProAgency || !viewer.organization) {
    return { status: 'error', message: 'Bulk proposals require a Pro Agency plan.' };
  }

  const parsed = campaignBriefInputSchema.safeParse({
    title: formData.get('title'),
    objective: formData.get('objective'),
    briefNote: formData.get('briefNote'),
    budgetMin: formData.get('budgetMin'),
    budgetMax: formData.get('budgetMax'),
    budgetCurrency: formData.get('budgetCurrency') || undefined,
    creatorIds: formData.getAll('creatorIds').map(String),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      fieldErrors[field] ??= issue.message;
    }
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: 'success',
      message: 'Brief sent.',
      sentCount: parsed.data.creatorIds.length,
    };
  }

  const supabase = createSessionClient();

  const { data: brief, error: briefError } = await supabase
    .from('campaign_briefs')
    .insert({
      organization_id: viewer.organization.id,
      title: parsed.data.title,
      objective: parsed.data.objective,
      brief_note: parsed.data.briefNote,
      budget_min: parsed.data.budgetMin,
      budget_max: parsed.data.budgetMax,
      budget_currency: parsed.data.budgetCurrency,
    })
    .select('id')
    .single<{ id: string }>();

  if (briefError || !brief) {
    console.error('[campaign_briefs] insert failed', briefError?.message);
    return { status: 'error', message: 'Could not create the brief. Please try again.' };
  }

  const { data: recipients, error: recipientError } = await supabase
    .from('campaign_brief_recipients')
    .insert(parsed.data.creatorIds.map((creatorId) => ({ brief_id: brief.id, creator_id: creatorId })))
    .select('id');

  if (recipientError) {
    console.error('[campaign_brief_recipients] insert failed', recipientError.message);
    return {
      status: 'error',
      message:
        'The brief was saved but could not be delivered — one or more creators are no longer listed in the directory.',
    };
  }

  // TODO(phase-2): fan out creator notifications for each recipient row.
  revalidatePath('/directory');
  return { status: 'success', message: 'Brief sent.', sentCount: recipients?.length ?? 0 };
}
