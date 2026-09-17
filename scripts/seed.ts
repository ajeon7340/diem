/**
 * Seed a real Supabase project from the fixtures.
 *
 * Until now every one of the ~42 `isSupabaseConfigured()` branches in this app
 * has been dead code: the fixture path is what all 616 assertions cover and the
 * database path has never run end to end. An empty project does not fix that —
 * a directory with no rows exercises the query and proves nothing about the
 * mapping, the RLS, or the column grants. So the fixtures go in, through the
 * real client, and the same pages render from Postgres instead of from memory.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.scripts.json \
 *     scripts/seed.ts [--reset]
 *
 * IDEMPOTENT. Creators are matched on `handle` and reports on `creator_id`, so
 * running it twice updates rather than duplicating. `--reset` deletes the demo
 * rows first, which is the only way to test a first-run path more than once.
 *
 * SERVICE ROLE, DELIBERATELY. Seeding writes columns the clients are not
 * granted — `is_verified`, `billing_plan` — and that asymmetry is the point:
 * if a seed could be written with the anon key, the column grants would not be
 * doing their job. The key never reaches a browser; this is a terminal script.
 *
 * WHAT IT DOES NOT SEED: `social_accounts` tokens. YouTube OAuth is explicitly
 * out of scope, and a fabricated access token would make the moderation hide
 * button look wired up and fail at the API instead of at the check. The button
 * already says what is missing; leaving the row absent is what keeps that true.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { CREATORS, REPORTS } from '@/lib/data/fixtures';
import type { AIReport, Creator } from '@/types';

const RESET = process.argv.includes('--reset');

/**
 * Demo accounts get addresses under a domain that cannot receive mail.
 *
 * `.invalid` is reserved by RFC 2606 for exactly this, so a seeded account can
 * never be confused for a real signup and no magic link can ever be delivered
 * to one. The creator rows they own are demo data; the humans behind the two
 * real channels never signed up for anything.
 */
const demoEmail = (handle: string) => `${handle}@demo.adfit.invalid`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`  Missing ${name}.`);
    console.error('  Run with: npx tsx --env-file=.env.local --tsconfig tsconfig.scripts.json scripts/seed.ts');
    process.exit(1);
  }
  return value;
}

/**
 * The schema's encoding of absence for the not-null jsonb columns.
 *
 * `report_metrics` declares twelve jsonb columns `not null default '{}'` or
 * `'[]'`, and `emptyToNull` in lib/mappers.ts turns an empty container back
 * into null on the way out — so the DB spells "no sponsored history" as `{}`
 * and the app reads it as null. Writing a literal null instead is not a
 * smaller version of the same thing; it violates the constraint and the row
 * never lands:
 *
 *     null value in column "cost_efficiency" of relation "report_metrics"
 *     violates not-null constraint
 *
 * which is how @quietcircuit — the creator with no sponsorships, no cohort and
 * no CPM, the one whose whole purpose in the fixtures is to be missing things
 * — failed to seed while the four creators with full reports went in fine.
 */
function obj(value: unknown): unknown {
  return value ?? {};
}
function arr(value: unknown): unknown {
  return value ?? [];
}

/** The report row, built from the same object the fixture path renders. */
function reportRow(creatorId: string, report: AIReport) {
  return {
    creator_id: creatorId,
    teaser_highlights: [],
    demographics: obj(report.demographics),
    top_comment_clusters: arr(report.topCommentClusters),
    comment_axes: report.commentAxes,
    comment_coverage: obj(report.coverage),
    sentiment_score: report.sentimentScore,
    purchase_intent_rate: report.purchaseIntentRate,
    // The stored column is history. `deriveBrandSafety` recomputes from the
    // flags at read time and ignores whatever is written here — see
    // lib/report/safety.ts. Seeding null rather than a number keeps it from
    // ever looking like the source of the figure on screen.
    brand_safety_score: null,
    engagement_rate: report.engagementRate,
    ad_fatigue_level: report.adFatigueLevel,
    ai_summary: report.aiSummary,
    benchmarks: obj(report.benchmarks),
    cost_efficiency: obj(report.costEfficiency),
    sponsored_performance: obj(report.sponsoredPerformance),
    brand_safety_flags: arr(report.brandSafetyFlags),
    category_exposure: [],
    recommended_actions: arr(report.recommendedActions),
    platform_breakdown: arr(report.platformBreakdown),
    public_opinion: obj(report.publicOpinion),
    output_stats: arr(report.outputStats),
    promotions: arr(report.promotions),
    comment_risks: arr(report.commentRisks),
    moderation: report.moderation,
    comment_register: report.commentRegister,
    purchase_intent_ci_low: report.intent?.ciLow ?? null,
    purchase_intent_ci_high: report.intent?.ciHigh ?? null,
    purchase_intent_basis: report.intent?.basis ?? null,
    commercial_density: report.intent?.commercialDensity ?? null,
    intent_comments_scored: report.intent?.commentsScored ?? null,
    intent_posts_scored: report.intent?.postsScored ?? null,
    product_posts_analyzed: report.intent?.productPostsAnalyzed ?? null,
    intent_dispersion: report.intent?.dispersion ?? null,
    intent_rubric_version: report.intent?.rubricVersion ?? null,
    // `intent_samples` is worker input, not report content, and is deliberately
    // absent from REPORT_COLUMNS. Seeding it would put a few hundred posts per
    // creator in the row for nothing to read.
    intent_samples: null,
    model_version: report.modelVersion,
    comments_analyzed: report.commentsAnalyzed,
    last_analyzed_at: report.lastAnalyzedAt,
    // Retention starts now, not at the fixture's date: the 30-day verbatim
    // horizon and the 1080-day derived horizon are measured from when the data
    // was FETCHED, and these rows are being written today.
    data_fetched_at: new Date().toISOString(),
  };
}

