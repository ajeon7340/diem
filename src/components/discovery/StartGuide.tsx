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
    criteria: 'Give a topic or two — the words a viewer would type — and search.',
    similar: 'Paste a channel you already like. It is resolved and shown back before anything is searched for.',
    competitor: 'Name the brands you compete with. You confirm them before any search runs.',
  };

  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
      <h2 className="text-[15px] font-semibold text-ink">{DISCOVERY_MODES[mode].label}</h2>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-ink-muted">{hint[mode]}</p>
      <p className="mx-auto mt-4 max-w-[46ch] text-[12px] leading-relaxed text-ink-faint">
        Results appear here. Nothing is shown until a search has actually run.
      </p>
    </div>
  );
}
