import type { AIReport, BrandSafetyFlag, FlagBasis, RiskSeverity } from '@/types';
import { BRAND_RISK_LABEL } from '@/types';
import { exactNumber } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { percent } from '@/lib/format';
import { audienceTone, cappedSeverity, censusRisk, isMaterial } from '@/lib/report/safety';
import { LockedPanel } from './LockedPanel';

const SEVERITY_TONE: Record<RiskSeverity, 'emerald' | 'slate' | 'amber' | 'rose'> = {
  none: 'emerald',
  low: 'slate',
  medium: 'amber',
  high: 'rose',
};

const SEVERITY_ORDER: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2, none: 3 };

/**
 * What each percentage is a share OF.
 *
 * Printed beside every figure, because the panel used to put "1.3%" and "22%"
 * in one column when the first was a share of comments and the second a share
 * of sponsored posts. A reader comparing them down the column was comparing
 * nothing, and the brand-safety score that was meant to combine them could not
 * be written at all. Naming the denominator is what makes both readable.
 */
const BASIS_LABEL: Record<FlagBasis, string> = {
  comments: 'of comments',
  posts: 'of posts',
  sponsored_posts: 'of sponsored posts',
};

const PLACEHOLDER_FLAGS: BrandSafetyFlag[] = [
  { category: '█████████', severity: 'low', incidence: 0.01, basis: 'comments', endorsement: null, note: '████ ███████ ██ █████████.' },
  { category: '████████ ███████', severity: 'none', incidence: 0, basis: 'posts', endorsement: null, note: '██ ███████ ██ ██████.' },
  { category: '██████████ ████████', severity: 'medium', incidence: 0.2, basis: 'sponsored_posts', endorsement: null, note: '████ █ ██████████ ███.' },
];

/**
 * Named risk flags only.
 *
 * The composite score used to headline this panel with a gauge — but it also
 * appears in the verdict strip, and a number out of 100 is not something a
 * marketer can act on anyway. What survives is the part that changes a
 * contract: which risks were checked, how severe each is, and what was found.
 * An engagement-rate stat also used to sit here; it is a commercial metric, not
 * a risk one, and now lives with the cost figures.
 */
