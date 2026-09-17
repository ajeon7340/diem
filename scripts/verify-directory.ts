/**
 * The directory row must say the same thing the profile page says.
 *
 * This suite exists because of a bug it would have caught on day one:
 * `fixtureDirectory()` returned a literal `raisedFlags: 1, checkedFlags: 3` for
 * every creator, so the directory told a buyer "1 of 3 checks raised" for a
 * creator whose own report derived 3 of 4 — and told them three checks had run
 * on a creator with nothing measured at all. Brand safety is derived at read
 * time precisely so a headline cannot drift from its evidence; a second surface
 * typing its own answer reintroduces the drift one page across.
 *
 * Every other suite transcribes fixture numbers rather than importing them
 * (src/lib/data pulls in `server-only`). A transcription cannot see a fixture
 * contradicting itself, which is why this one imports the real builders — see
 * scripts/stubs/server-only.ts and tsconfig.scripts.json.
 */
import { readFileSync } from 'node:fs';

import { fixtureDirectory, fixtureReport, fixtureCreatorById } from '@/lib/data/fixtures';
import type { DirectoryListing } from '@/types';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const listings: DirectoryListing[] = fixtureDirectory();
check('directory is not empty', listings.length > 0, `got ${listings.length}`);

for (const listing of listings) {
  const report = fixtureReport(listing.id);
  const who = `@${listing.handle}`;
  check(`${who}: has a report`, report !== null);
  if (!report) continue;

  // --- brand safety: the same counts, not a second opinion --------------
  check(
    `${who}: raisedFlags matches the report`,
    listing.raisedFlags === report.raisedFlags,
    `listing ${listing.raisedFlags} vs report ${report.raisedFlags}`,
  );
  check(
    `${who}: checkedFlags matches the report`,
    listing.checkedFlags === report.checkedFlags,
    `listing ${listing.checkedFlags} vs report ${report.checkedFlags}`,
  );
  // Nothing checked is not "zero raised" — one number could not tell those
  // apart, which is the whole reason the score was removed.
  check(
    `${who}: raised is null exactly when checked is null`,
    (listing.raisedFlags === null) === (listing.checkedFlags === null),
  );
  if (listing.raisedFlags !== null && listing.checkedFlags !== null) {
    check(
      `${who}: cannot raise more checks than it ran`,
      listing.raisedFlags <= listing.checkedFlags,
      `${listing.raisedFlags} > ${listing.checkedFlags}`,
    );
  }

  // --- purchase intent: the rate and its denominator travel together ----
  check(
    `${who}: purchaseIntentRate matches the report`,
    listing.purchaseIntentRate === report.purchaseIntentRate,
    `listing ${listing.purchaseIntentRate} vs report ${report.purchaseIntentRate}`,
  );
  check(
    `${who}: intentBasis matches the report`,
    listing.intentBasis === (report.purchaseIntentRate === null ? null : (report.intent?.basis ?? null)),
    `listing ${listing.intentBasis} vs report ${report.intent?.basis}`,
  );
  // A percentage with no stated denominator in a sortable column is the defect
  // this field was added to remove.
  check(
    `${who}: a rendered rate always names its basis`,
    listing.purchaseIntentRate === null || listing.intentBasis !== null,
  );
  check(
    `${who}: no basis claimed when there is no rate`,
    listing.purchaseIntentRate !== null || listing.intentBasis === null,
  );

  // --- identity ---------------------------------------------------------
  const creator = fixtureCreatorById(listing.id);
  check(`${who}: resolves to a creator`, creator !== null);
  check(`${who}: is opted in to the directory`, creator?.isDirectoryVisible === true);
}

