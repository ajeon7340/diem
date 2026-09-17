import type {
  Controversy,
  OpinionItem,
  OpinionMention,
  OpinionTheme,
  PublicOpinion,
} from '@/types';

/**
 * Searching the open web for what has been written about a creator.
 *
 * This is the half of `publicOpinion` that YouTube's policies do not reach:
 * press articles and forum threads are web content found by search, not API
 * Data, so they carry no 30-day clock and no derived-metrics restriction. They
 * are also the only route left — Reddit, X, Instagram and TikTok forbid
 * commercialising their platform data, so the off-platform pass covers YouTube
 * commentary, press and forums and nothing else.
 *
 * THE BIAS DOES NOT GO AWAY BECAUSE THE SOURCE CHANGED.
 *
 * Everything migration 0011 established about a searched corpus applies here
 * unchanged, and arguably harder. Query a creator's name in news and you get
 * whoever had a reason to publish about them, which is disproportionately
 * conflict — a person can be written about a hundred times for one bad week
 * and never once for five good years. So:
 *
 *   - No sentiment. Not averaged, not per-source, not per-theme.
 *   - Themes carry COUNTS, never shares. "9 of 23 articles we read" survives a
 *     selected frame; "39% of press coverage" claims a denominator that does
 *     not exist.
 *   - Every pass writes a corpusNote stating the queries it ran, because the
 *     method is the largest single determinant of the result.
 *   - "Searched and found nothing" is a real finding and must be recorded as
 *     coverage with zero mentions — not as absence of coverage.
 */

/** One result as the search returned it, before it becomes a mention. */
export interface PressHit {
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  excerpt: string;
  /**
   * Is this piece actually about the creator we asked about?
   *
   * A name search matches incidental mentions and unrelated people. One real
   * run returned a news story about a different person entirely, from a real
   * outlet, on a plausible-looking URL — nothing about the host or the path
   * could have caught it. Only reading the piece can, so the model is required
   * to answer and anything false is dropped before it becomes a mention.
   */
  aboutCreator: boolean;
}

/** Drops hits the search matched incidentally rather than about this creator. */
export function relevantHits(hits: PressHit[]): PressHit[] {
  return hits.filter((hit) => hit.aboutCreator);
}

/**
 * Queries for one creator.
 *
 * Deliberately more than one, and deliberately not all negative. A single
 * "<name> controversy" query guarantees a corpus of controversy and then
 * reports it as a finding — the exact failure 0011 documented. Running neutral
 * and positive frames alongside does not remove the bias, but it stops us
 * manufacturing it, and the corpusNote records what was asked so a reader can
 * discount accordingly.
 */
export function pressQueries(
  displayName: string,
  handle: string,
  /**
   * The name press actually prints, when it differs from the channel name.
   *
   * Found the hard way: querying only the handle-style name returned profile
   * farms, while the one real feature used her legal name. A creator known
   * under two names is invisible under one of them.
   */
  alsoKnownAs?: string | null,
): string[] {
  const name = displayName.trim();
  const queries = [
    `"${name}" creator interview OR profile OR feature`,
    `"${name}" brand partnership OR sponsorship`,
    `"${name}" controversy OR criticism OR apology`,
    `"${name}" ${handle} news`,
  ];
  if (alsoKnownAs?.trim()) {
    queries.push(`"${alsoKnownAs.trim()}" interview OR feature OR controversy`);
  }
  return queries;
}

/**
 * Hosts that look like press and are not.
 *
 * Found by running the real queries for one creator: of eight results the
 * classifier called "Press", two were editorial (a government news site and a
 * magazine feature) and six were these — SEO profile farms that scrape the same
 * five facts, a booking-contact directory, a competitor's analytics dashboard,
 * and one AI-generated net-worth page that invented a revenue breakdown out of
 * nothing. A corpus three-quarters made of those is not a press corpus, and the
 * invented figures are worse than the noise: they are wrong in a way a reader
 * cannot detect.
 *
 * The net-worth genre needed path patterns as well as host ones: the slop page
 * sat on a meaningless hostname and announced itself only in the URL
 * ("how-much-is-…-worth", "hidden-wealth").
 *
 * The earlier rule here was "be generous, mislabelling a blog as press is a
 * smaller error than dropping a real outlet". That was wrong in this direction:
 * the failure mode is not a missed outlet, it is a corpus of scrapers reported
 * as coverage. This list is certainly incomplete, which is why `aboutCreator`
 * below carries the rest of the weight.
 */
