/**
 * Assertions for the off-platform press pass.
 *
 * The model does the searching; everything that decides what the search MEANS
 * happens here — dedupe, classification, the count-not-share rule, the merge
 * that must not disturb the YouTube half, and the retention split that must not
 * delete press on YouTube's clock. All of it is testable without a network
 * call, which is the point of keeping it out of the worker.
 *
 *   npm run verify:opinion
 */
import {
  buildCorpusNote,
  classifySource,
  dedupeHits,
  mergePressPass,
  pressQueries,
  opinionConcentration,
  relevantHits,
  toMention,
  type PressHit,
} from '@/lib/opinion/press';
import { isApiSourcedOpinion, purgeApiSourcedOpinion } from '@/lib/report/policy';
import {
  COVERABLE_OPINION_PLATFORMS,
  SEARCH_NOT_CENSUS_NOTE,
  UNCOVERABLE_NOTE,
} from '@/types';
import type { PublicOpinion } from '@/types';

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

const hit = (url: string, title = 'A story', publisher = 'Outlet'): PressHit => ({
  url,
  title,
  publisher,
  publishedAt: '2026-05-01',
  excerpt: 'Something was written.',
  aboutCreator: true,
});

// ---------------------------------------------------------------------------
// The queries — a corpus of controversy is manufactured, not found
// ---------------------------------------------------------------------------

const queries = pressQueries('Jooshica', 'jooshica');
check('more than one frame is searched', queries.length > 1, true);
check(
  'and not every frame is negative',
  queries.filter((q) => /controversy|criticism|apology/i.test(q)).length < queries.length,
  true,
);
check(
  'a neutral frame is present',
  queries.some((q) => /interview|profile|feature/i.test(q)),
  true,
);

// ---------------------------------------------------------------------------
// Coverage narrowed to what can actually be read
// ---------------------------------------------------------------------------

check(
  'only the three readable platforms get a tab',
  [...COVERABLE_OPINION_PLATFORMS],
  ['YouTube', 'Press', 'Forums'],
);
// Narrowing the tabs is a product decision. Dropping the admission that four
// surfaces are missing would turn a narrow report into a misleading one, so
// the note is pinned: a clean-looking panel must still say what is absent.
for (const p of ['Reddit', 'X', 'Instagram', 'TikTok']) {
  check(`the note names ${p}`, UNCOVERABLE_NOTE.includes(p), true);
}
check(
  'and says the absence is licensing, not silence',
  /by licensing, not by absence/i.test(UNCOVERABLE_NOTE),
  true,
);
check(
  'no uncoverable platform sneaks into the tabs',
  (COVERABLE_OPINION_PLATFORMS as readonly string[]).some((p) =>
    ['Reddit', 'X', 'Instagram', 'TikTok'].includes(p),
  ),
  false,
);

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

check('a news domain is press', classifySource('https://www.bbc.com/news/x'), 'Press');
check('a forum is a forum', classifySource('https://fmkorea.com/123'), 'Forums');
check('a naver cafe is a forum', classifySource('https://cafe.naver.com/abc/1'), 'Forums');
// Platform chatter is dropped rather than relabelled: those platforms forbid
// this use, so a result from one must not enter the corpus by the back door.
check('reddit is neither', classifySource('https://www.reddit.com/r/x/1'), 'Other');
check('x is neither', classifySource('https://x.com/someone/status/1'), 'Other');
check('a malformed url is neither', classifySource('not a url'), 'Other');

// Every one of these came back as "Press" on a real run for one creator, and
// only two of the eight were editorial. The rest were profile farms, a booking
// directory, a competitor's dashboard, and an AI net-worth page that invented a
// revenue breakdown. Pinned from the actual URLs.
check('a government news site is press', classifySource('https://www.korea.net/NewsFocus/x'), 'Press');
check('a magazine feature is press', classifySource('https://modelistemagazine.com/blogs/x'), 'Press');
check('famousbirthdays is not', classifySource('https://www.famousbirthdays.com/people/x.html'), 'Other');
check('kprofiles is not', classifySource('https://kprofiles.com/x-profile-facts/'), 'Other');
check('a booking directory is not', classifySource('https://bookingagentinfo.com/celebrity/x/'), 'Other');
check(
  'an invented net-worth page is not',
  classifySource('https://devdata2.supportflex.nl/article/how-much-is-x-worth-the-hidden-wealth'),
  'Other',
);
check(
  'a competitor analytics dashboard is not',
  classifySource('https://app.thoughtleaders.io/youtube/x'),
  'Other',
);

// A real outlet writing about a DIFFERENT person. Nothing in the host or path
// can catch this, which is why relevance is a field the model must answer.
const wrongPerson = { ...hit('https://www.malaymail.com/news/showbiz/2021/x'), aboutCreator: false };
check('the wrong person is dropped', relevantHits([wrongPerson]).length, 0);
check('the right person survives', relevantHits([hit('https://korea.net/a')]).length, 1);

