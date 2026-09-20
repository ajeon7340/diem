import type { ContentProfile } from './content-profile';
import type { VideoEvidence } from '@/lib/ingest/analyze';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import { freshData } from './state';
import { commentClustersSchema } from '@/lib/schemas';
import type { Promotion } from '@/types';
export interface ChannelReportView {
 channelId:string; title:string; handle:string|null; avatar:string|null; description:string|null;
 subscribers:number|null; fetchedAt:string; start:string|null; end:string|null; windowDays:number;
 videos:VideoEvidence[]; comments:number; unreadable:number; truncated:boolean; promotions:Promotion[];
 contentProfile:ContentProfile|null;
 clusters:ReturnType<typeof commentClustersSchema.parse>; derivedAllowed:boolean; analysedAt:string|null;
}
/** Explicit allowlist: raw corpus, private campaign information and model names never travel to clients. */
export function publicReport(row:Record<string,unknown>, now=Date.now()):ChannelReportView|null {
 if(!freshData(row.data_fetched_at,now)) return null;
 const evidence=row.evidence as {videos?:VideoEvidence[];start?:string;end?:string;windowDays?:number;unreadable?:number;truncated?:boolean}|null;
 return { channelId:String(row.channel_id),title:String(row.title),handle:row.handle as string|null,
 avatar:row.avatar_url as string|null,description:row.description as string|null,subscribers:row.subscribers == null?null:Number(row.subscribers),
 fetchedAt:String(row.data_fetched_at),start:evidence?.start??null,end:evidence?.end??null,windowDays:evidence?.windowDays??90,
 videos:evidence?.videos??[],comments:Number(row.comments_analyzed??0),unreadable:evidence?.unreadable??0,truncated:evidence?.truncated??true,
 promotions:((row.promotions??[]) as Promotion[]).filter(p=>AMENDMENT_ACCEPTED||p.disclosure==='explicit'), clusters:AMENDMENT_ACCEPTED?commentClustersSchema.parse(row.top_comment_clusters??[]):[],
 contentProfile:AMENDMENT_ACCEPTED?(row.content_profile as ContentProfile??null):null,
 derivedAllowed:AMENDMENT_ACCEPTED,analysedAt:AMENDMENT_ACCEPTED?(row.analysed_at as string|null):null };
}
export function performance(videos:VideoEvidence[],now:number) {
 const views=videos.flatMap(v=>v.views===null?[]:[v.views]).sort((a,b)=>a-b);
 const med=(values:number[])=>values.length?(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2:null;
 const ages=videos.map(v=>({v,days:(now-Date.parse(v.publishedAt))/86400000}));
 return {n:views.length,median:med(views),min:views[0]??null,max:views.at(-1)??null,
 ageBands:[[0,7],[7,30],[30,90],[90,Infinity]].map(([a,b])=>({label:b===Infinity?'90+ days':`${a}–${b} days`,n:ages.filter(x=>x.days>=a&&x.days<b).length,median:med(ages.filter(x=>x.days>=a&&x.days<b&&x.v.views!==null).map(x=>x.v.views!).sort((a,b)=>a-b))}))};
}
