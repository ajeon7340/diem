import { ChannelReport } from '@/components/channel/ChannelReport';
import { ComparisonTable } from './ComparisonTable';
import type { CandidateView } from '@/lib/campaign/presentation';
import type { Campaign } from '@/lib/data/campaigns';

/** Separate print tree: no form state, notes, prices or fit text can leak into it. */
export function CampaignExport({
  campaign,
  candidates,
  brandName,
}: {
  campaign: Campaign;
  candidates: CandidateView[];
  brandName: string | null;
}) {
  return (
    <section className="hidden print:block" aria-label="Campaign export">
      <p className="rail">{brandName ?? 'Campaign'}</p>
      <h1 className="my-3 text-2xl font-semibold">{campaign.name}</h1>
      {campaign.objective && (
        <p className="mb-5 text-sm">{campaign.objective}</p>
      )}
      <ComparisonTable candidates={candidates} />
      <p className="mt-4 text-xs">
        Generated {new Date().toISOString()}. Private notes, budget, fees and
        campaign assessments are excluded. Refresh or delete exports by each
        report’s printed deadline.
      </p>
      {/* Each creator's evidence, read against THIS brief — which is what makes
          these campaign reports rather than channel reports under a campaign
          heading. The brief travels no further than this export: it is not
          passed to a shared link, where the audience is outside the workspace. */}
      <div className="campaign-print-details">
        {candidates.map(
          ({ report }) =>
            report && (
              <div key={report.channelId} className="campaign-print-creator">
                <ChannelReport
                  report={report}
                  campaign={{
                    name: campaign.name,
                    brand: brandName ?? campaign.brand,
                    product: campaign.product,
                    useCase: campaign.useCase ?? null,
                    objective: campaign.objective,
                  }}
                />
              </div>
            ),
        )}
      </div>
    </section>
  );
}