const AGGREGATOR_PATTERNS =
  /famousbirthdays|kprofiles|kpopsingers|bookingagentinfo|net-?worth|celebritynetworth|how-much-is|hidden-wealth|\\bwealth\\b|socialblade|noxinfluencer|starngage|thoughtleaders|influencermarketinghub|hypeauditor|allfamous|biography\.|wikitubia|fandom\.com|idolwiki|\bwiki\b/;

/** Domains that are press rather than platform chatter or scraped profiles. */
export function classifySource(url: string): 'Press' | 'Forums' | 'Other' {
  let host = '';
  let path = '';
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase().replace(/^www\./, '');
    path = u.pathname.toLowerCase();
  } catch {
    return 'Other';
  }
  // Platforms whose terms forbid this use. Dropped, never relabelled — a
  // result from one must not enter the corpus through the back door.
  if (/(^|\.)(reddit|x|twitter|instagram|tiktok|youtube|youtu)\.(com|be)$/.test(host)) {
    return 'Other';
  }
  if (AGGREGATOR_PATTERNS.test(host) || AGGREGATOR_PATTERNS.test(path)) return 'Other';
  if (/forum|community|board|cafe\.naver|dcinside|fmkorea|theqoo|pann|inven|ruliweb/.test(host)) {
    return 'Forums';
  }
  return 'Press';
}

/**
 * Collapse duplicates.
 *
 * Syndication means one story appears under a dozen hostnames, and counting it
 * a dozen times is how a single incident becomes "widely reported". Keyed on
 * normalised URL first, then on title, because syndicated copies keep the
 * headline and change the path.
 */
export function dedupeHits(hits: PressHit[]): PressHit[] {
  const seen = new Set<string>();
  const out: PressHit[] = [];
  for (const hit of hits) {
    let key: string;
    try {
      const u = new URL(hit.url);
      key = `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`;
    } catch {
      key = hit.url;
    }
    const titleKey = hit.title.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key) || seen.has(titleKey)) continue;
    seen.add(key);
    seen.add(titleKey);
    out.push(hit);
  }
  return out;
}

export function toMention(hit: PressHit, index: number): OpinionMention {
  return {
    id: `press_${index}_${hit.publisher.replace(/\W+/g, '').slice(0, 12)}`,
    source: classifySource(hit.url),
    // Short by design. A press excerpt is a pointer to the article, not a
    // substitute for reading it, and storing more of someone's copy than the
    // quotation needs is a different problem from the one this feature solves.
    excerpt: hit.excerpt.slice(0, 320),
    url: hit.url,
    publishedAt: hit.publishedAt ?? '',
    // Press has no like count. Null rather than 0 — the platform does not
    // count, which is not the same as nobody engaging.
    engagement: null,
  };
}

/**
 * States what was asked, so a reader can discount the answer.
 *
 * Generated rather than authored, because a note written once goes stale the
 * first time the queries change and then misdescribes the corpus it explains.
 */
export function buildCorpusNote(queries: string[], hitCount: number, windowDays: number): string {
  return (
    `Assembled by web search over the last ${windowDays} days, from ${queries.length} queries ` +
    `(${queries.map((q) => `“${q}”`).join(', ')}), returning ${hitCount} distinct articles and ` +
    `threads after removing syndicated duplicates. A search selects for whoever had a reason to ` +
    `publish, which skews toward conflict — read this as how much has been written and about ` +
    `what, never as how the public feels.`
  );
}

/**
 * Merge a web pass into an existing corpus without disturbing the other half.
 *
 * The YouTube commentary side is fetched on a different schedule, is subject to
 * a retention clock this side is not, and must survive a press pass untouched.
 * `coveredPlatforms` is a union: a platform read by either pass stays read.
 */
