import type { Demographics, DistributionBucket } from '@/types';
import { axisLabel, axisMax, percent, placeholderBars } from '@/lib/format';
import { LockedPanel } from './LockedPanel';
import { DemographicsRequest } from './DemographicsRequest';

const SECTIONS: { key: keyof Omit<Demographics, 'activeAudienceRate'>; label: string }[] = [
  { key: 'ageBands', label: 'Age' },
  { key: 'genderSplit', label: 'Gender' },
  { key: 'topCountries', label: 'Geography' },
];

/**
 * One distribution on its own axis.
 *
 * Per-section rather than per-panel: geography tops out at 41% and age at 47%,
 * so a shared axis would leave both columns half empty. The axis is set above
 * each section's peak, so the leader is long without being full, and the
 * maximum is printed beside the title — a bar without a stated scale is a
 * shape, not a measurement.
 */
function Distribution({ title, buckets }: { title: string; buckets: DistributionBucket[] }) {
  const peak = Math.max(...buckets.map((bucket) => bucket.share), 0.01);
  const max = axisMax(peak);

  return (
    <div className="px-5 py-4">
      <h3 className="rail">
        {title} · {axisLabel(max)}
      </h3>
      <ul className="mt-3 space-y-2.5">
        {buckets.map((bucket, index) => (
          <li key={`${bucket.label}-${index}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[12px] text-ink-muted">{bucket.label}</span>
              <span className="tnum shrink-0 text-[12px] text-ink">{percent(bucket.share, 0)}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-paper">
              <div
                className="h-full rounded-full bg-indigo"
                style={{ width: `${(bucket.share / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function placeholderDemographics(seed: string): Demographics {
  const toBuckets = (labels: string[], salt: string) =>
    placeholderBars(seed + salt, labels.length).map((share, index) => ({
      label: labels[index],
      share,
    }));

  return {
    ageBands: toBuckets(['18–24', '25–34', '35–44', '45+'], 'age'),
    genderSplit: toBuckets(['—', '—', '—'], 'gender'),
    topCountries: toBuckets(['—', '—', '—', '—', '—'], 'geo'),
    activeAudienceRate: 0,
  };
}

/**
 * All three dimensions in one block.
 *
 * These were briefly tabbed, on the grounds that three sets of bars at equal
 * weight read as noise. That was true when every bar was drawn against an
 * absolute 100% track; once each section scales to its own peak the three
 * columns are comparable at a glance, and hiding two-thirds of the audience
 * behind a click costs more than the height it saved.
 */
export function DemographicsPanel({
  demographics,
  locked,
  seed,
  awaitingGrant,
  creatorId,
  handle,
}: {
  demographics: Demographics | null;
  /** True when the visitor is not entitled to the report at all. */
  locked: boolean;
  seed: string;
  /**
   * Entitled to the report, but this creator has not approved this
   * organisation for their Authorized Data. A distinct state from "never
   * connected": one is a gap in the data, the other is a decision not yet
   * made, and showing the first when it is the second tells an agency the
   * creator has no analytics when in fact they do.
   */
  awaitingGrant?: boolean;
  creatorId?: string;
  handle?: string;
}) {
  const data = demographics ?? placeholderDemographics(seed);

  if (!locked && awaitingGrant && creatorId && handle) {
    return (
      <LockedPanel
        title="Audience demographics"
        meta="approval pending"
        locked={false}
        headline=""
        detail=""
      >
        <DemographicsRequest creatorId={creatorId} handle={handle} />
      </LockedPanel>
    );
  }

  // Unlocked but absent: the creator has not authorised analytics access.
  // Demographics are the one figure that cannot be derived from public data, so
  // this is a permanent gap until they connect, not something behind the glass.
  if (!locked && demographics === null) {
    return (
      <LockedPanel
        title="Audience demographics"
        meta="not connected"
        locked={false}
        headline=""
        detail=""
      >
        <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
          Age, gender and geography come from the creator&apos;s own platform analytics, which
          needs their authorisation. Nothing public substitutes for it.
        </p>
      </LockedPanel>
    );
  }

  return (
    <LockedPanel
      title="Audience demographics"
      meta={locked ? undefined : 'share of audience'}
      locked={locked}
      headline="1st-party demographics are locked"
      detail="Age, gender and geography straight from the creator's platform analytics — not estimated from a panel."
    >
      <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section, index) => (
          <div
            key={section.key}
            className={
              // Three into a two-column grid leaves the last one alone; let it
              // span so the row isn't half empty.
              index === 2 ? 'bg-surface sm:col-span-2 lg:col-span-1' : 'bg-surface'
            }
          >
            <Distribution title={section.label} buckets={data[section.key]} />
          </div>
        ))}
      </div>
    </LockedPanel>
  );
}
