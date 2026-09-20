import type { ReactNode } from 'react';

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
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
      <aside
        aria-label="Page controls"
        className={`w-full lg:w-[340px] lg:shrink-0 ${sticky ? 'lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto' : ''}`}
      >
        {sidebar}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
