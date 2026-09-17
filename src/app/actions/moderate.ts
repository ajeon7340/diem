'use server';

import { revalidatePath } from 'next/cache';

import { getViewer } from '@/lib/access/viewer';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { MODERATION_QUOTA_COST } from '@/lib/report/moderation';
import type { ModerateState } from '@/lib/report/moderation-state';

/** The scope `comments.setModerationStatus` requires. Nothing narrower works. */
const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';

/**
 * Hide a comment on the creator's own channel, or keep it.
 *
 * The write goes to YouTube, not to us: `comments.setModerationStatus` with the
 * creator's own OAuth token. adfit never holds the power to moderate someone's
 * channel — it holds a token that creator granted, and the moment they revoke
 * it this stops working, which is the correct shape for a feature that deletes
 * other people's writing.
 *
 * `kept` writes nothing to YouTube at all. A creator deciding a flagged comment
 * is fine is a judgement about our classifier, and it belongs in our queue
 * rather than in an API call.
 */
export async function moderateComment(
  _prev: ModerateState,
  formData: FormData,
): Promise<ModerateState> {
  const queueId = String(formData.get('queueId') ?? '');
  const action = String(formData.get('action') ?? '');

  if (action !== 'hide' && action !== 'keep') {
    return { status: 'error', message: 'Unknown action.' };
  }

  const viewer = await getViewer();
  if (!viewer.creatorId) {
    return { status: 'error', message: 'Only the creator can moderate their own comments.' };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: 'success',
      message: action === 'hide' ? 'Hidden.' : 'Kept.',
      queueId,
    };
  }

  const supabase = createSessionClient();

  // RLS scopes this to the caller's own creator row; the id narrows, it does
  // not authorise.
  const { data: item } = await supabase
    .from('comment_moderation_queue')
    .select('id, comment_id, by_creator, status')
    .eq('id', queueId)
    .maybeSingle<{ id: string; comment_id: string; by_creator: boolean; status: string }>();

  if (!item) return { status: 'error', message: 'Not found.' };

  if (action === 'keep') {
    await supabase
      .from('comment_moderation_queue')
      .update({ status: 'kept', acted_at: new Date().toISOString() })
      .eq('id', item.id);
    revalidatePath('/dashboard/moderation');
    return { status: 'success', message: 'Kept — it stays visible.', queueId };
  }

  // Hiding your own comment changes nothing that matters: `byCreator` is what
  // reaches the rating and it ignores `hidden` on purpose, because deleting
  // what you wrote does not unwrite it. Offering the button anyway would be
  // the most misleading control on the page.
  if (item.by_creator) {
    return {
      status: 'error',
      message:
        'This is your own comment. Hiding it will not change your report — what you wrote is counted whether or not it stays up.',
      queueId,
    };
  }

  const { data: account } = await supabase
    .from('social_accounts')
    .select('access_token, scopes, token_expires_at')
    .eq('creator_id', viewer.creatorId)
    .eq('platform', 'youtube')
    .maybeSingle<{ access_token: string; scopes: string[]; token_expires_at: string | null }>();

  if (!account) {
    return {
      status: 'error',
      message: 'Connect your YouTube channel before moderating from here.',
      queueId,
    };
  }
  if (!account.scopes?.includes(REQUIRED_SCOPE)) {
    // Named rather than generic: a creator who reconnects without knowing what
    // is missing will grant the same scopes again and land right back here.
    return {
      status: 'error',
      message:
        'Your YouTube connection does not include comment-moderation permission. Reconnect and approve "Manage your YouTube account" to enable hiding.',
      queueId,
    };
  }
  if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
    return { status: 'error', message: 'Your YouTube connection has expired. Reconnect to continue.', queueId };
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/comments/setModerationStatus');
  url.searchParams.set('id', item.comment_id);
  url.searchParams.set('moderationStatus', 'rejected');

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.access_token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[moderate] setModerationStatus failed', { status: res.status, body: body.slice(0, 300) });
    // 403 here is almost always the daily quota, and a creator deserves to
    // know that rather than "something went wrong" — the limit is roughly 200
    // hides a day and they may have just hit it.
    return {
      status: 'error',
      message:
        res.status === 403
          ? `YouTube refused this one. The usual cause is the daily quota — each hide costs ${MODERATION_QUOTA_COST} units of a 10,000/day budget, so about 200 a day. Try again tomorrow or request a quota increase.`
          : 'YouTube rejected the request.',
      queueId,
    };
  }

  await supabase
    .from('comment_moderation_queue')
    .update({ status: 'hidden', acted_at: new Date().toISOString() })
    .eq('id', item.id);

  revalidatePath('/dashboard/moderation');
  return { status: 'success', message: 'Hidden on YouTube.', queueId };
}
