import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getCreatorByHandle, resolveProfileAccess } from '@/lib/access/gatekeeper';
import { getFitSummary } from '@/lib/data/requests';
import { isUnlocked } from '@/types';
import { parseAccessToken } from '@/lib/schemas';
import { assessReport, confidenceLabel } from '@/lib/report/sufficiency';
import { exactNumber, shortDate } from '@/lib/format';
import { ProposalProvider } from '@/components/profile/proposal-context';
import { AccessBanner } from '@/components/profile/AccessBanner';
import { BrandSafetyPanel } from '@/components/profile/BrandSafetyPanel';
import { PromotionsPanel } from '@/components/profile/PromotionsPanel';
import { FitSummaryPanel } from '@/components/profile/FitSummaryPanel';
import { ClustersPanel } from '@/components/profile/ClustersPanel';
import { CommercialPanel } from '@/components/profile/CommercialPanel';
import { DemographicsPanel } from '@/components/profile/DemographicsPanel';
import { MetricsStrip } from '@/components/profile/MetricsStrip';
import { OutputPanel } from '@/components/profile/OutputPanel';
import { PublicOpinionPanel } from '@/components/profile/PublicOpinionPanel';
import { ProfileHeader, TeaserHighlights } from '@/components/profile/ProfileHeader';
import { ReportNav } from '@/components/profile/ReportNav';
import { assessFitEligibility } from '@/lib/report/fit';
import { describeJob, latestAnalysisJob } from '@/lib/ingest/jobs';
import { createSessionClient } from '@/lib/supabase/server';
import { OFF_PLATFORM_PANEL } from '@/lib/report/policy';
import { StickyActionBar } from '@/components/profile/StickyActionBar';
import { SiteHeader } from '@/components/shell/SiteHeader';

interface PageProps {
  params: { handle: string };
  searchParams: { token?: string | string[] };
}

/**
 * The response depends on the visitor's token and session, so it must never be
 * shared. A cached unlocked render would serve one brand's paid report to the
 * next anonymous visitor.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const creator = await getCreatorByHandle(params.handle);
  if (!creator) return { title: 'Profile not found' };

  const title = creator.isVerified
    ? `${creator.displayName} — Verified Media Kit`
    : `${creator.displayName} — Media Kit`;
  const description =
    creator.bio ?? `Verified audience data and AI ad-fit intelligence for @${creator.handle}.`;

  // Only teaser-grade copy reaches link previews.
  return { title, description, openGraph: { title, description, type: 'profile' } };
}

/**
 * Section rail. The report is long enough that a buyer needs to find their
 * question, not scroll for it — so it is grouped the way a media plan is
 * argued: can I afford it, who is it, what could go wrong.
 */
