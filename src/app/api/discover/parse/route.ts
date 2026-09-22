import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getViewer } from '@/lib/access/viewer';
import { parseMessage } from '@/lib/discovery/parse-message';
import { EMPTY_FILTERS, readFilters } from '@/lib/discovery/filter-state';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * One sentence in, a filter patch out.
 *
 * THIS ROUTE CANNOT RETURN CREATORS AND CANNOT START A RUN. It returns a
 * `Partial<FilterState>` and a line of explanation. Everything downstream —
 * whether to apply instantly, whether to ask before spending a search — is
 * decided by the client from the keys in that patch, not by anything said
 * here. A route that could search would let a misread sentence spend a day's
 * budget.
 *
 * SIGNED IN ONLY. It reaches a model on some deployments, and an unauthenticated
 * endpoint that reaches a model is an unmetered bill.
 *
 * THE MESSAGE IS DATA. It is a request from a customer, never an instruction to
 * this service or to the model; the system prompt says so and the output is
 * re-validated against a schema that knows every permitted key regardless.
 */
const body = z.object({
  message: z.string().min(1).max(500),
  /** The current state, as a query string — the same shape the URL holds. */
  filters: z.string().max(2_000).optional(),
});

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer.organization) {
    return NextResponse.json({ error: 'Sign in to use this.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const parsed = body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Say that in a sentence or two.' }, { status: 400 });
  }

  const current = parsed.data.filters
    ? readFilters(new URLSearchParams(parsed.data.filters))
    : EMPTY_FILTERS;

  try {
    const result = await parseMessage(parsed.data.message, current);
    return NextResponse.json(result);
  } catch (error) {
    // A parser failure is not a customer error and must not read like one:
    // the filters they set by hand are untouched and still work.
    console.error('[discover/parse] failed', error);
    return NextResponse.json(
      { error: 'Could not read that. The filters on the left still work.' },
      { status: 502 },
    );
  }
}
