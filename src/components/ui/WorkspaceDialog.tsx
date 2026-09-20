'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Native modal supplies focus trapping, background inertness and focus return.
 * Children stay mounted so closing/reopening preserves unsaved form input. */
export function WorkspaceDialog({
  open,
  onClose,
  title,
  description,
  drawer = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  drawer?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'workspace-dialog bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/30 print:hidden',
        drawer
          ? 'workspace-drawer'
          : 'w-[calc(100%-2rem)] max-w-2xl rounded-2xl',
      )}
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id={`${id}-title`}
              className="break-words text-lg font-semibold tracking-tight"
            >
              {title}
            </h2>
            {description && (
              <p
                id={`${id}-description`}
                className="mt-1 text-xs text-ink-muted"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-paper"
          >
            <X size={19} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
          {children}
        </div>
      </div>
    </dialog>
  );
}