// The directory is where a buyer picks who to contact, so a mixed column has to
// be visible as mixed rather than silently ranked. This asserts the demo
// actually exercises that branch — if every fixture ever lands on one basis the
// footnote stops being reachable and should be reconsidered, not left dead.
const bases = new Set(
  listings.filter((l) => l.purchaseIntentRate !== null).map((l) => l.intentBasis ?? 'unrecorded'),
);
check(
  'the demo directory exercises the mixed-basis path',
  bases.size > 1,
  `only saw ${[...bases].join(', ')}`,
);

// ---------------------------------------------------------------------------
// A promotion must point at a real post
//
// @jooshica carried a promotion for video `joosh_2025` — brand "Rom&nd",
// product "Juicy Lasting Tint", 76% retention. `videos.list` returns zero
// results for that id, because it is not a YouTube id: real ones are exactly
// 11 characters. Nothing was measured; the whole row was typed.
//
// It did not stay in the fixture. `sponsoredPerformance.viewRetention` agreed
// with it, `platformBreakdown.sponsoredRetention` agreed with it, and the fit
// stand-in cited "76% of organic views" as a VERIFIED claim on the one surface
// that promises every figure is checkable. The real placement holds 31.9%.
//
// A shape check, not a network call: this suite must stay offline. It catches
// the thing that actually happened — an id invented to fill a row.
// ---------------------------------------------------------------------------
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
// The fixtures built from live channels. An invented row here is not a
// placeholder, it is a claim about a real person's commercial history — which
// is the difference that made the jooshica row a defect and leaves the purely
// synthetic demo creators alone. Their ids are `yt_marah_warp` and are
// obviously placeholders; nobody can mistake one for a video.
const FROM_REAL_CHANNELS = new Set(['jooshica', 'gajaeman']);

for (const listing of listings) {
  const report = fixtureReport(listing.id);
  if (!report) continue;
  for (const promo of report.promotions) {
    if (promo.platform !== 'youtube') continue;
    if (FROM_REAL_CHANNELS.has(listing.handle)) {
      check(
        `@${listing.handle}: promotion ${promo.postId} is a real YouTube id`,
        YT_ID.test(promo.postId),
      );
      check(
        `@${listing.handle}: its url points at that id`,
        promo.url === `https://www.youtube.com/watch?v=${promo.postId}`,
      );
    }
    // Universal: a row may be a placeholder, but it may not point somewhere
    // else. A url and a postId that disagree is how a reader clicks through to
    // the wrong video, or to nothing, with no way to tell which.
    check(
      `@${listing.handle}: ${promo.postId} url is consistent with its id`,
      promo.url === null || promo.url.includes(promo.postId.replace(/^yt_/, '')),
    );
  }

  // The other half of what went wrong: one creator carried TWO organic medians
  // on one platform — 268,826 beside this report's own 644,988 — and the
  // smaller one existed only to make the fabricated retention come out at 76%.
  //
  // NOT an equality check, because they are legitimately different figures:
  // `organicMedianViews` excludes the sponsored posts and `outputStats` does
  // not. Dropping a handful of posts from a 20-to-50 upload window moves a
  // median by single-digit percent; it cannot halve it. 25% is the band where
  // a real difference still passes and an invented denominator does not — the
  // jooshica row was 58% off.
  const yt = report.outputStats.find((o) => o.platform === 'youtube');
  const perf = report.sponsoredPerformance;
  if (yt && perf && yt.medianViews > 0) {
    const drift = Math.abs(perf.organicMedianViews - yt.medianViews) / yt.medianViews;
    check(
      `@${listing.handle}: organic median is within reach of the corpus median`,
      drift <= 0.25,
    );
    // Self-consistency, and the cheapest guard there is: a retention that is
    // not its own two numbers divided was typed, not measured.
    check(
      `@${listing.handle}: retention is its own two numbers divided`,
      Math.abs(perf.viewRetention - perf.sponsoredMedianViews / perf.organicMedianViews) < 0.005,
    );
  }
}

