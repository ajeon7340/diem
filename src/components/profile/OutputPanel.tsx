import type { PlatformOutput, SocialPlatform } from '@/types';
import { compactNumber, currency, exactNumber, percent } from '@/lib/format';
import { LockedPanel } from './LockedPanel';
import { cn } from '@/lib/cn';

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
};

/**
 * The per-platform commercial figures, absorbed from what used to be a
 * separate "Platform analysis" panel.
 *
 * That panel existed to answer "which surface do I buy?", and on a
 * single-platform creator it had no question to answer — it rendered a table
 * of one under a note admitting there was no allocation decision to make. The
 * figures are still worth showing; they just belong beside the output they are
 * derived from rather than in a panel of their own. The print route has read
 * them this way since it was written.
 *
 * Two or more platforms and the cards sit side by side, so the comparison is
 * stronger than before: reach, engagement and cost line up in one grid instead
 * of being split across two panels a scroll apart.
 */
export interface PlatformCommercial {
  platform: SocialPlatform;
  followers: number;
  purchaseIntentRate: number | null;
  sponsoredRetention: number | null;
  estimatedCpm: number | null;
}

const PLACEHOLDER: PlatformOutput[] = [
  {
    platform: 'youtube',
    unit: 'videos',
    totalPosts: 0,
    postsInWindow: 0,
    windowDays: 90,
    cadencePerWeek: 0,
    avgViews: 0,
    medianViews: 0,
    peakViews: 0,
    avgLikes: 0,
    peakLikes: 0,
    avgComments: 0,
    engagementRate: 0,
  },
  {
    platform: 'instagram',
    unit: 'posts',
    totalPosts: 0,
    postsInWindow: 0,
    windowDays: 90,
    cadencePerWeek: 0,
    avgViews: 0,
    medianViews: 0,
    peakViews: 0,
    avgLikes: 0,
    peakLikes: 0,
    avgComments: 0,
    engagementRate: 0,
  },
];

/**
 * One figure, label above value.
 *
 * Was a full-width row with `justify-between`, which on a panel this wide
 * pinned the label to the far left and the number to the far right with a
 * canyon between them — twelve of those and the eye has to traverse the whole
 * panel for every reading, and nothing lines up with anything. Stacked pairs
 * in a grid put the label against its own number and let twelve figures be
 * scanned in three rows instead of twelve.
 */
function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] leading-tight text-ink-muted">{label}</div>
      <div
        className={cn(
          'tnum mt-0.5 truncate text-[13px] leading-tight',
          strong ? 'font-medium text-ink' : 'text-ink',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Publishing volume and engagement, per platform.
 *
 * This replaced a lone "68% active" figure in the demographics header, which
 * told a buyer nothing they could plan around. Cadence sizes the flight; the
 * spread between median and peak says whether a good post is a floor or a
 * fluke, which is the difference between a predictable buy and a lottery
 * ticket. Both are stated plainly rather than averaged into a score.
 */
export function OutputPanel({
  output,
  commercial,
  locked,
}: {
  output: PlatformOutput[];
  /** Per-platform commercial figures, joined on `platform`. */
  commercial: PlatformCommercial[];
  locked: boolean;
}) {
  const data = locked || output.length === 0 ? PLACEHOLDER : output;

  if (!locked && output.length === 0) {
    return (
      <LockedPanel title="Output &amp; engagement" locked={false} headline="" detail="" meta="no data">
        <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
          No synced platforms yet.
        </p>
      </LockedPanel>
    );
  }

  const single = !locked && output.length === 1;
  const window = data[0]?.windowDays ?? 90;

  return (
    <LockedPanel
      title="Output &amp; engagement"
      meta={locked ? undefined : `last ${window}d`}
      locked={locked}
      headline="Publishing volume is locked"
      detail="Post counts, cadence, and average and peak views, likes and comments for each connected account."
    >
      <div className={cn('grid gap-px bg-line', !single && 'sm:grid-cols-2')}>
        {data.map((platform) => {
          // A peak far above the median is upside; close to it is consistency.
          const spread =
            platform.medianViews > 0 ? platform.peakViews / platform.medianViews : 0;
          const money = locked
            ? null
            : (commercial.find((c) => c.platform === platform.platform) ?? null);

          return (
            <div key={platform.platform} className="bg-surface px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[14px] font-medium text-ink">
                  {PLATFORM_LABEL[platform.platform]}
                </h3>
                <span className="tnum text-[11px] text-ink-faint">
                  {locked
                    ? '—'
                    : `${platform.cadencePerWeek.toFixed(1)} ${platform.unit}/week`}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-3 sm:grid-cols-3">
                <Stat
                  label="Followers"
                  value={locked || !money ? '—' : compactNumber(money.followers)}
                  strong
                />
                <Stat
                  label={`Total ${platform.unit}`}
                  value={locked ? '—' : exactNumber(platform.totalPosts)}
                  strong
                />
                <Stat
                  label={`In window`}
                  value={locked ? '—' : `${platform.postsInWindow} / ${platform.windowDays}d`}
                />
                <Stat
                  label="Avg views"
                  value={locked ? '—' : compactNumber(platform.avgViews)}
                  strong
                />
                <Stat
                  label="Median views"
                  value={locked ? '—' : compactNumber(platform.medianViews)}
                />
                <Stat
                  label="Peak views"
                  value={
                    locked
                      ? '—'
                      : `${compactNumber(platform.peakViews)}${spread ? ` · ${spread.toFixed(1)}×` : ''}`
                  }
                />
                <Stat
                  label="Avg likes"
                  value={locked || platform.avgLikes === null ? '—' : compactNumber(platform.avgLikes)}
                />
                <Stat
                  label="Peak likes"
                  value={
                    locked || platform.peakLikes === null ? '—' : compactNumber(platform.peakLikes)
                  }
                />
                <Stat
                  label="Avg comments"
                  value={
                    locked || platform.avgComments === null
                      ? '—'
                      : exactNumber(Math.round(platform.avgComments))
                  }
                />
                <Stat
                  label="Engagement rate"
                  value={
                    locked || platform.engagementRate === null
                      ? '—'
                      : percent(platform.engagementRate, 2)
                  }
                  strong
                />
              </div>

              {/* Derived, not measured. Kept visually separate from the counts
                  above so a reader can tell a figure YouTube reported from one
                  this product computed — the CPM in particular is a
                  third-party projection, not a rate card. */}
              {money ? (
                <>
                  <p className="rail mt-3.5">Commercial, this platform</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-3 sm:grid-cols-3">
                    <Stat
                      label="Purchase intent"
                      value={
                        money.purchaseIntentRate === null
                          ? '—'
                          : percent(money.purchaseIntentRate)
                      }
                    />
                    <Stat
                      label="Estimated CPM"
                      value={
                        money.estimatedCpm === null
                          ? '—'
                          : currency(Math.round(money.estimatedCpm))
                      }
                    />
                    <Stat
                      label="Sponsored retention"
                      value={
                        money.sponsoredRetention === null
                          ? '—'
                          : percent(money.sponsoredRetention, 0)
                      }
                    />
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </LockedPanel>
  );
}
