import Link from 'next/link';

import type { TrendingResult } from '@/lib/youtube/trending';
import { CATEGORIES, REGIONS } from '@/lib/youtube/trending';
import { Panel } from '@/components/ui/Panel';
import { compactNumber, shortDate } from '@/lib/format';
import { cn } from '@/lib/cn';

const fmt = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
    : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`;

/**
 * Content ideas — YouTube's trending chart, as a place to look.
 *
 * NOT A RECOMMENDATION, and the wording holds that line throughout. Nothing
 * here has been checked against this campaign: the chart is what a REGION is
 * watching, selected by YouTube on signals we cannot see and do not model.
 * Calling any of it "recommended for your campaign" would assert a relevance
 * nobody established.
 *
 * Three things are therefore always on screen — region, category, and when the
 * chart was read. A trending list without its scope is a claim about the world;
 * with it, it is a claim about one chart at one moment, which is all it is.
 *
 * The category filter is offered but never defaulted from a candidate's own
 * category. YouTube has fourteen assignable categories and files most creators
 * under People & Blogs, so a beauty campaign defaulted that way would be shown
 * vlogs and music videos and told they were its field.
 */
export function ContentIdeas({
  data,
  campaignId,
  readAt,
}: {
  data: TrendingResult | null;
  campaignId: string;
  /** When the chart was fetched. Required — see the note above. */
  readAt: string;
}) {
  const href = (region: string, cat: string | null) =>
    `/campaigns/${campaignId}?region=${region}${cat ? `&category=${cat}` : ''}`;

  if (!data) {
    return (
      <Panel title="Content ideas" meta="unavailable">
        <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
          YouTube&rsquo;s chart could not be read just now.
        </p>
      </Panel>
    );
  }

  const region = REGIONS.find((r) => r.code === data.regionCode)?.label ?? data.regionCode;
  const category = data.categoryId
    ? (CATEGORIES.find((c) => c.id === data.categoryId)?.label ?? data.categoryId)
    : 'All categories';

  return (
    <Panel title="Content ideas" meta={`${region} · ${category} · read ${shortDate(readAt)}`}>
      {/* The disclaimer is the first thing, not a footnote. A list of popular
          videos under a campaign heading reads as a suggestion unless it says
          otherwise before the reader gets to the rows. */}
      <p className="border-b border-line bg-paper px-5 py-2.5 text-[12px] leading-relaxed text-ink-muted">
        What <strong className="font-medium text-ink">{region}</strong> is watching right now, not
        what this campaign should make. Nothing here has been checked against your brief, your
        candidates, or your product — it is somewhere to look for a format, and the relevance
        judgement is yours.
      </p>

      <div className="flex flex-wrap gap-1 border-b border-line px-5 py-2.5">
        {REGIONS.map((r) => (
          <Link
            key={r.code}
            href={href(r.code, data.categoryId)}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-[12px] transition-colors',
              data.regionCode === r.code
                ? 'bg-indigo-wash font-medium text-indigo'
                : 'text-ink-muted hover:bg-paper hover:text-ink',
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line px-5 py-2.5">
        <Link
          href={href(data.regionCode, null)}
          className={cn(
            'rounded-md px-2.5 py-1.5 text-[12px] transition-colors',
            data.categoryId === null
              ? 'bg-indigo-wash font-medium text-indigo'
              : 'text-ink-muted hover:bg-paper hover:text-ink',
          )}
        >
          All categories
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.id}
            href={href(data.regionCode, c.id)}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-[12px] transition-colors',
              data.categoryId === c.id
                ? 'bg-indigo-wash font-medium text-indigo'
                : 'text-ink-muted hover:bg-paper hover:text-ink',
            )}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {data.thin ? (
        <p className="border-b border-line px-5 py-2 text-[11px] text-ink-faint">
          YouTube returned only {data.videos.length} for this category. Per-category charts are
          thinner than the main one; nothing is missing at our end.
        </p>
      ) : null}

      {data.videos.length === 0 ? (
        <p className="px-5 py-8 text-center text-[12px] text-ink-muted">
          YouTube publishes no chart for this combination.
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {data.videos.map((v, i) => (
            <li key={v.id} className="flex items-start gap-3 px-5 py-3">
              <span className="tnum w-5 shrink-0 pt-0.5 text-[12px] text-ink-faint">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <a
                  href={`https://www.youtube.com/watch?v=${v.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] leading-snug text-ink hover:text-indigo hover:underline"
                >
                  {v.title}
                </a>
                <p className="tnum mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
                  <span className="text-ink-muted">{v.channelTitle}</span>
                  <span aria-hidden>·</span>
                  <span>{compactNumber(v.views)} views</span>
                  <span aria-hidden>·</span>
                  <span>{fmt(v.durationSec)}</span>
                  <span aria-hidden>·</span>
                  <span>{shortDate(v.publishedAt)}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="border-t border-line px-5 py-2.5 text-[11px] leading-relaxed text-ink-faint">
        A high view count here is a fact about the channel&rsquo;s size as much as the video. Paste
        one into Reference analysis above to see how it did against its own channel — several chart
        entries sit below their own median.
      </p>
    </Panel>
  );
}
