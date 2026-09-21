import type { ContentProfile } from './content-profile';
import type { VideoEvidence } from '@/lib/ingest/analyze';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import { freshData } from './state';
import { commentClustersSchema } from '@/lib/schemas';
import type { Promotion } from '@/types';

/**
 * The report as a client may see it, and the one place eligibility is decided.
 *
 * TWO WINDOWS, NAMED SEPARATELY. `requestedStart`/`requestedEnd` are the bound
 * the collection was asked for; `sampledStart`/`sampledEnd` are the publication
 * dates that actually came back inside it. Printing the first as though it were
 * the second read as "50 uploads published between 22 Jun and 20 Sept" beside a
 * chart whose own axis started on 4 Jul. They are different facts and they now
 * have different names, so no caller can confuse them by accident.
 */
export interface ChannelReportView {
 channelId:string; title:string; handle:string|null; avatar:string|null; description:string|null;
 subscribers:number|null; fetchedAt:string;
 /** The window ASKED FOR. */
 requestedStart:string|null; requestedEnd:string|null;
 /** The publication dates FOUND. Null when nothing was collected. */
 sampledStart:string|null; sampledEnd:string|null;
 windowDays:number;
 videos:VideoEvidence[]; comments:number; unreadable:number; truncated:boolean; promotions:Promotion[];
 contentProfile:ContentProfile|null;
 clusters:ReturnType<typeof commentClustersSchema.parse>; derivedAllowed:boolean; analysedAt:string|null;
}

/**
 * The uploads whose view counts may be compared with each other.
 *
 * A LIVE STREAM AND A PREMIERE ARE NOT PERFORMANCE ROWS. One is still
 * accumulating views in a way a finished upload is not; the other has not been
 * watched at all, and its view count — reported as 0, or not reported — is a
 * state, not a result. Both used to sit in the same bucket as an upload with
 * missing duration metadata, which is how "views in the sample range from 0"
 * reached a page beside a table whose own minimum was 182.4K.
 *
 * EVERY performance figure in the product goes through here, so the narrative,
 * the table and the chart cannot disagree about which uploads they describe.
 */
export function comparable(videos:VideoEvidence[]):VideoEvidence[] {
 return videos.filter(v=>(v.state??'published')==='published');
}

/** What was set aside, so the count is stated rather than silently smaller. */
export function setAside(videos:VideoEvidence[]):{live:number;upcoming:number} {
 return {
  live:videos.filter(v=>v.state==='live').length,
  upcoming:videos.filter(v=>v.state==='upcoming').length,
 };
}

/** Earliest and latest publication date present in a set of uploads. */
export function publishedRange(videos:VideoEvidence[]):{first:string|null;last:string|null} {
 const times=videos.map(v=>Date.parse(v.publishedAt)).filter(t=>Number.isFinite(t));
 if(times.length===0)return {first:null,last:null};
 return {first:new Date(Math.min(...times)).toISOString(),last:new Date(Math.max(...times)).toISOString()};
}

/** Explicit allowlist: raw corpus, private campaign information and model names never travel to clients. */
export function publicReport(row:Record<string,unknown>, now=Date.now()):ChannelReportView|null {
 if(!freshData(row.data_fetched_at,now)) return null;
 const evidence=row.evidence as {videos?:VideoEvidence[];start?:string;end?:string;firstPublishedAt?:string|null;lastPublishedAt?:string|null;windowDays?:number;unreadable?:number;truncated?:boolean}|null;
 const videos=evidence?.videos??[];
 // Evidence collected before the observed range was stored still reports one:
 // it is derivable from the uploads themselves, and deriving it is better than
 // falling back to the requested window, which is the confusion being fixed.
 const observed=publishedRange(videos);
 return { channelId:String(row.channel_id),title:String(row.title),handle:row.handle as string|null,
 avatar:row.avatar_url as string|null,description:row.description as string|null,subscribers:row.subscribers == null?null:Number(row.subscribers),
 fetchedAt:String(row.data_fetched_at),
 requestedStart:evidence?.start??null,requestedEnd:evidence?.end??null,
 sampledStart:evidence?.firstPublishedAt??observed.first,sampledEnd:evidence?.lastPublishedAt??observed.last,
 windowDays:evidence?.windowDays??90,
 videos,comments:Number(row.comments_analyzed??0),unreadable:evidence?.unreadable??0,truncated:evidence?.truncated??true,
 promotions:((row.promotions??[]) as Promotion[]).filter(p=>AMENDMENT_ACCEPTED||p.disclosure==='explicit'), clusters:AMENDMENT_ACCEPTED?commentClustersSchema.parse(row.top_comment_clusters??[]):[],
 contentProfile:AMENDMENT_ACCEPTED?(row.content_profile as ContentProfile??null):null,
 derivedAllowed:AMENDMENT_ACCEPTED,analysedAt:AMENDMENT_ACCEPTED?(row.analysed_at as string|null):null };
}

export interface Performance {
 /** Uploads that reported a view count AND are comparable. */
 n:number;
 /** Comparable uploads, whether or not they reported a count. */
 sampled:number;
 median:number|null;
 /** The middle 50%. Null below the sample size that makes quartiles mean anything. */
 p25:number|null; p75:number|null;
 min:number|null; max:number|null;
 /** Total views across the uploads that reported one. Null when none did. */
 total:number|null;
 /** Comparable uploads that reported no count — unknown, never zero. */
 unreported:number;
 /** Excluded before any of the above was computed. */
 excludedLive:number; excludedUpcoming:number;
 ageBands:{label:string;n:number;median:number|null}[];
}

const med=(values:number[]):number|null=>values.length?(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2:null;

/**
 * One sample described, over comparable uploads only.
 *
 * QUARTILES NEED A SAMPLE. Below eight reporting uploads the middle 50% is two
 * or three videos wide and reads as precision the sample cannot carry, so it is
 * null and the surfaces fall back to naming every value instead.
 */
export function performance(videos:VideoEvidence[],now:number):Performance {
 const {live,upcoming}=setAside(videos);
 const eligible=comparable(videos);
 const views=eligible.flatMap(v=>v.views===null?[]:[v.views]).sort((a,b)=>a-b);
 const quartile=(f:number):number|null=>{
  if(views.length<8)return null;
  const index=(views.length-1)*f;
  const low=Math.floor(index),high=Math.ceil(index);
  return views[low]+(views[high]-views[low])*(index-low);
 };
 const ages=eligible.map(v=>({v,days:(now-Date.parse(v.publishedAt))/86400000}));
 return {
  n:views.length,sampled:eligible.length,median:med(views),
  p25:quartile(0.25),p75:quartile(0.75),
  min:views[0]??null,max:views.at(-1)??null,
  total:views.length?views.reduce((a,b)=>a+b,0):null,
  unreported:eligible.length-views.length,
  excludedLive:live,excludedUpcoming:upcoming,
  ageBands:[[0,7],[7,30],[30,90],[90,Infinity]].map(([a,b])=>({label:b===Infinity?'90+ days':`${a}–${b} days`,n:ages.filter(x=>x.days>=a&&x.days<b).length,median:med(ages.filter(x=>x.days>=a&&x.days<b&&x.v.views!==null).map(x=>x.v.views!).sort((a,b)=>a-b))})),
 };
}
