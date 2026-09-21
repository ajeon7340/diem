import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * What adfit managed to collect — never what the customer decided about it.
 *
 * SIX STATES, AND FOUR OF THEM ARE NOT FINDINGS. Missing, failed, restricted
 * and expired are things that happened to our collection; only `ready` and
 * `partial` describe evidence. They were previously collapsed into one line of
 * summary prose beside the customer's own decision, which made "Analysis could
 * not be completed" read like a judgement about the creator.
 *
 * COLOUR IS NEVER THE ONLY CHANNEL. Every state carries its word, so the
 * difference survives greyscale printing and colour-blindness.
 */
export type CollectionState =
  | 'ready'
  | 'partial'
  | 'queued'
  | 'running'
  | 'failed'
  | 'missing'
  | 'expired'
  | 'restricted';

const LABEL: Record<CollectionState, string> = {
  ready: 'Ready',
  partial: 'Partial',
  queued: 'Queued',
  running: 'Collecting',
  failed: 'Failed',
  missing: 'Not collected',
  expired: 'Expired',
  restricted: 'Restricted',
};

const TONE: Record<CollectionState, string> = {
  ready: 'border-emerald/30 bg-emerald-wash text-emerald',
  partial: 'border-amber/30 bg-amber-wash text-amber',
  queued: 'border-line bg-paper text-ink-muted',
  running: 'border-indigo/25 bg-indigo-wash text-indigo',
  failed: 'border-rose/30 bg-rose-wash text-rose',
  missing: 'border-line bg-paper text-ink-muted',
  expired: 'border-line-strong bg-paper text-ink-muted',
  restricted: 'border-line-strong bg-paper text-ink-muted',
};

export function StateLabel({
  state,
  children,
  className,
}: {
  state: CollectionState;
  /** A spinner, where the state is one that moves. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border px-1.5 py-0.5 text-[11px] font-medium leading-[18px]',
        TONE[state],
        className,
      )}
    >
      {children}
      {LABEL[state]}
    </span>
  );
}

export { LABEL as COLLECTION_STATE_LABEL };
