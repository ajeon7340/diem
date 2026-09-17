'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

import {
  COVERABLE_OPINION_PLATFORMS,
  SEARCH_NOT_CENSUS_NOTE,
  UNCOVERABLE_NOTE,
  toOpinionPlatform,
  platformCoverage,
  type OpinionPlatform,
  type OpinionItem,
  type OpinionSource,
  type OpinionTheme,
} from '@/types';

/**
 * Only what this panel draws. Narrowed deliberately: the full `PublicOpinion`
 * carries controversy records and a narrative summary that are no longer
 * rendered, and a client component's props are serialised into the payload
 * whether it uses them or not.
 */
export interface OpinionView {
  /**
   * How the corpus was assembled, when that shapes the result.
   *
   * A set gathered by searching is selected before anything is measured of it.
   * Stating the method is the only honest way to publish a figure drawn from
   * one, and the reason this panel publishes counts rather than scores.
   */
  corpusNote: string | null;
  coveredPlatforms: OpinionPlatform[];
  windowDays: number;
  itemsAnalyzed: number;
  reactionsAnalyzed: number | null;
  items: OpinionItem[];
  selection: PublicOpinionSelection;
  discussionShare: number;
  sources: OpinionSource[];
  themes: OpinionTheme[];
}
import {
  compactNumber,
  exactNumber,
  percent,
  shortDate,
} from '@/lib/format';
import { opinionConcentration } from '@/lib/opinion/press';

type PublicOpinionSelection = {
  surfaced: number | null;
  read: number;
  rule: string | null;
} | null;
import { EvidenceLink } from './EvidenceLink';
import { LockedPanel } from './LockedPanel';
import { cn } from '@/lib/cn';

/** The consolidated tab. Not a platform name, so it cannot collide with one. */
const ALL = 'Overall';

/**
 * Why no sentiment score. Rendered on every unlocked view, not only where a
 * `corpusNote` exists, because the absence of a number is itself a claim and
 * has to survive a screenshot.
 */
const METHOD_NOTE =
  'Volume and themes only, no sentiment score. An off-platform set is assembled by searching, and a search selects for whoever had a reason to post — scoring its sentiment measures the query rather than the opinion. For how an audience feels, read the creator’s own comment corpus above: that one is a census, not a search.';

const PLACEHOLDER: OpinionView = {
  corpusNote: null,
  coveredPlatforms: [],
  windowDays: 90,
  itemsAnalyzed: 0,
  reactionsAnalyzed: null,
  items: [],
  selection: null,
  discussionShare: 0.4,
  sources: [
    { source: '██████', items: 0, reactions: null },
    { source: '█', items: 0, reactions: null },
    { source: '██████', items: 0, reactions: null },
  ],
  themes: [
    { label: '█████ ██ █ ███████████ ████████', share: 0.38, reactionCount: 0, itemCount: null, example: '', mentions: [] },
    { label: '███████ ██████████ ███████', share: 0.27, reactionCount: 0, itemCount: null, example: '', mentions: [] },
    { label: '███████████ ██████ █████████', share: 0.19, reactionCount: 0, itemCount: null, example: '', mentions: [] },
  ],
};

/**
 * Off-platform discussion (여론) — the only third-party signal in the report.
 *
 * Every other panel reads 1st-party data from surfaces the creator owns and
 * moderates. That is a structural blind spot: a warm comment section says
 * nothing about whether the wider internet is arguing about them. This reads
 * the outside conversation instead, and is labelled as third-party throughout
 * so the provenance distinction survives contact with a screenshot.
 *
 * It reports how much is being said, where, and about what — and deliberately
 * not how positive it is. See the note on `PublicOpinion` in src/types for why
 * a sentiment average over a searched corpus is unrecoverable.
 */