export function BrandSafetyPanel({ report }: { report: AIReport | null }) {
  const locked = report === null;

  const climate = locked ? null : report.climate;
  const census = locked
    ? null
    : censusRisk(report.commentRisks, report.moderation, report.commentsAnalyzed);

  // Flags are derived from the comment corpus. With none, the creator is not
  // safe and not unsafe — they are unassessed, and saying "nothing raised"
  // would imply a clean check that never ran.
  // "Assessed" is now whether checks ran, not whether a score exists. Zero
  // flags on zero checks is not a clean result, and with the composite gone
  // the panel has to carry that distinction itself.
  //
  // THE CENSUS COUNTS AS CHECKS. This bailed on `brandSafetyFlags.length === 0`
  // alone, which is the shape a creator has when the risk scan is the only pass
  // that has run — so @가재맨, with 2,392 comments read and 180 findings across
  // five categories, rendered "Brand safety · not assessed · nothing to assess".
  // Same defect as the one in deriveBrandSafety, one layer up, and fixing only
  // the derivation would have left the panel still hiding its own evidence.
  if (!locked && report.brandSafetyFlags.length === 0 && (!census || census.scanned === 0)) {
    return (
      <LockedPanel title="Brand safety" meta="not assessed" locked={false} headline="" detail="">
        <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
          Brand safety is read from the comment corpus. With no readable comments there is nothing
          to assess — this is not a clean result.
        </p>
      </LockedPanel>
    );
  }
  // Placeholder flags exist to give the LOCKED panel something to blur. A
  // census-only creator is not locked and has genuinely run no flag pass, so
  // filling their panel with placeholders would invent four checks.
  const flags = locked ? PLACEHOLDER_FLAGS : report.brandSafetyFlags;
  // The capped severity throughout — a rating its own incidence cannot
  // support must not sort, count or colour as though it could.
  const sorted = [...flags].sort(
    (a, b) => SEVERITY_ORDER[cappedSeverity(a)] - SEVERITY_ORDER[cappedSeverity(b)],
  );
  const raised = sorted.filter((flag) => cappedSeverity(flag) !== 'none').length;

  // Census-based, so a share is honest here — see audienceTone. It sits above
  // the named flags because it is the scale they are read against: "medium
  // authenticity scrutiny" means something different in a section that is 3%
  // critical than in one that is 30%, and nothing on this panel used to say
  // which.
  const tone = locked ? null : audienceTone(report.commentAxes);
  const risk = census;

  return (
    <LockedPanel
      title="Brand safety"
      meta={
        locked
          ? undefined
          : flags.length === 0
            ? 'risk census only'
            : `${raised === 0 ? 'nothing raised' : `${raised} raised`} · ${flags.length} checked`
      }
      locked={locked}
      headline="Brand safety detail is locked"
      detail="A named risk breakdown — profanity, controversy, disclosure, competitor conflict — each with severity and incidence."
    >
      {/* The read, before the evidence for it.
          A buyer opening this panel wants to know what kind of room it is; the
          categories below answer what is in it, which is the second question.
          The sentence is generated from the figures rather than written by a
          model, so it cannot drift from the numbers under it and needs no API
          key to render — the opposite trade from the fit read, deliberately. */}
      {climate && climate.label !== null ? (
        <div className="border-b border-line px-5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[13px] text-ink">Comment climate</span>
            <span className="tnum text-[12px] text-ink">
              {climate.label}
              {climate.traits.length > 0 ? (
                <span className="text-ink-faint"> · {climate.traits.join(' · ')}</span>
              ) : null}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{climate.summary}</p>
          {/* Said plainly rather than left to the label to imply. A one-word
              atmosphere is read as a verdict unless something says it is not. */}
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            This describes the audience, not the creator, and it is not a rating — a combative
            section is the wrong placement for most categories and the right one for a few.
          </p>
        </div>
      ) : null}

      {tone ? (
        <div className="border-b border-line px-5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[13px] text-ink">Audience criticism</span>
            <span className="tnum text-[12px] text-ink">
              {percent(tone.criticiseShare, 1)} of {exactNumber(tone.total)} comments
            </span>
          </div>
          <p className="tnum mt-1 text-[11px] leading-relaxed text-ink-faint">
            {/* The ratio is what makes the percentage readable. 3.4% sounds
                like a number; six-to-one is a judgement a buyer can make. */}
            {percent(tone.praiseShare, 1)} is appreciation
            {tone.praiseRatio !== null
              ? ` — ${tone.praiseRatio.toFixed(1)}× as much praise as criticism`
              : ' — no critical comments at all'}
            . Their own comment section, in full, not a sample.
          </p>
        </div>
      ) : null}

      {/* Reported in full and scored at zero. A brand's ad sits beside these
          whoever wrote them, so they need the number; the creator did not
          write them, so it is not a mark against her. Saying both plainly is
          the only way the figure is usable without being unfair. */}
      {risk ? (
        <div className="border-b border-line px-5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[13px] text-ink">What an ad would sit beside</span>
            <span className="tnum text-[12px] text-ink">
              {exactNumber(risk.adjacent)} of {exactNumber(risk.scanned)} scanned
              {risk.adjacentShare !== null ? ` · ${percent(risk.adjacentShare, 1)}` : ''}
              {risk.raisedCategories.length < risk.categories.length ? (
                <span className="text-ink-faint">
                  {' '}
                  · {risk.raisedCategories.length} of {risk.categories.length} categories a pattern
                </span>
              ) : null}
            </span>
          </div>

          <ul className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
            {/* Every category found, singletons included — a lone slur is
                still something the creator should see. The raised/found split
                below is what says which of them is a finding. */}
            {risk.categories.map((c) => (
              <li key={c.category}>
                {BRAND_RISK_LABEL[c.category]}{' '}
                <span className={isMaterial(c) ? 'text-ink' : 'text-ink-faint'}>
                  {exactNumber(c.count)}
                </span>
                {/* One of something is reported and not counted. Said here
                    rather than left to the reader to infer from a grey
                    number. */}
                {!isMaterial(c) ? <span className="text-ink-faint"> (one, not a pattern)</span> : null}
                {c.byCreator > 0 ? (
                  <span className="text-rose"> · {c.byCreator} by the creator</span>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            {risk.byCreator === 0
              ? 'None of this was written by the creator, so none of it affects the score above. It is a moderation and placement figure.'
              : `${exactNumber(risk.byCreator)} of these were written by the creator — that part does affect the score above.`}
            {risk.hidden > 0
              ? ` ${exactNumber(risk.hidden)} already removed; ${exactNumber(risk.visible)} still visible.`
              : ''}
          </p>
        </div>
      ) : null}

      <ul className="divide-y divide-line">
        {sorted.map((flag) => (
          <li key={flag.category} className="px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <span className="text-[13px] text-ink">{flag.category}</span>
              <span className="flex items-center gap-2.5">
                <span className="tnum text-[11px] text-ink-faint">
                  {/* A rate that rounds to 0.0% is a worse statement than the
                      count behind it. The disclosure flag is five comments in
                      21,330 — a real finding rendered as "0.0% of comments",
                      which reads as nothing found. Below a tenth of a percent
                      the share stops carrying the information and the note
                      beside it gives the count instead. */}
                  {locked
                    ? '—'
                    : flag.incidence === 0
                      ? 'none found'
                      : flag.incidence < 0.001
                        ? `under 0.1% ${BASIS_LABEL[flag.basis ?? 'comments']}`
                        : `${percent(flag.incidence, 1)} ${BASIS_LABEL[flag.basis ?? 'comments']}`}
                </span>
                {/* Endorsement sits beside severity rather than inside it.
                    A complaint few people make but many people like is a
                    different risk from a loud one nobody agrees with, and one
                    badge cannot say both. */}
                {!locked && flag.endorsement !== null && flag.endorsement >= 1.5 ? (
                  <span className="tnum text-[11px] text-amber" title="How much more the flagged comments are liked than the corpus average.">
                    {flag.endorsement.toFixed(1)}× liked
                  </span>
                ) : null}
                <Badge tone={SEVERITY_TONE[cappedSeverity(flag)]}>{cappedSeverity(flag)}</Badge>
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">{flag.note}</p>
          </li>
        ))}
      </ul>
    </LockedPanel>
  );
}
