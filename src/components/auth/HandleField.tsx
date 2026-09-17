'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';

import { checkHandleAvailability } from '@/app/actions/onboarding';
import { cn } from '@/lib/cn';

type Availability =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken'; reason: string };

/**
 * Handle input with debounced availability lookup. Advisory only — the unique
 * index on `creators.handle` and the reserved-handle CHECK are what actually
 * decide, and `createCreatorProfile` maps both to an inline error.
 */
export function HandleField({ error }: { error?: string }) {
  const [value, setValue] = useState('');
  const [availability, setAvailability] = useState<Availability>({ state: 'idle' });
  const [, startTransition] = useTransition();

  useEffect(() => {
    const candidate = value.trim().replace(/^@+/, '').toLowerCase();
    if (candidate.length < 3) {
      setAvailability({ state: 'idle' });
      return;
    }

    setAvailability({ state: 'checking' });
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await checkHandleAvailability(candidate);
        setAvailability(
          result.available
            ? { state: 'available' }
            : { state: 'taken', reason: result.reason ?? 'That handle is taken' },
        );
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div>
      <label htmlFor="handle" className="rail block">
        Handle
      </label>

      <div
        className={cn(
          'mt-2 flex h-11 items-center rounded-md border bg-surface pr-3 transition-colors',
          'focus-within:ring-2 focus-within:ring-indigo/20',
          availability.state === 'taken' || error
            ? 'border-rose'
            : availability.state === 'available'
              ? 'border-emerald'
              : 'border-line focus-within:border-indigo',
        )}
      >
        <span className="tnum pl-3 text-[13px] text-ink-faint">adfit.com/@</span>
        <input
          id="handle"
          name="handle"
          required
          minLength={3}
          maxLength={30}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="yourname"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="tnum h-full flex-1 bg-transparent px-0.5 text-[13px] text-ink outline-none placeholder:text-ink-faint"
        />
        {availability.state === 'checking' ? (
          <LoaderCircle className="h-4 w-4 animate-spin text-ink-faint" aria-hidden />
        ) : availability.state === 'available' ? (
          <Check className="h-4 w-4 text-emerald" aria-hidden />
        ) : availability.state === 'taken' ? (
          <X className="h-4 w-4 text-rose" aria-hidden />
        ) : null}
      </div>

      <p
        className={cn(
          'mt-1.5 text-[11px]',
          error || availability.state === 'taken' ? 'text-rose' : 'text-ink-faint',
        )}
        aria-live="polite"
      >
        {error ??
          (availability.state === 'taken'
            ? availability.reason
            : availability.state === 'available'
              ? 'Available'
              : 'This is your public profile URL. 3–30 characters.')}
      </p>
    </div>
  );
}
