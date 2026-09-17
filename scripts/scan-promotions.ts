/**
 * The promotions pass: which uploads were paid for, and how we know.
 *
 * `promotions` had a column, a type, a zod schema, a mapper, a retention rule
 * and a rendered panel — and NO PRODUCER. Every value in it was hand-typed into
 * the fixtures, `scripts/retention.ts` only ever blanked it, and on a real
 * creator the panel said "none found in the analysed window" forever, which is
 * a claim rather than a gap. Same shape as `social_accounts.access_token`: a
 * complete feature with nothing at the top of the pipe.
 *
 *   npm run scan:promotions -- --handle X [--max-videos N] [--apply]
 *
 * WHAT DECIDES `disclosure`, which is the whole point of this file:
 *
 *   explicit  — `paidProductPlacementDetails.hasPaidProductPlacement`. This is
 *               the creator's own YouTube disclosure toggle, returned by the
 *               Data API with an API key alone. It is the only authoritative
 *               signal here: the creator asserted it to YouTube, not to us.
 *   affiliate — a tracked or affiliate link in the description. Commercial,
 *               and NOT disclosed, which is a different and worse fact.
 *   inferred  — a text marker only (협찬, 유료광고, #ad). A reading of prose.
 *
 * Measured on @가재맨's 50 most recent uploads: the API flag found 1 paid
 * placement and the description-marker regex found ZERO. Text markers alone
 * would have reported a channel with a paid placement as having none — which
 * is exactly the error the three-tier split exists to prevent, arriving from
 * the direction nobody expected.
 *
 * WHAT THIS DOES NOT DO: name the brand or the product. Those need the
 * description read by a model, and a guess there is worse than a blank —
 * `Promotion.brand` is documented to render as "unidentified" rather than as
 * an empty cell for exactly this reason. They stay null until the classifier
 * runs, and the panel says so.
 */
import { createClient } from '@supabase/supabase-js';

import type { Promotion, PromotionDisclosure } from '@/types';

const PAGE = 50;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const handle = (args[args.indexOf('--handle') + 1] ?? '').replace(/^@/, '');
const maxVideos = args.includes('--max-videos')
  ? Number(args[args.indexOf('--max-videos') + 1])
  : Infinity;

/**
 * Text markers, Korean first because this is where they actually appear.
 *
 * A recall lens over prose and nothing more — the same status as
 * `lib/report/keywords`. A hit is `inferred` and is labelled as a guess; a miss
 * is not a clean video. The API flag is what carries a real claim.
 */
const DISCLOSURE_MARKERS =
  /유료\s*광고|유료광고|협찬|광고\s*포함|제공\s*받|파트너십|소정의|#ad\b|#sponsored\b|paid\s+partnership/i;

/**
 * Affiliate and tracked links. Commercial without being disclosed, which is
 * the state a disclosure-rate flag exists to find.
 */
const AFFILIATE_MARKERS =
  /coupa\.ng|link\.coupang|ali\.ski|s\.click\.aliexpress|amzn\.to|bit\.ly\/[A-Za-z0-9]+|rfrl\.co|linktr\.ee|\?(?:af|aff|affiliate|utm_campaign)=/i;

interface VideoRow {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  views: number | null;
  hasPaidPlacement: boolean;
}

async function fetchVideos(apiKey: string, channelHandle: string) {
  const get = async (path: string, params: Record<string, string>) => {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [k, v] of Object.entries({ ...params, key: apiKey })) url.searchParams.set(k, v);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };

  const channel = await get('channels', {
    part: 'contentDetails',
    forHandle: `@${channelHandle}`,
  });
  const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error(`no uploads playlist for @${channelHandle}`);

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await get('playlistItems', {
      part: 'contentDetails',
      playlistId: uploads,
      maxResults: String(PAGE),
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of page.items ?? []) ids.push(item.contentDetails.videoId);
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < maxVideos);

  const capped = ids.slice(0, Number.isFinite(maxVideos) ? maxVideos : ids.length);
  const rows: VideoRow[] = [];

  // `paidProductPlacementDetails` is requested in the same call as the snippet:
  // it is one part on videos.list, not a separate endpoint, so it costs nothing
  // extra and there is no reason for any caller to skip it.
  for (let i = 0; i < capped.length; i += PAGE) {
    const batch = capped.slice(i, i + PAGE);
    const res = await get('videos', {
      part: 'snippet,statistics,paidProductPlacementDetails',
      id: batch.join(','),
    });
    for (const v of res.items ?? []) {
      rows.push({
        id: v.id,
        title: v.snippet?.title ?? '',
        description: v.snippet?.description ?? '',
        publishedAt: v.snippet?.publishedAt ?? '',
        views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
        hasPaidPlacement: v.paidProductPlacementDetails?.hasPaidProductPlacement === true,
      });
    }
  }

  return { rows, checked: capped.length };
}

