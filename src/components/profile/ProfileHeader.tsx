import { BadgeCheck } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import type { Creator, SocialPlatform } from '@/types';
import { compactNumber, currency, shortDate } from '@/lib/format';

// Lucide dropped brand marks in v1, and a wrong-shaped logo reads worse than a
// word. The rail label carries the platform name instead.
const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function ProfileHeader({ creator }: { creator: Creator }) {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-7">
      <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-panel border border-line bg-surface">
        {creator.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary CDN hosts
          <img src={creator.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="tnum text-lg text-ink-faint">{initials(creator.displayName)}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-ink">
            {creator.displayName}
          </h1>
          {creator.isVerified ? (
            <Badge tone="emerald" icon={<BadgeCheck className="h-3.5 w-3.5" aria-hidden />}>
              Verified 1st-party data
            </Badge>
          ) : null}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-muted">
          <span className="tnum">@{creator.handle}</span>
          {creator.niche ? (
            <>
              <span className="text-ink-faint" aria-hidden>
                ·
              </span>
              <span>{creator.niche}</span>
            </>
          ) : null}
        </div>

        {creator.bio ? (
          <p className="mt-4 max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">
            {creator.bio}
          </p>
        ) : null}

        <dl className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <dt className="rail">Total audience</dt>
            <dd className="tnum mt-1.5 text-[19px] font-medium leading-none text-ink">
              {compactNumber(creator.totalFollowers)}
            </dd>
          </div>

          {creator.platforms.map((platform) => (
            <div key={platform.platform}>
              <dt className="rail">{PLATFORM_LABEL[platform.platform]}</dt>
              <dd className="tnum mt-1.5 text-[19px] font-medium leading-none text-ink">
                {compactNumber(platform.followerCount)}
              </dd>
            </div>
          ))}

          {creator.minimumBudget !== null ? (
            <div>
              <dt className="rail">Placement</dt>
              <dd className="tnum mt-1.5 text-[19px] font-medium leading-none text-ink">
                {currency(creator.minimumBudget)}
              </dd>
            </div>
          ) : null}

          <div>
            <dt className="rail">Last analysed</dt>
            <dd className="tnum mt-1.5 text-[19px] font-medium leading-none text-ink">
              {shortDate(creator.lastAnalyzedAt)}
            </dd>
          </div>
        </dl>
      </div>
    </header>
  );
}

/** The 2–3 unlocked chips: the entire public teaser. */
export function TeaserHighlights({ creator }: { creator: Creator }) {
  if (creator.teaserHighlights.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rail mr-1">AI signals</span>
      {creator.teaserHighlights.map((highlight) => (
        <Badge key={highlight.label} tone={highlight.tone}>
          {highlight.label}
        </Badge>
      ))}
    </div>
  );
}