export function PublicOpinionPanel({
  opinion,
  locked,
}: {
  opinion: OpinionView | null;
  locked: boolean;
}) {
  // Declared before the early return — hook order must not depend on the data.
  const [source, setSource] = useState<string>(ALL);

  if (!locked && !opinion) {
    return (
      <LockedPanel
        title="Off-platform discussion"
        locked={false}
        headline=""
        detail=""
        meta="not yet run"
      >
        <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
          The off-platform pass has not run for this creator yet.
        </p>
      </LockedPanel>
    );
  }

  const data = opinion ?? PLACEHOLDER;
  const active = locked ? ALL : source;

  // Every monitored platform gets a tab whether or not it turned anything up.
  // Built from the fixed list, not from the results, so "nothing on Instagram"
  // is visible rather than absent.
  const perPlatform = new Map<OpinionPlatform, number>();
  for (const src of data.sources) {
    const key = toOpinionPlatform(src.source);
    perPlatform.set(key, (perPlatform.get(key) ?? 0) + src.items);
  }

  // Filtering narrows the evidence, never the theme's measured count — a theme
  // carries the mentions it carries whether or not the active tab holds a
  // sample of them.
  const themes = data.themes
    .map((theme) => ({
      ...theme,
      shown:
        active === ALL
          ? theme.mentions
          : theme.mentions.filter((m) => toOpinionPlatform(m.source) === active),
    }))
    .filter((theme) => active === ALL || theme.shown.length > 0);

  const activeMentions = active === ALL ? null : perPlatform.get(active as OpinionPlatform);
  const covered = new Set<string>(data.coveredPlatforms);
  const isCovered = (name: string) => covered.has(name);
  const concentration = opinionConcentration(data.items);
  const coverageOf = (name: string) =>
    platformCoverage(name as OpinionPlatform, data.coveredPlatforms);

  return (
    <LockedPanel
      title="Off-platform discussion"
      meta={
        locked
          ? undefined
          : `third-party · searched, not counted · ${data.windowDays}d`
      }
      locked={locked}
      headline="Off-platform discussion is locked"
      detail="What a search of the open web surfaces about this creator, and how that search was run — outside the comment sections they moderate."
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 border-b border-line px-5 py-4">
        {/* This count used to sit here at 26px under the word "Mentions" —
            the visual grammar of a measurement. It is not one. Seven is what
            one search surfaced, not what exists: there are certainly more
            videos than seven, and no query can enumerate them. Rendered large
            and bare, "7 · last 460d" reads as "almost nobody discusses her",
            which is a conclusion this panel has no basis to offer.

            So the number is demoted to a description of the pass, and the
            method sits beside it at the same weight. What the panel CAN say —
            themes, controversies, linked evidence — keeps its prominence
            below. */}
        <div className="min-w-[132px]">
          <div className="rail">This pass read</div>
          <p className="tnum mt-2 text-[13px] leading-relaxed text-ink">
            {locked
              ? '—'
              : `${exactNumber(data.itemsAnalyzed)} ${data.itemsAnalyzed === 1 ? 'piece' : 'pieces'}`}
            {!locked && data.reactionsAnalyzed !== null ? (
              <span className="text-ink-muted">
                {' '}
                · {exactNumber(data.reactionsAnalyzed)} comments beneath them
                {/* Named against its own denominator. "91%" beside "7 pieces"
                    invited reading it as 91% of seven. It is also a weak
                    signal — commentary about someone has comment sections
                    about them, so this mostly says the search found the right
                    videos. */}
                <span className="text-ink-faint">
                  , {percent(data.discussionShare, 0)} of them about her
                </span>
              </span>
            ) : null}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            {locked
              ? '—'
              : `across ${data.coveredPlatforms.length || 0} platform${data.coveredPlatforms.length === 1 ? '' : 's'} · last ${data.windowDays}d`}
          </p>
        </div>

        <div className="min-w-[132px]">
          <div className="rail">How it was chosen</div>
          <p className="tnum mt-2 text-[13px] leading-relaxed text-ink">
            {locked
              ? '—'
              : data.selection
                ? `${exactNumber(data.selection.read)} of ${
                    data.selection.surfaced !== null
                      ? exactNumber(data.selection.surfaced)
                      : 'an unrecorded number'
                  } found`
                : 'Not recorded'}
          </p>
          {/* Without the rule, the count carries no information: a different
              rule would have returned a different seven and nothing on this
              page would look any different. That is the difference between a
              sample and an anecdote, and it has to be visible. */}
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            {locked
              ? '—'
              : (data.selection?.rule ??
                'This pass did not record how many pieces the search found, or why these ones were kept. Treat the count as an anecdote rather than a sample.')}
          </p>
        </div>

        <div className="min-w-[168px] flex-1">
          <div className="rail">By source · pieces read</div>
          <ul className="mt-2.5 space-y-1.5">
            {data.sources.map((src) => (
              <li key={src.source} className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-ink-muted">{src.source}</span>
                <span className="tnum text-[12px] text-ink">
                  {locked ? (
                    '—'
                  ) : (
                    <>
                      {exactNumber(src.items)}
                      {/* Reactions never join the item count. Seven videos and
                          twenty-three articles are comparable; seven thousand
                          comments and twenty-three articles are not. */}
                      {src.reactions !== null ? (
                        <span className="text-ink-faint">
                          {' '}
                          · {exactNumber(src.reactions)} comments
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {!locked ? (
        <div
          role="tablist"
          aria-label="Filter by platform"
          className="flex flex-wrap gap-1 border-t border-line px-5 py-2.5"
        >
          {([ALL, ...COVERABLE_OPINION_PLATFORMS] as const).map((name) => {
            const mentions = name === ALL ? null : perPlatform.get(name as OpinionPlatform);
            const searched = name === ALL || isCovered(name);
            const empty = name !== ALL && mentions === undefined;

            return (
              <button
                key={name}
                role="tab"
                type="button"
                aria-selected={active === name}
                onClick={() => setSource(name)}
                className={cn(
                  'inline-flex items-baseline gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40',
                  active === name
                    ? 'bg-indigo-wash font-medium text-indigo'
                    : !searched
                      ? 'text-ink-faint hover:bg-paper line-through decoration-line-strong'
                      : empty
                        ? 'text-ink-faint hover:bg-paper'
                        : 'text-ink-muted hover:bg-paper hover:text-ink',
                )}
              >
                {name}
                {mentions !== null && mentions !== undefined ? (
                  <span className="tnum text-[10px] opacity-70">{compactNumber(mentions)}</span>
                ) : name === ALL ? null : searched ? (
                  <span className="tnum text-[10px] opacity-50">0</span>
                ) : (
                  // Not searched. A dash, never a zero — a zero is a finding.
                  <span className="tnum text-[10px] opacity-40">—</span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      {!locked && active !== ALL && themes.length === 0 ? (
        <p className="border-t border-line px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
          {/* Three states, not two. "Never checked" and "cannot be checked"
              were rendering identically, which implied a pass that is coming
              for platforms whose terms forbid this outright. */}
          {coverageOf(active) === 'covered'
            ? `No discussion found on ${active} in the last ${data.windowDays} days. The pass read it — there was nothing there.`
            : coverageOf(active) === 'not_permitted'
              ? `We cannot report what ${active} users say about a creator — its terms do not permit commercialising other people's posts. That is a licensing limit rather than a gap being worked through, so nothing will ever appear here for ${active}. It says nothing about the creator, and nothing about whether discussion exists there.`
              : `${active} was not read by this pass, so nothing is claimed either way. A zero here would be a finding, and there isn't one.`}
        </p>
      ) : (
      <div className="px-5 py-4">
        <h3 className="rail">
          {/* "Share of all mentions" was the claim that could not be supported:
              "all mentions" names a denominator this corpus does not have,
              because the corpus is a search result rather than a census. Counts
              out of the set that was actually read survive the selection; a
              percentage of "the discussion" does not. See OpinionTheme. */}
          {active === ALL ? (
            <>
              What the discussion is about · across {exactNumber(data.itemsAnalyzed)}{' '}
              {data.itemsAnalyzed === 1 ? 'piece' : 'pieces'}
            </>
          ) : (
            <>
              On {active} · of{' '}
              {activeMentions !== undefined && activeMentions !== null
                ? exactNumber(activeMentions)
                : '0'}{' '}
              mentions read
            </>
          )}
        </h3>
        <ul className="mt-3 space-y-3">
          {themes.map((theme) => {
            // One sample per theme, shown outright. These used to sit behind a
            // disclosure: a quoted line is the whole reason to trust a theme
            // label, and making it a click meant most readers never saw the
            // evidence for any of them. It carries more weight now that no
            // score accompanies the label — the quote is the characterisation.
            const sample = locked ? null : theme.shown[0];

            return (
              <li key={theme.label}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[13px] text-ink">{theme.label}</span>
                  {/* -1 is "not recorded", from a row written before the count
                      replaced the share. Back-computing it from the share would
                      reintroduce the number this change exists to remove. */}
                  {/* Item count first where we have it: "5 of 7 videos" says
                      more than "4,111 comments", because the 4,111 could all
                      sit under one of them. */}
                  <span className="tnum text-[12px] text-ink">
                    {locked
                      ? '—'
                      : theme.itemCount !== null
                        ? `${exactNumber(theme.itemCount)} of ${exactNumber(data.itemsAnalyzed)}`
                        : theme.reactionCount >= 0
                          ? `${exactNumber(theme.reactionCount)} comments`
                          : '—'}
                  </span>
                </div>

                {sample ? (
                  <div className="mt-2 border-l-2 border-line pl-3">
                    {/* Null excerpt = past the 30-day cap on holding YouTube
                        comment text. The thread link survives it. */}
                    {sample.excerpt === null ? (
                      <p className="text-[11px] leading-relaxed text-ink-faint">
                        Excerpt not stored — past the 30-day limit on holding YouTube comment text.
                      </p>
                    ) : (
                      <p className="text-[11px] italic leading-relaxed text-ink-muted">
                        “{sample.excerpt}”
                      </p>
                    )}
                    <p className="tnum mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-ink-faint">
                      <span>{sample.source}</span>
                      {sample.engagement !== null ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>{compactNumber(sample.engagement)}</span>
                        </>
                      ) : null}
                      {sample.publishedAt !== null ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>{shortDate(sample.publishedAt)}</span>
                        </>
                      ) : null}
                      <span aria-hidden>·</span>
                      <EvidenceLink url={sample.url} label="thread" className="text-[10px]" />
                    </p>
                  </div>
                ) : !locked && theme.example ? (
                  <p className="mt-2 border-l-2 border-line pl-3 text-[11px] italic leading-relaxed text-ink-faint">
                    {theme.example}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      )}

      {!locked ? (
        <p className="border-t border-line px-5 py-2.5 text-[11px] leading-relaxed text-ink-faint">
          {METHOD_NOTE}
        </p>
      ) : null}

      {/* Narrowing the tabs to what we can read must not narrow what we admit
          we cannot. Four of the busiest surfaces on the internet are missing
          here by licensing rather than by absence, and a buyer has no way to
          know that from a clean-looking panel. */}
      {!locked ? (
        <p className="border-b border-line bg-paper px-5 py-2.5 text-[11px] leading-relaxed text-ink-muted">
          {SEARCH_NOT_CENSUS_NOTE}
        </p>
      ) : null}

      {/* The pieces themselves. An aggregate without its distribution says
          seven sources are discussing a creator when six thousand of the seven
          thousand comments may sit under one of them — a different fact, and
          the one a buyer is actually asking about. */}
      {!locked && data.items.length > 0 ? (
        <div className="border-t border-line px-5 py-3">
          <h3 className="rail">
            What was read
            {concentration
              ? ` · ${percent(concentration.largestShare, 0)} of it under one piece`
              : ''}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {[...data.items]
              .sort((a, b) => (b.reactions ?? -1) - (a.reactions ?? -1))
              .slice(0, 12)
              .map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">
                    <EvidenceLink url={item.url} label={item.title} />
                    {item.publisher ? (
                      <span className="text-ink-faint"> · {item.publisher}</span>
                    ) : null}
                  </span>
                  <span className="tnum shrink-0 text-[11px] text-ink-faint">
                    {item.reactions === null
                      ? item.source
                      : `${exactNumber(item.reactions)} comments`}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {/* Recorded as a count but not individually. Stated, because a tidy
          aggregate over an unrecorded distribution is a claim about balance
          that no pass actually made. */}
      {!locked && data.items.length === 0 && data.itemsAnalyzed > 0 ? (
        <p className="border-t border-line px-5 py-2.5 text-[11px] leading-relaxed text-ink-muted">
          This pass counted {exactNumber(data.itemsAnalyzed)}{' '}
          {data.itemsAnalyzed === 1 ? 'piece' : 'pieces'} of discussion but did not record them
          individually
          {data.reactionsAnalyzed !== null
            ? `, so the ${exactNumber(data.reactionsAnalyzed)} comments beneath them cannot be attributed — they could sit under one piece or spread across all ${exactNumber(data.itemsAnalyzed)}`
            : ''}
          .
        </p>
      ) : null}

      {!locked ? (
        <p className="border-t border-line px-5 py-2.5 text-[10px] leading-relaxed text-ink-faint">
          {UNCOVERABLE_NOTE}
        </p>
      ) : null}

      {!locked && data.corpusNote ? (
        <p className="flex items-start gap-2 border-t border-line bg-amber-wash px-5 py-2.5 text-[11px] leading-relaxed text-ink-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden />
          <span>
            <strong className="font-medium text-ink">How this sample was gathered:</strong>{' '}
            {data.corpusNote}
          </span>
        </p>
      ) : null}

    </LockedPanel>
  );
}
