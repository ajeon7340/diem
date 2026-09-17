'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Sparkles, TriangleAlert } from 'lucide-react';

import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { generateFitSummary } from '@/app/actions/fit-summary';
import {
  INITIAL_FIT_STATE,
  type FitClaim,
  type FitSummaryState,
} from '@/lib/report/fit';
import { CAMPAIGN_CATEGORIES, CATEGORY_LABEL } from '@/types';

/**
 * Why this creator, for the organisation reading the page.
 *
 * The only generated prose in the report, and it is here on one condition:
 * it is written against the viewer's own organisation, so it says something
 * the tiles cannot. Everything else the report deleted — the verdict, the
 * per-platform reads, the do/avoid brief — was generic, and generic prose over
 * figures is just the figures said less precisely.
 *
 * Three things this panel is obliged to show, none of them decoration:
 *
 *   - WHAT IT IS. Labelled as generated, every time. A reader who mistakes
 *     this for a measured figure has been misled by the typography alone.
 *   - WHAT IT RESTS ON. Each claim's figure is printed beneath the paragraph.
 *     Every other piece of evidence in this report links to its source; this
 *     one cannot, so the citation is shown instead.
 *   - WHEN IT REFUSED. A thin report produces no summary, and the panel says
 *     why rather than rendering an empty box that reads as a loading failure.
 */
function GenerateButton({ hasSummary }: { hasSummary: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={hasSummary ? 'secondary' : 'primary'} disabled={pending}>
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      {pending ? 'Reading…' : hasSummary ? 'Read again' : 'Read against my brief'}
    </Button>
  );
}

function ClaimList({ claims }: { claims: FitClaim[] }) {
  if (claims.length === 0) return null;
  return (
    <dl className="mt-4 space-y-1.5 border-t border-line pt-3">
      {claims.map((claim) => (
        <div key={`${claim.metric}:${claim.value}`} className="flex items-baseline gap-2">
          <dt className="tnum shrink-0 text-[11px] text-ink-faint">{claim.metric}</dt>
          <dd className="tnum text-[11px] text-ink-muted">{claim.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FitSummaryPanel({
  handle,
  entitled,
  /**
   * Set when the report can never support a summary, decided on the server
   * before render. Without it the panel invited a click and refused afterwards
   * — which spends a round trip to tell the reader something the report
   * already knew, and reads as a failure rather than a decision.
   */
  unavailable,
  cached,
}: {
  handle: string;
  entitled: boolean;
  /**
   * A read written on an earlier visit. Rendered immediately; the generator
   * only runs when there isn't one.
   *
   * Caching is not only about cost. Two people at the same agency opening the
   * same creator and reading different arguments for the same numbers would
   * trust neither, and a pitch that changes every time you refresh reads as
   * generated rather than as reasoned.
   */
  cached?: { summary: string; claims: FitClaim[] } | null;
  unavailable: string | null;
}) {
  const [state, formAction] = useFormState<FitSummaryState, FormData>(
    (_prev, formData) => generateFitSummary(handle, String(formData.get('category') ?? '') || null),
    cached
      ? { status: 'success', summary: cached.summary, claims: cached.claims, source: 'model' }
      : INITIAL_FIT_STATE,
  );

  // Written on arrival rather than on a click. The argument is the point of the
  // panel, and a button asking a buyer to request one is asking them to opt
  // into being pitched — which most will not do, and the ones who do are the
  // ones already interested.
  //
  // Fires once, and only where there is something to write: no cached read, an
  // entitled viewer, and a report that can support one. The ref guards
  // StrictMode's double-mount in development, where a second call would
  // duplicate an LLM request for no reason.
  const autoFired = useRef(false);
  useEffect(() => {
    if (autoFired.current || cached || unavailable || !entitled) return;
    if (state.status !== 'idle') return;
    autoFired.current = true;
    formAction(new FormData());
  }, [cached, unavailable, entitled, state.status, formAction]);

  if (!entitled) return null;

  return (
    <Panel title="Fit read" meta={state.source === 'local' ? 'local stand-in' : 'generated'}>
      <form action={formAction} className="px-5 py-4">
        {state.status === 'success' && state.summary ? (
          <>
            {/* Said before the paragraph, not after it. A reader who takes
                this for the real read has been misled by placement alone. */}
            {state.source === 'local' ? (
              <p className="mb-3 text-[11px] leading-relaxed text-amber">
                Offline stand-in — written for this creator alone, not against your brief, and not
                saved. Set ANTHROPIC_API_KEY for the real read.
              </p>
            ) : null}
            <p className="text-[13px] leading-relaxed text-ink">{state.summary}</p>
            <ClaimList claims={state.claims ?? []} />
            {/* Surfaced rather than swallowed. A model that asserted something
                the report does not support is a fact about this read, and a
                reader deciding how much to trust the paragraph should have it. */}
            {state.droppedClaims ? (
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber">
                <TriangleAlert className="mt-px h-3 w-3 shrink-0" aria-hidden />
                {state.droppedClaims}{' '}
                {state.droppedClaims === 1 ? 'claim was' : 'claims were'} dropped for not matching
                the figures in this report.
              </p>
            ) : null}
          </>
        ) : unavailable || state.status === 'refused' ? (
          // Not an error and not an empty state: a decision. Saying so is the
          // same discipline as the sufficiency notice — what the sample cannot
          // support, stated plainly.
          <p className="text-[12px] leading-relaxed text-ink-muted">
            {state.status === 'refused' ? state.message : unavailable}
          </p>
        ) : (
          <p className="text-[12px] leading-relaxed text-ink-muted">
            Reading this creator against what your organisation sells…
          </p>
        )}

        {state.status === 'error' && state.message ? (
          <p className="mt-3 text-[12px] text-rose">{state.message}</p>
        ) : null}

        {/* What the campaign is FOR — the buyer's half of the fit question,
            and the only input here that is not already in the report. Without
            it the paragraph can only describe the creator, which is what the
            tiles above already do. */}
        {!unavailable ? (
          <label className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
            <span>Reading for a</span>
            <select
              name="category"
              defaultValue=""
              className="h-8 rounded-md border border-line bg-surface px-2 text-[12px] text-ink outline-none focus:border-indigo focus:ring-2 focus:ring-indigo/20"
            >
              <option value="">— pick a category —</option>
              {CAMPAIGN_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABEL[key]}
                </option>
              ))}
            </select>
            <span>campaign</span>
          </label>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[11px] leading-relaxed text-ink-faint">
            {unavailable
              ? 'The figures above, and the gaps beside them, are what this report can support.'
              : state.source === 'local'
                ? 'Every claim below is still checked against this report — the stand-in gets no exemption.'
                : 'Model-written from the figures above. Every claim is checked against this report before it is shown.'}
          </p>
          {unavailable ? null : <GenerateButton hasSummary={state.status === 'success'} />}
        </div>
      </form>
    </Panel>
  );
}
