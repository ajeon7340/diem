/**
 * What the report is not allowed to claim, asserted against the source.
 *
 * These are structural rather than behavioural because the failure mode is a
 * wording edit, not a logic bug. Both rules below have a live counter-example
 * in this repo's history: a duration bucket that called itself "Shorts", and
 * an absent measurement rendered as a zero. Neither breaks a type, a test or a
 * build — they just quietly say something untrue to a buyer.
 *
 *   npm run verify:claims
 */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}
const read = (p: string) => readFileSync(p, 'utf8');

// ---------------------------------------------------------------------------
// Shorts cannot be identified from public metadata, so nothing may claim to
//
// The public API exposes a duration and no format flag. A ≤3-minute split is a
// usable proxy and is labelled one; a ≤60s bucket called "Shorts" is a
// different threshold under the same word, and the two together would have one
// surface contradicting the other while both looked authoritative.
// ---------------------------------------------------------------------------
{
  const report = read('src/components/channel/ChannelReport.tsx');
  check('the format split is labelled a proxy', /\(proxy\)/.test(report), true);
  check(
    'and says outright that duration cannot identify a Short',
    /cannot be identified reliably from duration alone/.test(report),
    true,
  );
  check(
    'and admits the bucket can contain non-Shorts',
    /can include non-Shorts/.test(report),
    true,
  );

  // The analysis layer must not reintroduce the word on a different threshold.
  const analyze = read('src/lib/ingest/analyze.ts');
  const bucketNames = analyze.slice(analyze.indexOf('function bestFormat'));
  check(
    'no duration bucket is named Shorts',
    /['"]Shorts['"]\s*:/.test(bucketNames),
    false,
  );
  check(
    'the buckets are named by duration instead',
    /'Under 1 minute'/.test(bucketNames),
    true,
  );
}

// ---------------------------------------------------------------------------
// Missing data is never a negative finding
//
// Comments disabled, comments unreadable, a pass that has not run and a pass
// that ran and found nothing are four different states. Rendering any of them
// as a low score, a zero, or a neutral sentiment is the failure this whole
// report is built to avoid.
// ---------------------------------------------------------------------------
{
  const report = read('src/components/channel/ChannelReport.tsx');
  check(
    'unreadable comments are stated not to reflect on the audience',
    /says nothing negative about the audience/.test(report),
    true,
  );
  check(
    'an empty theme set is not a negative signal',
    /do not indicate negative response/.test(report),
    true,
  );
  check(
    'an incomplete pass draws no conclusion',
    /No audience conclusion is available/.test(report),
    true,
  );
  check(
    'a null figure renders as Unavailable, never 0',
    /value===null\?'Unavailable'/.test(report),
    true,
  );

  // The comparison table is the other place a dash can be misread as a zero.
  // Whitespace-normalised: JSX wraps its prose wherever the line runs long, so
  // "not representative of all viewers" can arrive with a newline through the
  // middle of it. A copy assertion has to read the copy as copy — this is the
  // same trap the comment below warns about, arriving through the formatter
  // rather than through a rewrite.
  const table = read('src/components/campaign/ComparisonTable.tsx').replace(/\s+/g, ' ');
  check(
    'the comparison table calls a dash an absent measurement',
    /absent measurement, not a zero|not because they are low/.test(
      read('src/lib/report/candidate-compare.ts'),
    ),
    true,
  );
  // Matched loosely on purpose. The first version of this pinned one exact
  // sentence and failed the moment that sentence was rewritten to something
  // equally correct — a test that enforces phrasing rather than meaning gets
  // deleted the second time it cries wolf.
  check(
    'commenters are never presented as the audience',
    /self-selected slice|not representative of all viewers/.test(table),
    true,
  );
  check(
    'and purchase language is never presented as conversion',
    /does not establish conversion|not a conversion|never a conversion/.test(table),
    true,
  );
  check('the derived disclosure is rendered here', table.includes('{DERIVED_DISCLOSURE}'), true);
  // This UI shows only user-entered fees, not a derived CPM or financial projection.
  check('comparison does not create financial estimates', /cpmFromFee|row\.cpm/.test(table), false);
  check(
    'missing analysis is stated not to be a poor fit',
    /missing analysis is not a poor fit|not run — not a poor fit|not a poor fit/.test(table),
    true,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