function Section({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-8 scroll-mt-28 first:mt-0">
      <h2 className="rail border-b border-line pb-2.5">{label}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export default async function CreatorProfilePage({ params, searchParams }: PageProps) {
  const view = await resolveProfileAccess(params.handle, searchParams.token);
  if (!view) notFound();

  const { creator, access } = view;
  const report = isUnlocked(view) ? view.report : null;
  const locked = report === null;
  // Decided here, not after a click: whether this report can support a written
  // fit read is a property of the report, and the panel should say so up front.
  const fitEligibility = assessFitEligibility(report, true);
  // Read once on the server so a returning viewer sees the same argument they
  // saw last time rather than a freshly-worded one.
  const cachedFit =
    access.mode === 'pro_agency'
      ? await getFitSummary(creator.id, access.organization.id)
      : null;
  const sufficiency = report ? assessReport(report) : null;

  // WHICH absence this is, for the one person who can act on knowing.
  //
  // Only for the owner, and only while the pass is actually missing. RLS scopes
  // `analysis_jobs` to the creator, and that is the right scope: a buyer's copy
  // already says "a missing pass, not a missing audience", which is the part
  // that protects the creator from an absence being read as a finding. The
  // creator, who has just signed up and is looking at their own half-filled
  // report, is the one who needs to know whether it is coming or broken.
  // `classify_intent`, NOT the safety census. `unclassified` means
  // `comment_axes` is absent, and the axes are the intent pass's output — the
  // census measures a different thing entirely and could have finished long ago
  // while this gap is still open.
  const pendingJob =
    access.mode === 'owner' && sufficiency?.unclassified
      ? await latestAnalysisJob(createSessionClient(), creator.id, 'classify_intent')
      : null;
  const note = describeJob(pendingJob);
  // The numbers travel beside the sentence rather than inside it: the client
  // draws the bar and decides when to stop polling, and both need the raw
  // figures. `describeJob` stays the only thing that decides the WORDS.
  const pendingPass =
    pendingJob && note
      ? {
          note,
          status: pendingJob.status,
          done: pendingJob.progressDone,
          total: pendingJob.progressTotal,
        }
      : null;

  const contextLabel =
    access.mode === 'token'
      ? `unlocked for ${access.grant.companyName}`
      : access.mode === 'pro_agency'
        ? `unlocked via ${access.organization.name}`
        : access.mode === 'owner'
          ? 'your profile'
          : 'verified 1st-party data';

  // The token is the credential the composer re-validates, so it travels in
  // the link. A Pro member carries their entitlement in the session instead.
  const token = parseAccessToken(searchParams.token);
  // Printing carries the same credential the page was opened with.
  const printHref = report
    ? `/@${creator.handle}/print${token ? `?token=${token}` : ''}`
    : null;
  const offerHref =
    access.mode === 'token' && token
      ? `/offers/new?handle=${creator.handle}&token=${token}`
      : access.mode === 'pro_agency'
        ? `/offers/new?handle=${creator.handle}`
        : null;

  return (
    <ProposalProvider
      handle={creator.handle}
      displayName={creator.displayName}
      minimumBudget={creator.minimumBudget}
    >
      <div className="flex min-h-screen flex-col">
        <SiteHeader />

        <main className="relative flex-1">
          <div className="grid-rule pointer-events-none absolute inset-x-0 top-0 h-64" aria-hidden />

          <div className="relative mx-auto w-full max-w-shell px-5 pb-16 pt-12 sm:px-8">
            <ProfileHeader creator={creator} />

            <div className="mt-8 space-y-4">
              <TeaserHighlights creator={creator} />
              <AccessBanner access={access} />
              {/* Directly under the unlock, and only on the pro_agency branch —
                  the gatekeeper's own verdict rather than a second identity
                  read, so one source decides who sees this.
                  
                  It used to sit last in Commercial fit, on the reasoning that
                  prose written over figures should not precede them. An agency
                  scanning a shortlist reads top-down and stops early, so the
                  one panel written against their own brief was the one they
                  never reached. It is generated text and says so on its face,
                  and every claim prints the figure it rests on — which is what
                  makes it safe to read before the tiles rather than after. */}
              <FitSummaryPanel
                handle={creator.handle}
                entitled={access.mode === 'pro_agency'}
                unavailable={fitEligibility.ok ? null : fitEligibility.message}
                cached={cachedFit}
              />
            </div>

            <div className="mt-10">
              {report ? <ReportNav /> : null}

              {/* Who they are, before what they cost — the audience is what a
                  brand is actually buying, and it frames every figure below. */}
              <Section id="audience" label="Audience">
                <DemographicsPanel
                  demographics={report?.demographics ?? null}
                  locked={locked}
                  seed={creator.id}
                  awaitingGrant={
                    access.mode === 'pro_agency' && !access.demographicsGranted
                  }
                  creatorId={creator.id}
                  handle={creator.handle}
                />
                <OutputPanel
                  output={report?.outputStats ?? []}
                  commercial={(report?.platformBreakdown ?? []).map((p) => ({
                    platform: p.platform,
                    followers: p.followers,
                    purchaseIntentRate: p.purchaseIntentRate,
                    sponsoredRetention: p.sponsoredRetention,
                    estimatedCpm: p.estimatedCpm,
                  }))}
                  locked={locked}
                />
                <ClustersPanel
                  clusters={report?.topCommentClusters ?? null}
                  axes={locked ? null : (report?.commentAxes ?? null)}
                  commentsAnalyzed={report?.commentsAnalyzed ?? 0}
                  confidence={sufficiency ? confidenceLabel(sufficiency.comments) : undefined}
                  emptyReason={sufficiency?.noComments ? sufficiency.gaps[0] : undefined}
                  unclassified={sufficiency?.unclassified ?? false}
                  seed={creator.id}
                />
              </Section>

              <Section id="commercial" label="Commercial fit">
                <MetricsStrip report={report} pendingPass={pendingPass} />
                <CommercialPanel
                  cost={report?.costEfficiency ?? null}
                  performance={report?.sponsoredPerformance ?? null}
                  engagementRate={report?.engagementRate ?? null}
                  adFatigueLevel={report?.adFatigueLevel ?? null}
                  hasMinimumBudget={creator.minimumBudget !== null}
                  sponsoredConfidence={
                    sufficiency ? confidenceLabel(sufficiency.sponsored) : undefined
                  }
                  locked={locked}
                />
                {/* What they have actually sold sits under what a placement
                    costs: the retention figures here are the evidence for the
                    ad-fatigue read stated above them. */}
                <PromotionsPanel promotions={report?.promotions ?? []} locked={locked} />
              </Section>

              <Section id="risk" label="Risk &amp; brief">
                {OFF_PLATFORM_PANEL ? (
                  <PublicOpinionPanel
                    opinion={
                    report?.publicOpinion
                      ? {
                          corpusNote: report.publicOpinion.corpusNote,
                          coveredPlatforms: report.publicOpinion.coveredPlatforms,
                          windowDays: report.publicOpinion.windowDays,
                          itemsAnalyzed: report.publicOpinion.itemsAnalyzed,
                          items: report.publicOpinion.items,
                          selection: report.publicOpinion.selection,
                          reactionsAnalyzed: report.publicOpinion.reactionsAnalyzed,
                          discussionShare: report.publicOpinion.discussionShare,
                          sources: report.publicOpinion.sources,
                          themes: report.publicOpinion.themes,
                        }
                      : null
                  }
                  locked={locked}
                />
                ) : null}
                <BrandSafetyPanel report={report} />
              </Section>
            </div>

            <p className="tnum mt-8 text-[11px] leading-relaxed text-ink-faint">
              1st-party OAuth analytics, shown only to organisations this creator approved ·
              scores are adfit&rsquo;s own, model-generated from public comments, not YouTube
              figures · cost figures estimated, not quoted, and not approved by Google
              {report
                ? ` · ${exactNumber(report.commentsAnalyzed)} comments, ${shortDate(report.lastAnalyzedAt)}${
                    report.modelVersion ? ` · ${report.modelVersion}` : ''
                  }`
                : ''}
            </p>
          </div>
        </main>

        <StickyActionBar
          displayName={creator.displayName}
          totalFollowers={creator.totalFollowers}
          unlocked={report !== null}
          isOwner={access.mode === 'owner'}
          contextLabel={contextLabel}
          offerHref={offerHref}
          printHref={printHref}
        />
      </div>
    </ProposalProvider>
  );
}