// A creator whose press name differs from their channel name.
const aka = pressQueries('Jooshica', 'jooshica', 'Jessica Joo');
check('an alternate name adds a query', aka.length > pressQueries('Jooshica', 'jooshica').length, true);
check('and it is actually searched', aka.some((q) => q.includes('Jessica Joo')), true);
check(
  'a blank alternate name adds nothing',
  pressQueries('Jooshica', 'jooshica', '   ').length,
  pressQueries('Jooshica', 'jooshica').length,
);

// ---------------------------------------------------------------------------
// Dedupe — syndication turns one story into "widely reported"
// ---------------------------------------------------------------------------

const syndicated = [
  hit('https://outlet-a.com/story', 'Creator responds to criticism', 'Outlet A'),
  hit('https://www.outlet-a.com/story/', 'Creator responds to criticism', 'Outlet A'),
  hit('https://outlet-b.com/wire/2026/05/x', 'Creator responds to criticism', 'Outlet B'),
  hit('https://outlet-c.com/another', 'A different story entirely', 'Outlet C'),
];
check('one story counted once', dedupeHits(syndicated).length, 2);
check(
  'www and a trailing slash are the same url',
  dedupeHits([syndicated[0], syndicated[1]]).length,
  1,
);
check('distinct stories both survive', dedupeHits([syndicated[0], syndicated[3]]).length, 2);

// ---------------------------------------------------------------------------
// Mentions carry no engagement, and excerpts stay short
// ---------------------------------------------------------------------------

const long = { ...hit('https://outlet.com/a'), excerpt: 'x'.repeat(900) };
check('excerpts are capped', toMention(long, 0).excerpt?.length ?? 0, 320);
// Press has no like count. Zero would claim nobody engaged; null says the
// medium does not count — the same rule as every other metric here.
check('press engagement is null, not zero', toMention(hit('https://outlet.com/a'), 0).engagement, null);

// ---------------------------------------------------------------------------
// The corpus note states the method
// ---------------------------------------------------------------------------

const note = buildCorpusNote(queries, 23, 365);
check('the note names every query', queries.every((q) => note.includes(q)), true);
check('and warns that a search selects', /skews toward conflict/i.test(note), true);
check('and forbids reading it as sentiment', /never as how the public feels/i.test(note), true);

// ---------------------------------------------------------------------------
// The merge must not disturb the YouTube half
// ---------------------------------------------------------------------------

const existing: PublicOpinion = {
  corpusNote: 'Drawn from seven YouTube commentary videos.',
  coveredPlatforms: ['YouTube'],
  windowDays: 460,
  itemsAnalyzed: 7_906,
  reactionsAnalyzed: null,
  items: [],
  discussionShare: 0.91,
  // Not recorded by this pass — nothing says how many videos the search
  // surfaced, or why these ones. See PublicOpinion.selection.
  selection: null,
  sources: [{ source: 'YouTube', items: 7_906, reactions: null }],
  themes: [
    {
      label: 'Authenticity criticism',
      share: 0.52,
      reactionCount: 4_111,
      itemCount: null,
      mentions: [
        { id: 'y1', source: 'YouTube', excerpt: 'x', url: null, publishedAt: '', engagement: 12 },
      ],
      example: 'x',
    },
  ],
  controversies: [],
  summary: '',
};

const merged = mergePressPass(existing, {
  mentions: [toMention(hit('https://outlet.com/a'), 0), toMention(hit('https://fmkorea.com/1'), 1)],
  items: [],
  themes: [
    {
      label: 'Brand partnership coverage',
      share: 0,
      reactionCount: 2,
      itemCount: null,
      mentions: [],
      example: '',
    },
  ],
  controversies: [],
  corpusNote: 'Assembled by web search.',
  selection: { surfaced: null, read: 0, rule: null },
  windowDays: 365,
  searchedPlatforms: ['Press', 'Forums'],
});

check('the YouTube source survives untouched', merged.sources[0], existing.sources[0]);
check('the YouTube theme survives', merged.themes[0].label, 'Authenticity criticism');
check('coverage is a union', merged.coveredPlatforms, ['YouTube', 'Press', 'Forums']);
check(
  'both corpus notes are carried',
  merged.corpusNote?.includes('commentary videos') && merged.corpusNote?.includes('web search'),
  true,
);
check('the total is recomputed from the sources', merged.itemsAnalyzed, 7_906 + 1 + 1);
// "Searched and found nothing" must be recorded as coverage with zero, or it
// is indistinguishable from never having looked.
const empty = mergePressPass(null, {
  mentions: [],
  items: [],
  themes: [],
  controversies: [],
  corpusNote: 'n',
  selection: { surfaced: null, read: 0, rule: null },
  windowDays: 365,
  searchedPlatforms: ['Press'],
});
check('an empty search still records coverage', empty.coveredPlatforms, ['Press']);
check('with a zero count rather than no row', empty.sources, [{ source: 'Press', items: 0, reactions: null }]);

// ---------------------------------------------------------------------------
// The counts describe the search, not the creator
// ---------------------------------------------------------------------------

