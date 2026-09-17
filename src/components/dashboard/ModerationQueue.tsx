'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { EyeOff, ShieldCheck, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { moderateComment } from '@/app/actions/moderate';
import { INITIAL_MODERATE_STATE, type ModerateState } from '@/lib/report/moderation-state';
import { isActionable, type QueueItem } from '@/lib/report/moderation';
import { BRAND_RISK_LABEL } from '@/types';
import { compactNumber, shortDate } from '@/lib/format';

function Act({ label, action, variant }: {
  label: string;
  action: 'hide' | 'keep';
  variant: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="action" value={action} size="sm" variant={variant} disabled={pending}>
      {action === 'hide' ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : null}
      {label}
    </Button>
  );
}

/**
 * One flagged comment, with the two things a creator can do about it.
 *
 * The excerpt is shown. That is uncomfortable and it is the point — a queue
 * that hides what it is asking you to judge is asking you to trust a
 * classifier, and this one is wrong often enough that "keep" has to be a real
 * option a creator can exercise on the evidence.
 */
function Row({ item }: { item: QueueItem }) {
  const [state, formAction] = useFormState<ModerateState, FormData>(
    moderateComment,
    INITIAL_MODERATE_STATE,
  );

  const done = state.status === 'success' || item.status !== 'pending';
  const status = state.status === 'success' ? null : item.status;

  return (
    <form action={formAction} className="px-5 py-3.5">
      <input type="hidden" name="queueId" value={item.id} />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-2">
          <Badge tone={item.byCreator ? 'rose' : 'amber'}>
            {BRAND_RISK_LABEL[item.category]}
          </Badge>
          {item.byCreator ? (
            <span className="flex items-center gap-1 text-[11px] text-rose">
              <TriangleAlert className="h-3 w-3" aria-hidden />
              yours
            </span>
          ) : null}
        </span>
        <span className="tnum text-[11px] text-ink-faint">
          {item.likes !== null ? `${compactNumber(item.likes)} likes · ` : ''}
          {item.publishedAt ? shortDate(item.publishedAt) : ''}
        </span>
      </div>

      <p className="mt-2 border-l-2 border-line pl-3 text-[12px] leading-relaxed text-ink-muted">
        {item.excerpt}
      </p>
      {item.videoTitle ? (
        <p className="mt-1 truncate text-[11px] text-ink-faint">on “{item.videoTitle}”</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.byCreator ? (
          /* No hide button. Hiding it would not change the report — what a
             creator wrote is counted whether or not it stays up — and a button
             that appears to fix the one thing it cannot fix is worse than none. */
          <p className="text-[11px] leading-relaxed text-ink-muted">
            You wrote this. It is counted in your report whether or not it stays up, so hiding it
            here would change nothing — that is deliberate.
          </p>
        ) : isActionable(item) && !done ? (
          <>
            <Act label="Hide on YouTube" action="hide" variant="primary" />
            <Act label="Not a problem" action="keep" variant="secondary" />
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald" aria-hidden />
            {state.status === 'success' ? state.message : status === 'hidden' ? 'Hidden' : 'Kept'}
          </span>
        )}

        {state.status === 'error' && state.queueId === item.id ? (
          <span className="text-[12px] leading-relaxed text-rose">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}

export function ModerationQueue({ items }: { items: QueueItem[] }) {
  if (items.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-[13px] leading-relaxed text-ink-muted">
        Nothing flagged. If the scan has not run yet this is not a clean result — it is no result.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id}>
          <Row item={item} />
        </li>
      ))}
    </ul>
  );
}
