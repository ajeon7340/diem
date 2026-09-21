import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { publicReport } from '@/lib/channel/report';
import { ChannelReport } from '@/components/channel/ChannelReport';
import { RelevanceReport } from '@/components/report/RelevanceReport';
import type { RelevanceContext, RequirementRow } from '@/lib/relevance/requirements';
import { PrintReport } from '@/components/channel/ReportActions';
export const dynamic='force-dynamic';
export const revalidate=0;
export default async function Shared({params}:{params:{token:string}}) {
 if(!/^[0-9a-f-]{36}$/i.test(params.token))notFound();
 const db=createServiceClient();if(!db)notFound();
 const {data:share}=await db.from('report_shares').select('*').eq('token',params.token).gt('expires_at',new Date().toISOString()).maybeSingle();
 if(!share)notFound();
 const {data:raw}=await db.from('channel_analyses').select('*').eq('channel_id',share.channel_id).maybeSingle();
 const report=raw?publicReport(raw):null;if(!report)notFound();
 /*
  * WHAT THE LINK SHOWS is read off the row, not assumed. A link created for the
  * channel report alone must never start rendering a relevance analysis because
  * one was written later — the share records the choice, and this honours it.
  */
 const showChannel=share.include_channel!==false;
 const showRelevance=share.include_relevance===true&&share.brand_id;
 let relevance:{context:RelevanceContext;rows:RequirementRow[];writtenAt:string;against:string}|null=null;
 if(showRelevance){
  const {data:brand}=await db.from('brands').select('*').eq('id',share.brand_id).eq('organization_id',share.organization_id).maybeSingle();
  const {data:stored}=await db.from('relevance_analyses').select('*').eq('organization_id',share.organization_id).eq('channel_id',share.channel_id).eq('brand_id',share.brand_id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(brand&&stored){
   const {data:camp}=stored.campaign_id?await db.from('campaigns').select('*').eq('id',stored.campaign_id).eq('organization_id',share.organization_id).maybeSingle():{data:null};
   relevance={
    context:{brand:{id:brand.id,name:brand.name,sells:brand.sells,categories:brand.categories??[],customerNeeds:brand.customer_needs,contentLanguages:brand.content_languages??[],markets:brand.markets??[]},
     campaign:camp?{id:camp.id,name:camp.name,product:camp.product,useCase:camp.use_case??null,objective:camp.objective,avoidTopics:camp.avoid_topics}:null},
    rows:Array.isArray(stored.matrix)?stored.matrix:[],writtenAt:stored.created_at,against:stored.evidence_fetched_at,
   };
  }
 }
 let notes:string|null=null,fee:string|null=null,budget:string|null=null;
 if(share.campaign_id){
  // Recheck workspace and channel binding on every read, not only when the link was created.
  const {data:campaign}=await db.from('campaigns').select('id,budget_total,budget_currency').eq('id',share.campaign_id).eq('organization_id',share.organization_id).maybeSingle();
  if(!campaign)notFound();
  const {data:candidate}=await db.from('campaign_candidates').select('notes,proposed_fee,fee_currency').eq('campaign_id',campaign.id).eq('channel_id',share.channel_id).maybeSingle();
  if(!candidate)notFound();
  if(share.include_notes)notes=candidate.notes;
  if(share.include_fee&&candidate.proposed_fee!==null)fee=`${candidate.fee_currency} ${candidate.proposed_fee}`;
  if(share.include_budget&&campaign.budget_total!==null)budget=`${campaign.budget_currency} ${campaign.budget_total}`;
 }
 return <main className="report-page mx-auto max-w-5xl px-6 py-10"><p className="mb-3 text-sm">Shared report · Link expires {new Date(share.expires_at).toLocaleString('en-US')}</p><PrintReport/>{showChannel?<ChannelReport report={report}/>:null}{relevance?<div className={showChannel?'mt-10 border-t border-line pt-8':''}><RelevanceReport report={report} context={relevance.context} rows={relevance.rows}
 /* The shared copy never carries the model narrative: it is the most
    interpretive part of the analysis and the least checkable by somebody
    outside the workspace. */
 narrative={null} freshness="current" writtenAt={relevance.writtenAt} writtenAgainst={relevance.against}/></div>:null}{(notes||fee||budget)&&<section className="mt-6 rounded border p-5"><h2 className="font-semibold">Explicitly shared workspace information</h2>{notes&&<p className="mt-3 whitespace-pre-wrap">Notes: {notes}</p>}{fee&&<p>Quoted fee: {fee}</p>}{budget&&<p>Campaign budget: {budget}</p>}</section>}</main>;
}