function creatorRow(creator: Creator, userId: string) {
  return {
    user_id: userId,
    handle: creator.handle,
    display_name: creator.displayName,
    avatar_url: creator.avatarUrl,
    niche: creator.niche,
    bio: creator.bio,
    // Only the service role may write this. A creator cannot self-verify — see
    // the column grants in 0001 — and seeding it here is the asymmetry working.
    is_verified: creator.isVerified,
    is_directory_visible: creator.isDirectoryVisible,
    minimum_budget: creator.minimumBudget,
    budget_min: creator.budgetMin,
    budget_max: creator.budgetMax,
    budget_negotiable: creator.budgetNegotiable,
  };
}

/** Find or make the auth user a creator row hangs off. */
async function ensureUser(supabase: SupabaseClient, email: string): Promise<string> {
  // listUsers is paginated; the demo set is small enough that one page covers
  // it, and asking for an exact email is not something the admin API offers.
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) throw new Error(`listUsers: ${listError.message}`);
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function main() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const handles = CREATORS.map((c: Creator) => c.handle);

  if (RESET) {
    // report_metrics cascades from creators, so deleting the creators is
    // enough — but say what is being removed rather than trusting the cascade
    // silently, because a missed foreign key here looks like a seed that
    // "didn't take".
    const { error } = await supabase.from('creators').delete().in('handle', handles);
    if (error) throw new Error(`reset: ${error.message}`);
    console.log(`  reset: removed ${handles.length} demo creators and their reports`);
  }

  let created = 0;
  let updated = 0;

  for (const creator of CREATORS) {
    const report = REPORTS[creator.id];
    const userId = await ensureUser(supabase, demoEmail(creator.handle));

    const { data: existing } = await supabase
      .from('creators')
      .select('id')
      .eq('handle', creator.handle)
      .maybeSingle<{ id: string }>();

    let creatorId: string;
    if (existing) {
      const { error } = await supabase
        .from('creators')
        .update(creatorRow(creator, userId))
        .eq('id', existing.id);
      if (error) throw new Error(`update @${creator.handle}: ${error.message}`);
      creatorId = existing.id;
      updated += 1;
    } else {
      const { data, error } = await supabase
        .from('creators')
        .insert(creatorRow(creator, userId))
        .select('id')
        .single<{ id: string }>();
      if (error || !data) throw new Error(`insert @${creator.handle}: ${error?.message}`);
      creatorId = data.id;
      created += 1;
    }

    if (!report) {
      console.log(`  @${creator.handle.padEnd(14)} creator only — no report in the fixtures`);
      continue;
    }

    const { error: reportError } = await supabase
      .from('report_metrics')
      .upsert(reportRow(creatorId, report), { onConflict: 'creator_id' });
    if (reportError) throw new Error(`report @${creator.handle}: ${reportError.message}`);

    const climate = report.climate.label ?? 'not read';
    console.log(
      `  @${creator.handle.padEnd(14)} ${String(report.commentsAnalyzed).padStart(6)} comments · ` +
        `climate ${climate.padEnd(8)} · ${report.promotions.length} promotions`,
    );
  }

  console.log(`\n  ${created} created, ${updated} updated.`);
  console.log('  Sign in as any of them with a magic link to their demo address —');
  console.log('  but the address cannot receive mail, so use the Supabase dashboard');
  console.log('  (Authentication → Users → … → Send magic link) to get the URL.');
}

main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
