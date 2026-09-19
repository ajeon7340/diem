import 'server-only';

import type { CommentCluster, CommentIntent, CommentObject } from '@/types';
import { MAX_NAMED_CLUSTERS, TAIL_ID } from '@/lib/report/clusters';
import type { RawComment } from './classify';
import type { AxisLabel } from './intent';

/**
 * Turn per-comment labels into the clusters the profile renders.
 *
 * `top_comment_clusters` had a column, a type, a zod schema, a mapper, a
 * retention rule, a policy entry and a rendered panel — and the only thing
 * that ever wrote it was `scripts/seed.ts`, from hand-written fixtures. So a
 * real creator's report carried the two-axis totals and not one actual
 * comment, which is the part a person came to read.
 *
 * NO MODEL CALL. A cluster IS a cell of the object x intent grid — the type
 * carries `object` and `intent` for exactly that reason — and the pass has
 * already placed every comment on both axes. Asking a model to group them a
 * second time would produce a set of themes that does not reconcile with the
 * grid beside it, and two disagreeing groupings of one corpus is worse than
 * one.
 */

/**
 * Every non-empty cell is kept, deliberately.
 *
 * `CommentCluster.share` is documented to sum to 1 across a report: "a
 * proportion display that drops a bucket while keeping the full denominator
 * prints a number that cannot be reconciled with its own total". Taking a top
 * N would do precisely that. The renderer may show fewer; the stored set is
 * complete.
 */
const OBJECT_NAME: Record<CommentObject, string> = {
  creator: 'the creator',
  content: 'the video',
  product: 'a product',
  subject: 'the person the video is about',
  unclassified: 'something the pass could not place',
};

const INTENT_VERB: Record<CommentIntent, string> = {
  buy: 'Buying interest in',
  request: 'Requests about',
  ask: 'Questions about',
  praise: 'Praise for',
  criticise: 'Criticism of',
  // Named as what it is. `abuse` was split out of `criticise` because the two
  // are opposites, and a label that softens it back into "criticism" would
  // undo that split in the one place a person actually reads.
  abuse: 'Abuse aimed at',
  react: 'Reactions to',
  unclassified: 'Unplaced comments about',
};

function label(object: CommentObject, intent: CommentIntent): string {
  return `${INTENT_VERB[intent]} ${OBJECT_NAME[object]}`;
}

/**
 * Words that define this cell rather than the channel.
 *
 * Frequency alone returns the same filler in every cluster, so a term is
 * ranked by how much MORE it appears here than in the corpus at large. No
 * stoplist per language: the corpus is its own stoplist, which is the only
 * approach that works on a Korean comment section and an English one without
 * shipping a word list for each.
 */
function keyphrases(cellTexts: string[], corpusCounts: Map<string, number>, corpusSize: number): string[] {
  const here = new Map<string, number>();
  for (const text of cellTexts) {
    for (const term of new Set(tokenise(text))) here.set(term, (here.get(term) ?? 0) + 1);
  }

  return [...here.entries()]
    .filter(([, n]) => n >= 3)
    .map(([term, n]) => {
      const hereShare = n / Math.max(cellTexts.length, 1);
      const corpusShare = (corpusCounts.get(term) ?? 0) / Math.max(corpusSize, 1);
      // +1 on the denominator so a term unique to this cell scores high without
      // dividing by zero, and log(n) so a lift computed off three occurrences
      // does not outrank one computed off three hundred.
      return { term, score: (hereShare / (corpusShare + 0.01)) * Math.log(n + 1) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.term);
}

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 && t.length <= 20);
}

export function buildClusters(
  comments: RawComment[],
  labels: AxisLabel[],
  options: { examplesPerCluster?: number } = {},
): CommentCluster[] {
  const examplesPer = options.examplesPerCluster ?? 3;
  const corpusCounts = new Map<string, number>();
  for (const comment of comments) {
    for (const term of new Set(tokenise(comment.text))) {
      corpusCounts.set(term, (corpusCounts.get(term) ?? 0) + 1);
    }
  }

  const cells = new Map<string, { object: CommentObject; intent: CommentIntent; items: RawComment[] }>();
  // `labels` is parallel to `comments` by position — that is the contract
  // `rollUpAxes` reads it under too, and the two must not disagree about which
  // comment a label belongs to.
  comments.forEach((comment, index) => {
    const placed = labels[index];
    if (!placed) return;
    const key = `${placed.object}:${placed.intent}`;
    const cell = cells.get(key) ?? { object: placed.object, intent: placed.intent, items: [] };
    cell.items.push(comment);
    cells.set(key, cell);
  });

  // The denominator is every classified comment, not the size of the cells we
  // happen to keep — see the note above about shares that cannot be reconciled.
  const total = labels.length;
  if (total === 0) return [];

  const ranked = [...cells.entries()].sort((a, b) => b[1].items.length - a[1].items.length);
  const named = ranked.slice(0, MAX_NAMED_CLUSTERS);
  const tail = ranked.slice(MAX_NAMED_CLUSTERS);

  const built = named.map(([key, cell]) => {
      // Most-liked, and `basis` says so. "Representative" would be a claim
      // about typicality that nothing here measures; most-liked is a fact
      // about the comment and is also what a visitor to the channel sees
      // first.
      const ranked = [...cell.items].sort((a, b) => b.likes - a.likes);
      const examples = ranked.slice(0, examplesPer);

      return {
        id: key,
        label: label(cell.object, cell.intent),
        share: cell.items.length / total,
        commentCount: cell.items.length,
        // Null on purpose: the axis already carries valence, and a score
        // derived from the same labelling would restate the badge beside it
        // while looking like corroboration. See CommentCluster.sentiment.
        sentiment: null,
        object: cell.object,
        intent: cell.intent,
        keyphrases: keyphrases(cell.items.map((c) => c.text), corpusCounts, comments.length),
        comments: examples.map((c) => ({
          id: c.id,
          // Bounded at the source too. The schema truncates on read, but a
          // stored payload nobody capped is a row that grows without limit.
          text: c.text.slice(0, 800),
          platform: 'youtube' as const,
          postId: c.videoId,
          postTitle: c.videoTitle || null,
          likes: c.likes,
          publishedAt: c.publishedAt || null,
          basis: 'most_liked' as const,
          url: `https://www.youtube.com/watch?v=${c.videoId}&lc=${c.id}`,
        })),
        exampleComment: (examples[0]?.text ?? '').slice(0, 500),
      };
  });

  if (tail.length === 0) return built;

  // One row for the rest, carrying its real count so the shares still sum to
  // one. No object, no intent and no example: it belongs to several cells, and
  // picking one comment to stand for a mixture would present an aggregate as a
  // finding.
  const tailCount = tail.reduce((sum, [, cell]) => sum + cell.items.length, 0);
  return [
    ...built,
    {
      id: TAIL_ID,
      label: `${tail.length} smaller groups`,
      share: tailCount / total,
      commentCount: tailCount,
      sentiment: null,
      object: null,
      intent: null,
      keyphrases: [],
      comments: [],
      exampleComment: '',
    },
  ];
}
