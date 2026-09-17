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
for (const listing of listings) {
  const report = fixtureReport(listing.id);
  if (!report) continue;
  for (const promo of report.promotions) {
    if (promo.platform !== 'youtube') continue;
    check(
      `@${listing.handle}: promotion ${promo.postId} is a real YouTube id`,
      YT_ID.test(promo.postId),
      true,
    );
    check(
      `@${listing.handle}: its url points at that id`,
      promo.url === `https://www.youtube.com/watch?v=${promo.postId}`,
      true,
    );
  }

  // The other half of what went wrong: one creator carried TWO organic medians
  // on one platform, and the smaller one existed only to make the fabricated
  // retention come out right.
  const yt = report.outputStats.find((o) => o.platform === 'youtube');
  const perf = report.sponsoredPerformance;
  if (yt && perf) {
    check(
      `@${listing.handle}: one organic median, not two`,
      perf.organicMedianViews === yt.medianViews,
      true,
    );
    check(
      `@${listing.handle}: retention is its own two numbers divided`,
      Math.abs(perf.viewRetention - perf.sponsoredMedianViews / perf.organicMedianViews) < 0.005,
      true,
    );
  }
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