export function mergePressPass(
  existing: PublicOpinion | null,
  pass: {
    mentions: OpinionMention[];
    /** The articles and threads themselves, one row each. */
    items: OpinionItem[];
    themes: OpinionTheme[];
    controversies: Controversy[];
    corpusNote: string;
    selection: { surfaced: number | null; read: number; rule: string | null };
    windowDays: number;
    searchedPlatforms: ('Press' | 'Forums')[];
  },
): PublicOpinion {
  const kept = existing?.sources.filter((s) => s.source !== 'Press' && s.source !== 'Forums') ?? [];
  // One article is one item. Press has no reaction count we collect, and
  // inventing a zero would put it in the same column as a video's comment
  // section — which is the conflation this model was split to end.
  const pressCount = pass.mentions.filter((m) => m.source === 'Press').length;
  const forumCount = pass.mentions.filter((m) => m.source === 'Forums').length;

  const sources = [...kept];
  // Recorded even at zero: "we searched Press and found nothing" is a finding,
  // and dropping the row would make it indistinguishable from never looking.
  if (pass.searchedPlatforms.includes('Press')) {
    sources.push({ source: 'Press', items: pressCount, reactions: null });
  }
  if (pass.searchedPlatforms.includes('Forums')) {
    sources.push({ source: 'Forums', items: forumCount, reactions: null });
  }

  const otherThemes = existing?.themes.filter(
    (t) => !t.mentions.every((m) => m.source === 'Press' || m.source === 'Forums'),
  ) ?? [];

  // The YouTube half's own item records survive untouched; the press pass
  // replaces only its own.
  const keptItems =
    existing?.items.filter((i) => i.source !== 'Press' && i.source !== 'Forums') ?? [];

  return {
    corpusNote: [existing?.corpusNote, pass.corpusNote].filter(Boolean).join(' — '),
    items: [...keptItems, ...pass.items],
    selection: pass.selection,
    coveredPlatforms: Array.from(
      new Set([...(existing?.coveredPlatforms ?? []), ...pass.searchedPlatforms]),
    ),
    windowDays: Math.max(existing?.windowDays ?? 0, pass.windowDays),
    itemsAnalyzed: sources.reduce((sum, s) => sum + s.items, 0),
    reactionsAnalyzed: sources.some((s) => s.reactions !== null)
      ? sources.reduce((sum, s) => sum + (s.reactions ?? 0), 0)
      : null,
    // Share of mentions that discuss the creator rather than merely link them.
    // Carried forward; a press pass has no basis to revise it.
    discussionShare: existing?.discussionShare ?? 1,
    sources,
    themes: [...otherThemes, ...pass.themes],
    controversies: [...(existing?.controversies ?? []), ...pass.controversies],
    summary: existing?.summary ?? '',
  };
}

/**
 * How much of the discussion sits under one piece.
 *
 * Seven pieces carrying a thousand comments each and seven pieces where one
 * carries six thousand are the same aggregate and different facts. This is the
 * number that separates them, and it is the reason `items` exists at all.
 *
 * Null when it cannot be computed — fewer than two pieces with a reaction
 * count, or no per-piece record at all. Null here is load-bearing: a missing
 * concentration must read as "we cannot say", never as "evenly spread".
 */
export function opinionConcentration(items: OpinionItem[]): {
  largestShare: number;
  largestTitle: string;
  counted: number;
} | null {
  const withCounts = items.filter((i) => i.reactions !== null && i.reactions > 0);
  if (withCounts.length < 2) return null;

  const total = withCounts.reduce((sum, i) => sum + (i.reactions ?? 0), 0);
  if (total <= 0) return null;

  const largest = withCounts.reduce((a, b) => ((b.reactions ?? 0) > (a.reactions ?? 0) ? b : a));
  return {
    largestShare: (largest.reactions ?? 0) / total,
    largestTitle: largest.title,
    counted: withCounts.length,
  };
}
