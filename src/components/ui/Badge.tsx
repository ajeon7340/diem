import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose';

const TONES: Record<Tone, string> = {
  slate: 'border-line bg-paper text-ink-muted',
  indigo: 'border-indigo/25 bg-indigo-wash text-indigo',
  emerald: 'border-emerald/30 bg-emerald-wash text-emerald',
  amber: 'border-amber/30 bg-amber-wash text-amber',
  rose: 'border-rose/30 bg-rose-wash text-rose',
};

export function Badge({
  tone = 'slate',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
