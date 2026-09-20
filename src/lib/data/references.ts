import { freshData } from '@/lib/channel/state';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import 'server-only';

import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Reference videos saved against a campaign.
 *
 * A frozen read, not a pointer. See migration 0034: the channel median behind
 * a multiple moves with every upload, so recomputing on display would quietly
 * change what a saved figure meant. `analysedAt` is the date that makes the
 * number legible, and it is required rather than optional.
 */
export interface CampaignReference {
  id: string;
  candidateId: string | null;
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string | null;
  durationSec: number | null;
  views: number | null;
  channelMedianViews: number | null;
  /** Against this video's OWN channel. Never against a candidate's. */
  multiple: number | null;
  engagementRate: number | null;
  channelMedianEngagement: number | null;
  sampleSize: number;
  note: string | null;
  analysedAt: string;
  createdAt: string;
}

interface Row {
  id: string;
  candidate_id: string | null;
  video_id: string;
  title: string;
  channel_id: string;
  channel_title: string;
  published_at: string | null;
  duration_sec: number | null;
  views: number | null;
  channel_median_views: number | null;
  multiple: string | number | null;
  engagement_rate: string | number | null;
  channel_median_engagement: string | number | null;
  sample_size: number;
  note: string | null;
  analysed_at: string;
  created_at: string;
}

/** Postgres numerics arrive as strings; a silent NaN would render as a figure. */
const num = (v: string | number | null): number | null => {
  if (v === null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const toReference = (r: Row): CampaignReference => ({
  id: r.id,
  candidateId: r.candidate_id,
  videoId: r.video_id,
  title: r.title,
  channelId: r.channel_id,
  channelTitle: r.channel_title,
  publishedAt: r.published_at,
  durationSec: r.duration_sec,
  views: r.views,
  channelMedianViews: r.channel_median_views,
  multiple: num(r.multiple),
  engagementRate: num(r.engagement_rate),
  channelMedianEngagement: num(r.channel_median_engagement),
  sampleSize: r.sample_size,
  note: r.note,
  analysedAt: r.analysed_at,
  createdAt: r.created_at,
});

export async function getReferences(campaignId: string): Promise<CampaignReference[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createSessionClient();
  // RLS scopes this to the viewer's organisation; the filter narrows, it does
  // not authorise.
  const { data, error } = await supabase
    .from('campaign_references')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .returns<Row[]>();

  if (error) {
    console.error('[campaign_references] read failed', error.message);
    return [];
  }
  if (!AMENDMENT_ACCEPTED) return [];
  return (data ?? []).map(r=>freshData(r.analysed_at)?toReference(r):toReference({...r,title:'Expired reference — refresh before use',channel_title:'',published_at:null,duration_sec:null,views:null,channel_median_views:null,multiple:null,engagement_rate:null,channel_median_engagement:null,sample_size:0}));
}
