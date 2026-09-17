/**
 * The off-platform pass: what the open web has written about a creator.
 *
 * Reddit, X, Instagram and TikTok are closed to this product by licensing, so
 * the only off-platform sources left are YouTube commentary (handled by the
 * comment pipeline) and the open web — press and forums — which is this.
 *
 * Uses Claude's server-side web_search tool rather than a separate search API:
 * the SDK is already a dependency, ANTHROPIC_API_KEY is already required by the
 * fit read, and adding a second vendor for one job is a third set of terms to
 * read. Search runs on Anthropic's side; nothing is scraped from here.
 *
 * WHAT IT REFUSES TO DO. No sentiment, in any form. Theme counts, never
 * shares. A corpusNote on every write, naming the queries — because on a
 * searched corpus the query is the largest single determinant of the answer,
 * and 0011 exists because we learned that the expensive way.
 *
 *   npm run opinion:press -- --handle jooshica
 *   npm run opinion:press -- --handle jooshica --apply
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

import {
  buildCorpusNote,
  classifySource,
  dedupeHits,
  relevantHits,
  mergePressPass,
  pressQueries,
  toMention,
  type PressHit,
} from '@/lib/opinion/press';
import { publicOpinionSchema } from '@/lib/schemas';
import type { Controversy, OpinionTheme } from '@/types';

const MODEL = 'claude-opus-5';
const WINDOW_DAYS = 365;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const handle = (args[args.indexOf('--handle') + 1] ?? '').replace(/^@/, '');

/**
 * What the model must return.
 *
 * A tool rather than a text answer, with `strict: true`, so the shape is
 * guaranteed rather than parsed out of prose. `mentionCount` is required and
 * `share` is absent from the schema entirely — the model cannot report a
 * proportion because it is not offered a field to put one in.
 */
const RECORD_TOOL: Anthropic.Tool = {
  name: 'record_findings',
  description:
    'Record what the web search actually found about this creator. Call exactly once, after searching.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      hits: {
        type: 'array',
        description: 'Every distinct article or thread you found and actually read a result for.',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            publisher: { type: 'string' },
            publishedAt: { type: 'string', description: 'ISO date, or empty string if unknown.' },
            excerpt: { type: 'string', description: 'A short quote from the source. Never paraphrase into it.' },
            aboutCreator: {
              type: 'boolean',
              description:
                'True only if this piece is actually about the creator named in the request. A name match is not enough — unrelated people share names and searches return incidental mentions.',
            },
          },
          required: ['url', 'title', 'publisher', 'publishedAt', 'excerpt', 'aboutCreator'],
          additionalProperties: false,
        },
      },
      themes: {
        type: 'array',
        description:
          'Recurring subjects across the hits. Count the ARTICLES that carry each one; do NOT estimate proportions of coverage.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            itemCount: {
              type: 'integer',
              description: 'How many of the distinct articles or threads carry this theme.',
            },
            urls: { type: 'array', items: { type: 'string' } },
          },
          required: ['label', 'mentionCount', 'urls'],
          additionalProperties: false,
        },
      },
      controversies: {
        type: 'array',
        description:
          'Only incidents actually reported in the hits. An absence of controversy is an empty array, never an invented one.',
        items: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            severity: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
            occurredAt: { type: 'string' },
            resolved: { type: 'boolean' },
          },
          required: ['summary', 'severity', 'occurredAt', 'resolved'],
          additionalProperties: false,
        },
      },
    },
    required: ['hits', 'themes', 'controversies'],
    additionalProperties: false,
  },
};

const SYSTEM = `You research what the open web has published about a named content creator, for a brand-safety and reputation report that both advertisers and the creator themselves will read.

Search the queries you are given. Then call record_findings exactly once.

WHAT TO RECORD
- Every distinct article or thread the search actually returned. Never add a result you did not see.
- Recurring themes, as COUNTS of how many hits carry each one. Do not estimate what share of coverage a theme represents — you searched a selection, so you have no denominator and any percentage would describe your queries rather than the public.
- Controversies only where an actual hit reports one. If the search found no controversy, return an empty array. An empty array is a real and useful result.

WHAT NOT TO DO
- No sentiment, no tone score, no overall verdict. You are recording what exists, not how it feels.
- Do not infer from absence. "Nothing found" means nothing was found, not that nothing happened, and not that the creator is clean.
- Do not repeat one incident as several themes to make coverage look broader.
- Severity describes what the source reports, not how bad it sounds. A single blog post calling something a scandal is low severity; sustained mainstream coverage is not.
- Remember the creator reads this. Record the facts the sources carry and nothing you cannot point at.`;

async function search(displayName: string, alsoKnownAs: string | null) {
  const client = new Anthropic();
  const queries = pressQueries(displayName, handle, alsoKnownAs);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8_000,
    system: SYSTEM,
    tools: [
      // Dynamic-filtering variant. Code execution runs under the hood, so
      // code_execution must NOT be declared alongside it.
      { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
      RECORD_TOOL,
    ],
    messages: [
      {
        role: 'user',
        content:
          `Creator: ${displayName} (@${handle}). Window: last ${WINDOW_DAYS} days.\n\n` +
          `Run these searches, then record what you found:\n` +
          queries.map((q) => `- ${q}`).join('\n'),
      },
    ],
  });

  // Server-tool failures arrive as HTTP 200 with an error object in the result
  // block rather than a thrown exception, and for web search a success
  // `content` is a list where an error `content` is an object. Branch on that
  // before trusting anything downstream.
  for (const block of response.content) {
    if (block.type === 'web_search_tool_result' && !Array.isArray(block.content)) {
      console.warn('  web_search returned an error block:', JSON.stringify(block.content));
    }
  }

  if (response.stop_reason === 'refusal') {
    throw new Error(`refused: ${response.stop_details?.explanation ?? 'no explanation'}`);
  }

  const call = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'record_findings',
  );
  if (!call) throw new Error('the model searched but recorded nothing');

  // Parse rather than string-match: tool input escaping varies by model.
  return { queries, findings: call.input as {
    hits: PressHit[];
    themes: { label: string; itemCount: number; urls: string[] }[];
    controversies: Controversy[];
  } };
}

