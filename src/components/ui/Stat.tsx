import { cn } from '@/lib/cn';

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'emerald' | 'amber' | 'rose';
  className?: string;
}) {
  return (
    <div className={cn('px-5 py-4', className)}>
      <div className="rail">{label}</div>
      <div
        className={cn(
          'tnum mt-2 text-[26px] font-medium leading-none tracking-tight',
          tone === 'emerald' && 'text-emerald',
          tone === 'amber' && 'text-amber',
          tone === 'rose' && 'text-rose',
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-2 text-[11px] leading-snug text-ink-faint">{hint}</div> : null}
    </div>
  );
}
