'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * A searchable multi-select that posts like a plain form field.
 *
 * WHY NOT A LIBRARY. Two hundred and forty-eight countries in a `<select
 * multiple>` is unusable and a combobox package is a dependency for one
 * control. This is the small version: chips for what is chosen, a filter box, a
 * bounded list, and a hidden input per selection so the value arrives in
 * `formData.getAll(name)` exactly as a checkbox group would. Nothing here needs
 * JavaScript to SUBMIT — only to choose.
 *
 * NAMES, NOT CODES. The customer picks "United Kingdom"; `GB` is what travels.
 * A field that asks for a two-letter code is one people get wrong silently —
 * `UK` is not a country code — and being wrong here means a search quietly
 * preferring the wrong market.
 *
 * `allowCustom` exists because a fixed category list cannot anticipate every
 * product. It is off for countries and languages, where a value outside the
 * vocabulary is not a preference the API can act on.
 */

export interface TokenOption {
  code: string;
  name: string;
}

export function TokenSelect({
  name,
  label,
  hint,
  options,
  selected,
  placeholder,
  allowCustom = false,
  max = 12,
}: {
  name: string;
  label: string;
  hint?: string;
  options: TokenOption[];
  selected: string[];
  placeholder?: string;
  allowCustom?: boolean;
  max?: number;
}) {
  const [chosen, setChosen] = useState<string[]>(selected);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = input.current?.form;
    const reset = () => { setChosen(selected); setQuery(''); setOpen(false); };
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [selected]);

  const byCode = useMemo(() => new Map(options.map((o) => [o.code, o.name])), [options]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((option) => !chosen.includes(option.code))
      .filter((option) => (q ? option.name.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [options, chosen, query]);

  function add(code: string) {
    if (!code || chosen.includes(code) || chosen.length >= max) return;
    setChosen([...chosen, code]);
    setQuery('');
    input.current?.focus();
  }

  function remove(code: string) {
    setChosen(chosen.filter((c) => c !== code));
  }

  const custom = query.trim();
  const canAddCustom =
    allowCustom && custom.length >= 2 && !matches.some((m) => m.name.toLowerCase() === custom.toLowerCase());

  return (
    <div>
      <label className="block text-[12px] font-medium text-ink" htmlFor={inputId}>
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{hint}</p> : null}

      {chosen.map((code) => (
        <input key={code} type="hidden" name={name} value={code} />
      ))}

      {chosen.length ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {chosen.map((code) => (
            <li key={code}>
              <span className="inline-flex items-center gap-1 rounded-md border border-line bg-paper py-1 pl-2 pr-1 text-[12px] text-ink">
                {byCode.get(code) ?? code}
                <button
                  type="button"
                  onClick={() => remove(code)}
                  aria-label={`Remove ${byCode.get(code) ?? code}`}
                  className="rounded p-0.5 text-ink-faint hover:text-rose"
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <input
          id={inputId}
          ref={input}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder={chosen.length >= max ? `Up to ${max}` : placeholder}
          disabled={chosen.length >= max}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // A blur that closes immediately eats the click on the option. The
          // delay is the usual, unglamorous fix.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (matches[0]) add(matches[0].code);
              else if (canAddCustom) add(custom);
            }
            if (event.key === 'Escape') setOpen(false);
          }}
          className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-faint disabled:bg-paper"
        />

        {open && (matches.length > 0 || canAddCustom) ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
          >
            {matches.map((option) => (
              <li key={option.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(option.code)}
                  className="block w-full px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-paper"
                >
                  {option.name}
                </button>
              </li>
            ))}
            {canAddCustom ? (
              <li>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(custom)}
                  className="block w-full px-2.5 py-1.5 text-left text-[13px] text-indigo hover:bg-paper"
                >
                  Add “{custom}”
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
