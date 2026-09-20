/**
 * Assertions for the two retention horizons.
 *
 * 0016 gave the whole report one clock and moved it to 36 months when the
 * derived-metrics amendment was accepted. Verbatim comment text went with it,
 * which III.E.4.d does not permit — no amendment reclassifies somebody else's
 * writing as our statistic. These pin the split that fixed it.
 *
 *   npm run verify:retention
 */

// RUN WITH `ADFIT_YOUTUBE_DERIVED_APPROVAL=approved` (see package.json).
//
// `AMENDMENT_ACCEPTED` became env-gated: the 36-month horizon is only ours to
// use once Google has actually granted the derived-metrics amendment, and a
// constant hardcoded to `true` claimed a permission nobody had checked. The
// consequence for this suite is that the amended horizon has to be switched on
// deliberately — which is the right shape, because the two clocks diverging is
// exactly what it exists to pin, and with the flag off they collapse into one
// and four assertions quietly measure nothing.
if (process.env.ADFIT_YOUTUBE_DERIVED_APPROVAL !== 'approved') {
  console.error(
    '  This suite asserts the AMENDED retention horizon and must run with\n' +
      '  ADFIT_YOUTUBE_DERIVED_APPROVAL=approved. Run it through npm.',
  );
  process.exit(1);
}
import {
  RETENTION_DAYS,
  VERBATIM_RETENTION_DAYS,
  expireVerbatim,
  isPastRetention,
  refreshDueAt,
  retentionDays,
  verbatimDueAt,
} from '@/lib/report/policy';

let pass = 0,
  fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`);
  }
}

const FETCHED = '2026-09-12T00:00:00.000Z';
const day = (n: number) => new Date(Date.parse(FETCHED) + n * 86_400_000).getTime();

// ---------------------------------------------------------------------------
// The horizons are different, and only one of them moves
// ---------------------------------------------------------------------------

check('verbatim is the base 30 days', VERBATIM_RETENTION_DAYS, 30);
check('derived is the amended horizon', retentionDays(), RETENTION_DAYS.amended);
check('the two are not the same clock', VERBATIM_RETENTION_DAYS === retentionDays(), false);
check('verbatim due 30 days after the fetch', verbatimDueAt(FETCHED), '2026-10-12T00:00:00.000Z');
check('null fetch date yields no verbatim deadline', verbatimDueAt(null), null);
check('an unparseable date yields no deadline', verbatimDueAt('not-a-date'), null);
check(
  'the derived deadline is far later',
  Date.parse(refreshDueAt(FETCHED)!) > Date.parse(verbatimDueAt(FETCHED)!),
  true,
);

// ---------------------------------------------------------------------------
// expireVerbatim
// ---------------------------------------------------------------------------

const report = () => ({
  topCommentClusters: [
    {
      id: 'c1',
      label: 'Appreciation',
      share: 0.3,
      commentCount: 6328,
      exampleComment: 'legacy quote',
      comments: [
        {
          id: 'x1',
          text: 'you look beautiful',
          postTitle: 'a video',
          likes: 1200,
          publishedAt: '2026-05-05',
          url: 'https://www.youtube.com/watch?v=abc&lc=x1',
        },
      ],
    },
  ],
  publicOpinion: {
    mentionsAnalyzed: 7906,
    themes: [
      {
        label: 'Criticism',
        share: 0.52,
        example: 'legacy excerpt',
        mentions: [
          {
            id: 'm1',
            excerpt: 'being korean is her personality',
            publishedAt: '2026-05-10',
            engagement: 16408,
            url: 'https://www.youtube.com/watch?v=def&lc=m1',
          },
        ],
      },
    ],
  },
});

const fresh = expireVerbatim(report(), FETCHED, day(29));
check('inside 30 days the quote is untouched', fresh.topCommentClusters[0].comments[0].text, 'you look beautiful');
check('inside 30 days the excerpt is untouched', fresh.publicOpinion.themes[0].mentions[0].excerpt, 'being korean is her personality');

const aged = expireVerbatim(report(), FETCHED, day(31));
const comment = aged.topCommentClusters[0].comments[0];
const mention = aged.publicOpinion.themes[0].mentions[0];

check('past 30 days the comment text is gone', comment.text, null);
check('the post title goes with it', comment.postTitle, null);
check('so do the per-comment metrics', [comment.likes, comment.publishedAt], [null, null]);
check('the legacy single quote goes too', aged.topCommentClusters[0].exampleComment, '');
check('the opinion excerpt is gone', mention.excerpt, null);
check('the legacy opinion example is gone', aged.publicOpinion.themes[0].example, '');

// The whole point of the split: the finding outlives the quote.
check('the cluster survives', aged.topCommentClusters.length, 1);
check('its count survives', aged.topCommentClusters[0].commentCount, 6328);
check('its share survives', aged.topCommentClusters[0].share, 0.3);
check('its label survives', aged.topCommentClusters[0].label, 'Appreciation');
check('the mention total survives', aged.publicOpinion.mentionsAnalyzed, 7906);

// An ID is a pointer, not stored content — and the link is what lets the report
// keep proving its claim after it can no longer reprint the words.
check('the comment id survives', comment.id, 'x1');
check('the permalink survives', comment.url, 'https://www.youtube.com/watch?v=abc&lc=x1');
check('the thread link survives', mention.url, 'https://www.youtube.com/watch?v=def&lc=m1');

// ---------------------------------------------------------------------------
// The window this exists for: past verbatim, inside derived
// ---------------------------------------------------------------------------

check(
  'at day 31 the row is past the verbatim horizon',
  isPastRetention(verbatimDueAt(FETCHED), day(31)),
  true,
);
check(
  'and still inside the derived one',
  isPastRetention(refreshDueAt(FETCHED), day(31)),
  false,
);
check(
  'a null fetch date expires nothing',
  expireVerbatim(report(), null, day(9999)).topCommentClusters[0].comments[0].text,
  'you look beautiful',
);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