// "Why is it 7? There are way more videos than that." Seven is what one query
// surfaced. Nothing here can enumerate what exists, so the panel must never
// let a small number read as little discussion.
check(
  'the note says the counts are about the search',
  /describe this search, not this creator/i.test(SEARCH_NOT_CENSUS_NOTE),
  true,
);
check(
  'and that a low number is not evidence of absence',
  /never that little exists/i.test(SEARCH_NOT_CENSUS_NOTE),
  true,
);
check(
  'and points the reader at what is actually readable',
  /do not read the totals as volume/i.test(SEARCH_NOT_CENSUS_NOTE),
  true,
);

// ---------------------------------------------------------------------------
// An aggregate must not hide its distribution
// ---------------------------------------------------------------------------

const piece = (id: string, reactions: number | null, title = id) => ({
  id,
  source: 'YouTube',
  title,
  publisher: null,
  url: null,
  publishedAt: '2026-05-01',
  reactions,
});

// Seven pieces carrying a thousand each and seven where one carries six
// thousand are the same aggregate and completely different facts.
const even = [1, 2, 3, 4].map((n) => piece(`p${n}`, 1_000));
const lopsided = [piece('viral', 6_000), ...[1, 2, 3].map((n) => piece(`p${n}`, 300))];

check('an even spread concentrates at a quarter', Math.round(opinionConcentration(even)!.largestShare * 100), 25);
check('a lopsided one at nearly nine tenths', Math.round(opinionConcentration(lopsided)!.largestShare * 100), 87);
check('and it names the piece', opinionConcentration(lopsided)!.largestTitle, 'viral');

// Null is load-bearing: a missing concentration must read as "we cannot say",
// never as "evenly spread". These are the three ways it goes missing.
check('no items means no concentration', opinionConcentration([]), null);
check('one item cannot concentrate against anything', opinionConcentration([piece('a', 900)]), null);
check(
  'items without reaction counts cannot either',
  opinionConcentration([piece('a', null), piece('b', null)]),
  null,
);

// ---------------------------------------------------------------------------
// One comment is not one mention
// ---------------------------------------------------------------------------

// The corpus that forced this split: seven YouTube commentary videos, 7,906
// comments beneath them. Calling that 7,906 mentions put it in the same column
// as a press count where one article is one mention — and once merged, YouTube
// would have been 99.6% of a total that meant nothing.
const split = mergePressPass(
  {
    corpusNote: 'seven videos',
    coveredPlatforms: ['YouTube'],
    windowDays: 460,
    itemsAnalyzed: 7,
    reactionsAnalyzed: 7_906,
    items: [],
    discussionShare: 0.91,
    // Not recorded by this pass — nothing says how many videos the search
    // surfaced, or why these ones. See PublicOpinion.selection.
    selection: null,
    sources: [{ source: 'YouTube', items: 7, reactions: 7_906 }],
    themes: [],
    controversies: [],
    summary: '',
  },
  {
    mentions: Array.from({ length: 23 }, (_, i) => toMention(hit(`https://outlet${i}.com/a`), i)),
    items: [],
    themes: [],
    controversies: [],
    corpusNote: 'web search',
    selection: { surfaced: null, read: 0, rule: null },
    windowDays: 365,
    searchedPlatforms: ['Press'],
  },
);
check('seven videos stay seven pieces', split.sources[0].items, 7);
check('and keep their comment count separately', split.sources[0].reactions, 7_906);
check('twenty-three articles are twenty-three pieces', split.sources[1].items, 23);
// 30, not 7,929. The whole point.
check('the corpus is thirty pieces of discussion', split.itemsAnalyzed, 30);
check('comments are totalled apart from it', split.reactionsAnalyzed, 7_906);
check('press contributes no reaction count', split.sources[1].reactions, null);

// ---------------------------------------------------------------------------
// Retention splits the corpus — press is not on YouTube's clock
// ---------------------------------------------------------------------------

check('youtube is api-sourced', isApiSourcedOpinion('YouTube commentary'), true);
check('reddit would be too', isApiSourcedOpinion('Reddit'), true);
check('press is not', isApiSourcedOpinion('Press'), false);
check('forums are not', isApiSourcedOpinion('Forums'), false);

const purged = purgeApiSourcedOpinion(merged)!;
check('the YouTube source is purged', purged.sources.some((s) => s.source === 'YouTube'), false);
check('press survives the purge', purged.sources.some((s) => s.source === 'Press'), true);
check('and the total is recomputed', purged.itemsAnalyzed, 2);
check('YouTube leaves coveredPlatforms', purged.coveredPlatforms.includes('YouTube'), false);
check('Press stays', purged.coveredPlatforms.includes('Press'), true);
// A corpus with nothing web-sourced left has no press half to keep.
check(
  'a YouTube-only corpus purges to null',
  purgeApiSourcedOpinion(existing),
  null,
);
check('null in, null out', purgeApiSourcedOpinion(null), null);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
