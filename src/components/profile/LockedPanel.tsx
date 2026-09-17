import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';

import { Panel } from '@/components/ui/Panel';
import { RequestAccessButton } from './RequestAccessButton';

/**
 * A Panel whose body is frosted until access is granted.
 *
 * What sits under the glass is placeholder geometry, not the real figures —
 * locked metrics are never fetched for an unauthorised visitor, so there is
 * nothing in the DOM to reveal. The blur's job is curiosity: enough structure
 * to read as a real chart, not one legible number.
 */
export function LockedPanel({
  title,
  meta,
  locked,
  headline,
  detail,
  children,
  className,
}: {
  title: string;
  meta?: ReactNode;
  locked: boolean;
  headline: string;
  detail: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel title={title} meta={locked ? 'LOCKED' : meta} className={className}>
      <div className="relative">
        <div className={locked ? 'beneath' : undefined} aria-hidden={locked}>
          {children}
        </div>

        {locked ? (
          <div className="frost absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface">
              <Lock className="h-4 w-4 text-ink-faint" aria-hidden />
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink">{headline}</p>
              <p className="mx-auto mt-1 max-w-[40ch] text-[12px] leading-relaxed text-ink-muted">
                {detail}
              </p>
            </div>
            <RequestAccessButton size="sm" variant="secondary" label="Request access" showIcon={false} />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
