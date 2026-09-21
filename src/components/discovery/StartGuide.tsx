import { DISCOVERY_MODES, type DiscoveryMode } from '@/lib/discovery/types';

/**
 * What the results column says before anything has been searched for.
 *
 * Short, and empty of results on purpose. A placeholder grid of fake creators
 * would fill the space and teach the customer to read invented figures as
 * measurements, which is the one habit this product cannot afford.
 */
export function StartGuide({ mode }: { mode: DiscoveryMode }) {
  const hint: Record<DiscoveryMode, string> = {
    criteria: 'Pick a category and search.',
    similar: 'Paste a channel you already like.',
    competitor: 'Name the brands you compete with.',
  };

  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
      <h2 className="text-[15px] font-semibold text-ink">{DISCOVERY_MODES[mode].label}</h2>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-ink-muted">{hint[mode]}</p>
    </div>
  );
}