// ---------------------------------------------------------------------------
// A required number is how absence becomes a finding
//
// `SponsoredPerformance.organicSentiment` / `sponsoredSentiment` were required
// numbers. A creator with no sentiment pass carried 0 and 0, and the panel
// rendered "0.0 -> 0.0 +0%" IN EMERALD: the delta helper read a zero baseline
// as no change, and no change is coloured as a good outcome. An unmeasured
// field came out as a confident flat healthy result, on a 0-100 scale where 0
// is the worst score available.
//
// Two guards, because the type fix alone is undone by one `?? 0`.
// ---------------------------------------------------------------------------
for (const listing of listings) {
  const report = fixtureReport(listing.id);
  const perf = report?.sponsoredPerformance;
  if (!perf) continue;
  // 0/100 is a claim nobody has ever measured on a real channel, and it is
  // exactly what an unset field looks like.
  check(`@${listing.handle}: organic sentiment is not a stand-in zero`, perf.organicSentiment !== 0);
  check(`@${listing.handle}: sponsored sentiment is not a stand-in zero`, perf.sponsoredSentiment !== 0);
}

const panel = readFileSync(new URL('../src/components/profile/CommercialPanel.tsx', import.meta.url), 'utf8');
check('the delta helper takes null, not a required number', /from: number \| null/.test(panel));
check('and says so in words rather than printing a dash', /unmeasured/.test(panel));
// The percentage chip is the part that lied. A zero baseline has no percentage
// change - the division is undefined - so it must be withheld, never 0%.
check(
  'a zero baseline withholds the change chip',
  /const change = a === 0 \? null/.test(panel),
);
const print = readFileSync(new URL('../src/app/[handle]/print/page.tsx', import.meta.url), 'utf8');
check(
  'the printed sheet says it too - it cannot be clicked into',
  /not measured/.test(print),
);

// ---------------------------------------------------------------------------
// Every column the mapper reads must be in the SELECT
//
// This already shipped once: `REPORT_COLUMNS` named 12 of 24 columns, so Pro
// agencies were served a silently gutted report while token holders got the
// full one, and a `.catch(null)` in the schema layer swallowed the difference.
// A missing column is `undefined`, `undefined` parses to the schema default,
// and the default is usually "absent" — which this report renders as an honest
// gap. The failure mode is a page that looks correct and is not.
//
// Source-level, and it stays source-level on purpose: the database path has no
// coverage at all yet, and this is the one check that does not need a project
// to run against.
// ---------------------------------------------------------------------------
const mapperSrc = readFileSync(new URL('../src/lib/mappers.ts', import.meta.url), 'utf8');
const gatekeeperSrc = readFileSync(
  new URL('../src/lib/access/gatekeeper.ts', import.meta.url),
  'utf8',
);

const rowMapper = /export function toAIReportFromRow\(row: ReportMetricsRow\): AIReport \{([\s\S]*?)\n\}/.exec(
  mapperSrc,
);
check('the row mapper is where it is expected to be', rowMapper !== null);

const projection = /const REPORT_COLUMNS_BASE =\s*([\s\S]*?);/.exec(gatekeeperSrc);
check('the projection is where it is expected to be', projection !== null);

if (rowMapper && projection) {
  const read = new Set(
    [...rowMapper[1].matchAll(/\brow\.([a-z_0-9]+)/g)].map((m) => m[1]),
  );
  const selected = new Set(projection[1].match(/[a-z_0-9]+/g) ?? []);
  // `demographics` is appended only for a viewer entitled to it — III.E.3.b,
  // and it is left OUT of the projection rather than nulled after the read, so
  // there is nothing in the process to leak. It is the one legitimate absence.
  const missing = [...read].filter((c) => c !== 'demographics' && !selected.has(c));
  check(
    `every mapped column is selected (${read.size} read, ${selected.size} selected)`,
    missing.length === 0,
    missing.join(', '),
  );
  check(
    'demographics is still gated rather than selected by default',
    !selected.has('demographics'),
  );
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
