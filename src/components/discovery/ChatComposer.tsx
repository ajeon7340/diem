'use client';

import { useRef, useState, useTransition } from 'react';
import { ArrowUp, Undo2 } from 'lucide-react';

import { CATEGORY_LABEL } from '@/types';
import type { FilterState } from '@/lib/discovery/filter-state';
import { cn } from '@/lib/cn';

/**
 * A sentence turned into filters. It does not search and cannot.
 *
 * WHAT IT PRODUCES IS A PATCH, applied to the same state the filter panel
 * edits — so saying "50k to 500k subscribers, no crypto" ticks the same boxes
 * a customer would have ticked, and they can see it happen on the left. A chat
 * that returned creators would be a second, unverifiable source of results; a
 * chat that could start a run would let a misread sentence spend the day's
 * budget.
 *
 * NARROW PATCHES APPLY INSTANTLY. Run patches apply to the state and stop
 * there: the header asks before spending a search. The distinction is the
 * product's whole cost model and it is never decided by the model.
 *
 * EVERY TURN IS UNDOABLE, once. A patch the customer did not type key by key
 * needs a way back that is not "retype what you had".
 */

export interface Turn {
  id: number;
  said: string;
  understood: string;
  chips: string[];
  unsupported: string[];
  needsRun: boolean;
}

const QUICK_STARTS = ['technology', 'beauty', 'gaming', 'food_beverage'] as const;

export function ChatComposer({
  variant,
  query,
  onPatch,
  onUndo,
  canUndo,
  turns,
  onTurn,
}: {
  /** `hero` fills an empty panel; `bar` is the slim one under results. */
  variant: 'hero' | 'bar';
  query: string;
  onPatch: (patch: Partial<FilterState>) => { changed: string[]; needsRun: boolean };
  onUndo: () => void;
  canUndo: boolean;
  turns: Turn[];
  onTurn: (turn: Turn) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function send(message: string) {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/discover/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, filters: query }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Could not read that.');
        return;
      }
      const result = onPatch(data.patch ?? {});
      start(() =>
        onTurn({
          id: Date.now(),
          said: message,
          understood: data.explanation ?? '',
          chips: result.changed,
          unsupported: data.unsupported ?? [],
          needsRun: result.needsRun,
        }),
      );
      setValue('');
    } catch {
      setError('Could not reach the parser. The filters on the left still work.');
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  const field = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send(value);
      }}
      className={cn(
        'surface flex items-center gap-2 p-2',
        variant === 'hero' ? 'w-full' : 'w-full',
      )}
    >
      <input
        ref={input}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={
          variant === 'hero'
            ? 'Gaming creators in Korea, 50K–500K subscribers, no crypto'
            : 'Refine — “only ones posting weekly”'
        }
        aria-label="Describe what you are looking for"
        maxLength={500}
        className="min-h-9 min-w-0 flex-1 bg-transparent px-2 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
      />
      <button
        type="submit"
        disabled={!value.trim() || sending}
        aria-label="Apply to filters"
        className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo text-white hover:bg-indigo-hover disabled:bg-indigo/30"
      >
        <ArrowUp size={15} strokeWidth={2.25} aria-hidden />
      </button>
    </form>
  );

  const last = turns.at(-1);

  return (
    <div className={variant === 'hero' ? 'mx-auto w-full max-w-[560px]' : 'w-full'}>
      {/* The turn, as chips, so what was understood is checkable at a glance
          and revertible in one press. */}
      {last ? (
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="text-ink-muted">Understood</span>
          <span className="text-ink">{last.understood}</span>
          {canUndo ? (
            <button
              type="button"
              onClick={onUndo}
              className="press inline-flex min-h-7 items-center gap-1 rounded-full border border-line px-2 text-[11px] text-ink-muted hover:text-ink"
            >
              <Undo2 size={11} aria-hidden /> Undo
            </button>
          ) : null}
          {last.unsupported.map((line) => (
            <p key={line} className="w-full text-[11px] leading-relaxed text-amber">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mb-2 text-[12px] text-rose">
          {error}
        </p>
      ) : null}

      {field}

      {variant === 'hero' ? (
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {QUICK_STARTS.map((id) => (
            <li key={id}>
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  const phrase = `${CATEGORY_LABEL[id]} creators`;
                  setValue(phrase);
                  void send(phrase);
                }}
                className="press min-h-9 rounded-full border border-line bg-surface px-3 text-[13px] text-ink hover:border-indigo hover:text-indigo disabled:opacity-50"
              >
                {CATEGORY_LABEL[id]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className={cn('text-[11px] leading-relaxed text-ink-faint', variant === 'hero' ? 'mt-3 text-center' : 'mt-1.5')}>
        This sets filters. It does not search, and narrowing costs nothing.
        {pending ? ' Applying…' : ''}
      </p>
    </div>
  );
}
