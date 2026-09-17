import type { Promotion, PromotionDisclosure } from '@/types';
import { compactNumber, percent, shortDate } from '@/lib/format';
import { EvidenceLink } from './EvidenceLink';
import { LockedPanel } from './LockedPanel';

const PLACEHOLDER: Promotion[] = [
  {
    postId: 'p1', platform: 'youtube', title: '████████ ███ █████ █████', url: null,
    publishedAt: '', brand: '██████', product: '████ ████', category: '█████ ██████',
    disclosure: 'explicit', views: null, sponsoredRetention: null,
  },
  {
    postId: 'p2', platform: 'youtube', title: '█████ ██████████ ███', url: null,
    publishedAt: '', brand: '█████', product: '██████', category: '█████',
    disclosure: 'explicit', views: null, sponsoredRetention: null,
  },
  {
    postId: 'p3', platform: 'instagram', title: '███████ ████', url: null,
    publishedAt: '', brand: '████████', product: '██ ███', category: '█████ ██████',
    disclosure: 'affiliate', views: null, sponsoredRetention: null,
  },
];

/**
 * How we know a post was a promotion, said out loud.
 *
 * `inferred` is the one that matters. A model deciding a post looked sponsored
 * is a guess, and a guess rendered identically to a disclosed placement will
 * eventually tell a brand their competitor ran a campaign that never ran. The
 * label carries the difference; it is not decoration.
 */
const DISCLOSURE: Record<PromotionDisclosure, { label: string; title: string; tone: string }> = {
  explicit: {
    label: 'disclosed',
    title: 'Labelled as paid by the creator — #ad, a paid-promotion flag, or a spoken disclosure.',
    tone: 'text-emerald',
  },
  affiliate: {
    label: 'affiliate',
    title: 'An affiliate or tracked link in the description. Commercial, but not disclosed as paid.',
    tone: 'text-ink-muted',
  },
  inferred: {
    label: 'inferred',
    title: 'Not labelled. Our classifier read this as a promotion — treat it as a guess, not a disclosure.',
    tone: 'text-amber',
  },
};

/**
 * What this creator has actually sold, and for whom.
 *
 * Replaced the category-exposure panel, which counted sponsored posts per
 * category and never showed one. A buyer wants the post, not the tally.
 */
export function PromotionsPanel({
  promotions,
  locked,
}: {
  promotions: Promotion[];
  locked: boolean;
}) {
  const data = locked || promotions.length === 0 ? PLACEHOLDER : promotions;

  // Never sponsored is a finding, not an empty state — it is the whole reason
  // adFatigueLevel and sponsoredPerformance are null on this creator, and
  // saying so here stops those nulls reading as missing data.
  if (!locked && promotions.length === 0) {
    return (
      <LockedPanel title="Past promotions" locked={false} headline="" detail="" meta="none found">
        <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
          No sponsored or affiliate posts found in the analysed window. Nothing here has been
          tested commercially, which is why there is no ad-fatigue read and no paid baseline.
        </p>
      </LockedPanel>
    );
  }

  const disclosed = promotions.filter((p) => p.disclosure === 'explicit').length;

  return (
    <LockedPanel
      title="Past promotions"
      meta={locked ? undefined : `${promotions.length} ${promotions.length === 1 ? 'post' : 'posts'} · ${disclosed} disclosed`}
      locked={locked}
      headline="Sponsorship history is locked"
      detail="Every past promotion with the brand, the product and how the post performed against their organic median."
    >
      <ul className="divide-y divide-line">
        {data.map((promo) => {
          const disclosure = DISCLOSURE[promo.disclosure];
          return (
            <li key={promo.postId} className="px-5 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[13px] text-ink">
                  {/* Null is "clearly an ad, advertiser unidentifiable" — a real
                      finding. A blank cell would read as a data error. */}
                  {promo.brand ?? <span className="text-ink-faint">Unidentified brand</span>}
                  {promo.product ? (
                    <span className="text-ink-muted"> · {promo.product}</span>
                  ) : null}
                </span>
                <span
                  className={`text-[11px] ${locked ? 'text-ink-faint' : disclosure.tone}`}
                  title={locked ? undefined : disclosure.title}
                >
                  {locked ? '—' : disclosure.label}
                </span>
              </div>

              <div className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                {locked ? (
                  promo.title
                ) : (
                  <EvidenceLink url={promo.url} label={promo.title} />
                )}
              </div>

              <div className="tnum mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                <span>{locked ? '—' : shortDate(promo.publishedAt)}</span>
                <span>{promo.category ?? 'Uncategorised'}</span>
                {!locked && promo.views !== null ? (
                  <span>{compactNumber(promo.views)} views</span>
                ) : null}
                {!locked && promo.sponsoredRetention !== null ? (
                  // Against the creator's organic median, so 100% means a paid
                  // post that held its audience. Stated as a share rather than
                  // a verdict — the number is the read.
                  <span
                    className={promo.sponsoredRetention >= 0.9 ? 'text-emerald' : 'text-amber'}
                    title="Views on this post against the creator's organic median."
                  >
                    {percent(promo.sponsoredRetention, 0)} retention
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </LockedPanel>
  );
}
