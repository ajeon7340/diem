/**
 * Build and store a creator's report from their declared YouTube channel.
 *
 *   npm run analyze -- --handle urltest1 [--max-videos N] [--max-comments N]
 *   npm run analyze -- --all
 *
 * The deep pass. `/onboarding/creator` runs the same code inline at signup but
 * bounded to 25 uploads and 600 comments, because someone is waiting; this one
 * has no such limit and is where a real census comes from.
 *
 * It writes through `analyzeAndStore`, the same function onboarding calls, so
 * a signup and a backfill cannot produce different reports for one channel.
 * That divergence is not hypothetical: it is how the stored brand-safety score
 * ended up disagreeing with the derived one everywhere in this repo.
 *
 * Reads only public data, so it runs on an API key with no OAuth. What it
 * cannot reach — demographics, and the model pass behind sentiment, purchase
 * intent and the comment axes — stays null, and the report says which pass is
 * missing rather than printing a zero.
 */
import { createClient } from '@supabase/supabase-js';

import { analyzeAndStore } from '@/lib/ingest/store';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const handleArg = (flag('handle') ?? '').replace(/^@/, '');
const ALL = args.includes('--all');
const maxVideos = flag('max-videos') ? Number(flag('max-videos')) : undefined;
const maxComments = flag('max-comments') ? Number(flag('max-comments')) : undefined;

interface CreatorRow {
  id: string;
  handle: string;
  youtube_handle: string | null;
  youtube_channel_id: string | null;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`  Missing ${name}.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  if (!handleArg && !ALL) {
    console.error('  usage: npm run analyze -- --handle <handle> | --all');
    process.exit(1);
  }
  requireEnv('YOUTUBE_API_KEY');
  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let query = supabase.from('creators').select('id, handle, youtube_handle, youtube_channel_id');
  if (!ALL) query = query.eq('handle', handleArg);
  const { data, error } = await query.returns<CreatorRow[]>();
  if (error) throw new Error(error.message);
  if (!data?.length) {
    console.error(`  no creator ${handleArg || '(any)'}`);
    process.exit(1);
  }

  for (const creator of data) {
    const target = creator.youtube_channel_id ?? creator.youtube_handle;
    if (!target) {
      // Not a failure. The fixture creators are inventions with no channel,
      // and a backfill must walk past them rather than report an error.
      console.log(`  @${creator.handle.padEnd(14)} no declared channel — skipped`);
      continue;
    }
    const started = Date.now();
    const result = await analyzeAndStore(creator.id, target, { maxVideos, maxComments });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (result.ok) {
      console.log(
        `  @${creator.handle.padEnd(14)} ${String(result.comments).padStart(6)} comments · ` +
          `${result.units}u · ${seconds}s`,
      );
    } else {
      // One channel failing must not abandon the rest of an --all run.
      console.error(`  @${creator.handle.padEnd(14)} FAILED ${result.reason}`);
    }
  }
}

main().catch((e) => {
  console.error(`\n  ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