async function main() {
  if (!handle) {
    console.error(
      'Usage: npm run opinion:press -- --handle <h> [--also-known-as "Legal Name"] [--apply]',
    );
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is required — the search runs through the Messages API.');
    process.exit(1);
  }

  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !KEY) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const supabase = createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: creator, error: creatorError } = await supabase
    .from('creators')
    .select('id, handle, display_name')
    .eq('handle', handle)
    .maybeSingle<{ id: string; handle: string; display_name: string }>();

  if (creatorError || !creator) {
    console.error(`No creator @${handle}.`);
    process.exit(1);
  }

  console.log(`  ${creator.display_name} (@${creator.handle})`);
  // `creators` has no legal-name column; --also-known-as supplies it until one
  // exists. Real press prints the legal name, and a creator known under two is
  // invisible under one.
  const aka = args.includes('--also-known-as') ? args[args.indexOf('--also-known-as') + 1] : null;
  const { queries, findings } = await search(creator.display_name, aka ?? null);

  const relevant = relevantHits(findings.hits ?? []);
  const hits = dedupeHits(relevant);
  const mentions = hits.map(toMention);
  const byUrl = new Map(mentions.map((m) => [m.url, m]));

  const themes: OpinionTheme[] = (findings.themes ?? []).map((t) => {
    const evidence = t.urls.map((u) => byUrl.get(u)).filter((m): m is NonNullable<typeof m> => !!m);
    return {
      label: t.label,
      // Legacy field. Kept at 0 rather than computed: a share over a searched
      // corpus is the number this whole model was rebuilt to stop reporting.
      share: 0,
      // An article is one item and carries no reaction count we collect, so
      // the count that means something here is the item count.
      itemCount: t.itemCount,
      reactionCount: -1,
      mentions: evidence.slice(0, 5),
      example: evidence[0]?.excerpt ?? '',
    };
  });

  const searched: ('Press' | 'Forums')[] = ['Press', 'Forums'];
  const found = {
    press: mentions.filter((m) => m.source === 'Press').length,
    forums: mentions.filter((m) => m.source === 'Forums').length,
    other: mentions.filter((m) => classifySource(m.url ?? '') === 'Other').length,
  };

  const raw = findings.hits?.length ?? 0;
  console.log(
    `  ${hits.length} usable · ${raw} raw · ${raw - relevant.length} not about this creator · ` +
      `${relevant.length - hits.length} syndicated duplicates`,
  );
  console.log(`  Press ${found.press} · Forums ${found.forums} · dropped as platform chatter ${found.other}`);
  console.log(`  ${themes.length} themes · ${(findings.controversies ?? []).length} controversies`);
  for (const t of themes) console.log(`     ${String(t.itemCount).padStart(3)}  ${t.label}`);
  for (const c of findings.controversies ?? []) {
    console.log(`     [${c.severity}] ${c.resolved ? 'resolved' : 'open'}  ${c.summary.slice(0, 80)}`);
  }

  if (!APPLY) {
    console.log('\n  Dry run. Re-run with --apply to write.');
    return;
  }

  const { data: row } = await supabase
    .from('report_metrics')
    .select('public_opinion')
    .eq('creator_id', creator.id)
    .maybeSingle<{ public_opinion: unknown }>();

  // One row per article — press is per-item by construction, which is what
  // makes concentration computable on this half even when the YouTube half
  // cannot supply it.
  const items = hits.map((h, i) => ({
    id: `item_${i}_${h.publisher.replace(/\W+/g, '').slice(0, 12)}`,
    source: classifySource(h.url),
    title: h.title,
    publisher: h.publisher,
    url: h.url,
    publishedAt: h.publishedAt ?? '',
    reactions: null,
  }));

  const merged = mergePressPass(publicOpinionSchema.parse(row?.public_opinion), {
    mentions,
    items,
    themes,
    controversies: findings.controversies ?? [],
    corpusNote: buildCorpusNote(queries, hits.length, WINDOW_DAYS),
    // The web pass can answer the question the YouTube pass could not: how
    // many candidates came back, how many survived, and on what rule.
    selection: {
      surfaced: raw,
      read: hits.length,
      rule: 'every relevant, non-duplicate result from the listed queries — no ranking or cutoff',
    },
    windowDays: WINDOW_DAYS,
    searchedPlatforms: searched,
  });

  const { error } = await supabase
    .from('report_metrics')
    .update({ public_opinion: merged })
    .eq('creator_id', creator.id);

  if (error) {
    console.error('  write failed:', error.message);
    process.exit(1);
  }
  console.log(`\n  Written. coveredPlatforms: ${merged.coveredPlatforms.join(', ')}`);
}

main().catch((err) => {
  console.error('[opinion:press] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
