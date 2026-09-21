import type { ReactNode } from 'react';

/**
 * The width of every contextual rail in the product, in one place.
 *
 * Channel analysis, campaigns, campaign detail and Settings shared 340px
 * through this component; discovery had its own panel at 300px, so the menu
 * shifted 40px sideways whenever somebody moved between discovery and anything
 * else. Same number, one definition — a second literal is how they drifted
 * apart the first time.
 */
export const RAIL_WIDTH = 'lg:w-[340px]';

/** Matches the shared WorkspaceLayout while allowing local review interactions. */
export function ContextWorkspace({
  sidebar,
  children,
  sticky = false,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  sticky?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <aside
        aria-label="Page controls"
        className={`w-full ${RAIL_WIDTH} lg:shrink-0 ${sticky ? 'lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto' : ''}`}
      >
        {sidebar}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
