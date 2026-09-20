import Link from 'next/link';

import { EMPTY_REASON_COPY, type EmptyReason } from '@/lib/discovery/types';

/**
 * A genuine empty state per reason, because they are not the same event.
 *
 * "No creators matched" and "our quota ran out" produce the same blank list and
 * mean opposite things, and only one of them is a fact about the customer's
 * market. Each state says what happened and what to do next; none of them
 * offers a retry for a condition retrying cannot clear.
 */
export function EmptyState({
  reason,
  detail,
  action,
}: {
  reason: EmptyReason;
  detail?: string | null;
  action?: { href: string; label: string } | null;
}) {
  const copy = EMPTY_REASON_COPY[reason];
  return (
    <div className="surface-card px-6 py-10 text-center">
      <h3 className="text-[15px] font-semibold text-ink">{copy.title}</h3>
      <p className="mx-auto mt-2 max-w-[56ch] text-[13px] leading-relaxed text-ink-muted">{copy.body}</p>
      {detail ? (
        <p className="mx-auto mt-3 max-w-[56ch] text-[12px] leading-relaxed text-ink-faint">{detail}</p>
      ) : null}
      {action ? (
        <Link href={action.href} className="primary-action mt-6">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