/**
 * The three tiers, in priority order.
 *
 * `explicit` wins over everything: a creator who flagged the video to YouTube
 * has disclosed it whatever else the description contains. `affiliate` beats
 * `inferred` because an untagged tracked link is the more serious finding —
 * money changed hands and nothing said so.
 */
function classify(video: VideoRow): PromotionDisclosure | null {
  if (video.hasPaidPlacement) return 'explicit';
  if (AFFILIATE_MARKERS.test(video.description)) return 'affiliate';
  if (DISCLOSURE_MARKERS.test(video.description)) return 'inferred';
  return null;
}

/** Median of the non-promotional uploads. The baseline a paid post is read against. */
function organicMedian(rows: VideoRow[], promoted: Set<string>): number | null {
  const views = rows
    .filter((r) => !promoted.has(r.id) && r.views !== null)
    .map((r) => r.views as number)
    .sort((a, b) => a - b);
  if (views.length === 0) return null;
  const mid = Math.floor(views.length / 2);
  return views.length % 2 === 0 ? (views[mid - 1] + views[mid]) / 2 : views[mid];
}

async function main() {
  if (!handle) {
    console.error('  usage: scan:promotions -- --handle <handle> [--max-videos N] [--apply]');
    process.exit(1);
  }
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('  YOUTUBE_API_KEY is required — videos.list needs it.');
    console.error('  Run with: npx tsx --env-file=.env.local --tsconfig tsconfig.scripts.json …');
    process.exit(1);
  }

  console.log(`  reading uploads on @${handle}…`);
  const { rows, checked } = await fetchVideos(apiKey, handle);
  console.log(`  ${checked} videos requested · ${rows.length} returned`);

  const found = rows
    .map((video) => ({ video, disclosure: classify(video) }))
    .filter((x): x is { video: VideoRow; disclosure: PromotionDisclosure } => x.disclosure !== null);

  const promotedIds = new Set(found.map((f) => f.video.id));
  const median = organicMedian(rows, promotedIds);

  const promotions: Promotion[] = found.map(({ video, disclosure }) => ({
    postId: video.id,
    platform: 'youtube',
    title: video.title.slice(0, 200),
    url: `https://www.youtube.com/watch?v=${video.id}`,
    publishedAt: video.publishedAt,
    // Null, not guessed. See the header: "unidentified" is an honest cell and
    // a wrong advertiser name is a story about a campaign that never ran.
    brand: null,
    product: null,
    category: null,
    disclosure,
    views: video.views,
    sponsoredRetention:
      median !== null && median > 0 && video.views !== null
        ? Math.round((video.views / median) * 1000) / 1000
        : null,
  }));

  const byTier = (tier: PromotionDisclosure) => found.filter((f) => f.disclosure === tier).length;
  console.log(`\n  ${promotions.length} promotions of ${rows.length} uploads`);
  console.log(`     ${String(byTier('explicit')).padStart(4)}  explicit   (creator flagged it to YouTube)`);
  console.log(`     ${String(byTier('affiliate')).padStart(4)}  affiliate  (tracked link, NOT disclosed)`);
  console.log(`     ${String(byTier('inferred')).padStart(4)}  inferred   (text marker only — a guess)`);
  if (median !== null) console.log(`     organic median ${median.toLocaleString('en-US')} views`);
  for (const p of promotions) {
    const retention = p.sponsoredRetention === null ? '—' : `${Math.round(p.sponsoredRetention * 100)}%`;
    console.log(`     ${p.disclosure.padEnd(9)} ${retention.padStart(5)}  ${p.title.slice(0, 58)}`);
  }
  // The absence has to be a different sentence from the finding, or a channel
  // nobody scanned reads identically to one scanned and clean.
  if (promotions.length === 0) {
    console.log('     nothing found in this window — which is not the same as nothing existing');
  }
  // Brand and product are null on every row by construction; say so once rather
  // than let a reader conclude the advertiser could not be identified.
  if (promotions.length > 0) {
    console.log('\n  brand/product left null on every row: naming them needs the description read.');
  }

  if (!APPLY) {
    console.log('\n  Dry run. Re-run with --apply to write them.');
    return;
  }

  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !KEY) {
    console.error('  --apply needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const supabase = createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: creator } = await supabase
    .from('creators')
    .select('id')
    .eq('handle', handle)
    .maybeSingle<{ id: string }>();
  if (!creator) {
    console.error(`  no creator @${handle}`);
    process.exit(1);
  }

  const { error } = await supabase
    .from('report_metrics')
    .update({ promotions })
    .eq('creator_id', creator.id);
  if (error) {
    console.error('  write failed:', error.message);
    process.exit(1);
  }
  console.log(`\n  wrote ${promotions.length} promotions for @${handle}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
