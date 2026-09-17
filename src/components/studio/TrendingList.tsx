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
 * YouTube's own trending chart, filtered.
 *
 * The filters are links rather than a client component: the whole page is
 * server-rendered and each combination is cached for fifteen minutes, so
 * switching category costs one quota unit at most and usually zero.
 *
 * The category picker does NOT default to the creator's own `categoryId`, even
 * though that is the obvious behaviour. YouTube has fourteen assignable
 * categories and files most creators under People & Blogs — a K-beauty channel
 * lands there beside every vlog on the platform, and that chart returns five
 * rows where the uncategorised one returns twelve. Defaulting to it would show
 * a beauty creator a music video and a restaurant tour. The niche a creator
 * chose at onboarding is the better idea and needs search, which costs 100
 * units a call.
 */
export function TrendingList({
  data,
  niche,
}: {
  data: TrendingResult;
  /** What the creator said they do. Shown because the categories cannot say it. */
  niche: string | null;
}) {
  const href = (region: string, cat: string | null) =>
    `/dashboard/studio?region=${region}${cat ? `&category=${cat}` : ''}`;

  return (
    <Panel
      title="Trending now"
      meta={`${data.videos.length} on YouTube’s chart · ${data.units} unit`}
    >
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

      {niche ? (
        <p className="border-b border-line bg-paper px-5 py-2 text-[11px] leading-relaxed text-ink-muted">
          You publish in <strong className="font-medium text-ink">{niche}</strong>. YouTube has no
          category that narrow — its fourteen are the whole vocabulary — so read this as what the
          region is watching, not as your competitive set.
        </p>
      ) : null}

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
        one into the box above to see how it did against its own channel — several chart entries
        sit below their own median.
      </p>
    </Panel>
  );
}
