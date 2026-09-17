'use client';

import { useEffect } from 'react';
import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/Button';

/**
 * Screen-only controls. `window.print()` hands off to the browser's own
 * Save-as-PDF, which keeps the output as real text — no rasterising library,
 * no extra bundle, and the result stays searchable and copyable.
 */
export function PrintToolbar({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    // Let fonts settle before the dialog opens, or the sheet measures wrong.
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [auto]);

  return (
    <div className="print:hidden sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[186mm] flex-wrap items-center gap-3 px-3 py-2.5">
        <p className="text-[12px] text-ink-muted">
          One page, A4. Choose <strong className="font-medium text-ink">Save as PDF</strong> as the
          destination.
        </p>
        <Button size="sm" onClick={() => window.print()} className="ml-auto">
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print / Save PDF
        </Button>
      </div>
    </div>
  );
}
