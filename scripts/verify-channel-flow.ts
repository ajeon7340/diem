import { candidateSchema } from '@/lib/schemas-campaign';
import assert from 'node:assert/strict';
import { channelDestination, freshData, reportState } from '@/lib/channel/state';
import { publicReport, performance } from '@/lib/channel/report';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import { analyzeChannel } from '@/lib/ingest/analyze';
import type { AnalysisJob } from '@/types';
assert.equal(candidateSchema.safeParse({channel:'@example',proposedFee:'-5'}).success,false);
assert.equal(candidateSchema.safeParse({channel:'@example',proposedFee:'garbage'}).success,false);
const now=Date.now();
assert.equal(new URL(channelDestination('https://youtube.com/@가재맨?x=1'), 'https://example.test').searchParams.get('channel'),'https://youtube.com/@가재맨?x=1');
assert.equal(channelDestination('//evil.test'),'/channels?channel=%2F%2Fevil.test');
assert.equal(channelDestination(null),'/channels');
assert.equal(freshData(new Date(now-30*86400000).toISOString(),now),false);
assert.equal(freshData(null),false);
assert.equal(freshData(new Date(now+1000).toISOString(),now),false);
const job=(status:AnalysisJob['status'])=>({status} as AnalysisJob);
assert.equal(reportState([],false,0),'Not started');
assert.equal(reportState([job('queued')],false,0),'Queued');
assert.equal(reportState([job('running')],true,0),'Running');
assert.equal(reportState([job('failed')],false,0),'Failed');
assert.equal(reportState([job('failed')],true,10),'Partially completed');
assert.equal(reportState([],true,0),'Completed with insufficient evidence');
assert.equal(reportState([],true,10),'Completed');
assert.equal(reportState([],true,10,true),'Partially completed');
assert.equal(AMENDMENT_ACCEPTED,false,'Run this suite without approval configured');
const row={channel_id:'UCtest',title:'Test',data_fetched_at:new Date(now).toISOString(),top_comment_clusters:[{label:'must not escape'}],analysed_at:new Date(now).toISOString(),comment_corpus:[{text:'not in client props'}],budget_total:999};
const projected=publicReport(row)!;
assert.deepEqual(projected.clusters,[]);assert.equal(projected.analysedAt,null);
assert.equal('comment_corpus' in projected,false);assert.equal('budget_total' in projected,false);
assert.equal(publicReport({...row,data_fetched_at:'2000-01-01'}),null);
assert.equal(performance([],now).median,null);
process.env.YOUTUBE_API_KEY='fixture-only';
const oldFetch=globalThis.fetch;
let collections=0;let commentPages=0;const stages:string[]=[];
globalThis.fetch=async(input)=>{
 const url=new URL(String(input));const endpoint=url.pathname.split('/').at(-1);
 let body:unknown;
 if(endpoint==='channels')body={items:[{id:'UCfixture',snippet:{title:'Fixture',description:'DIY',customUrl:'@fixture'},contentDetails:{relatedPlaylists:{uploads:'uploads'}},statistics:{subscriberCount:'100'}}]};
 else if(endpoint==='playlistItems'){collections++;body={items:[{contentDetails:{videoId:'recent'}},{contentDetails:{videoId:'old'}}]};}
 else if(endpoint==='videos')body={items:[{id:'recent',snippet:{title:'Recent tool guide',publishedAt:new Date(now-2*86400000).toISOString()},statistics:{viewCount:'100',commentCount:'100'},contentDetails:{duration:'PT2M'}},{id:'old',snippet:{title:'Old',publishedAt:new Date(now-400*86400000).toISOString()},statistics:{viewCount:'999999'},contentDetails:{duration:'PT20M'}}]};
 else if(endpoint==='commentThreads'){commentPages++;body={items:Array.from({length:100},(_,i)=>({snippet:{topLevelComment:{id:`c${i}`,snippet:{textDisplay:'Where can I buy this?',likeCount:1,publishedAt:new Date(now).toISOString()}}}})),nextPageToken:'more'};}
 else throw new Error(`Unexpected endpoint ${endpoint}`);
 return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
};
async function verify() {
 const {readCandidate}=await import('@/lib/report/candidate-fit');
 const {describeContent}=await import('@/lib/channel/content-profile');
 const {classifyChannelIntentAndStore}=await import('@/lib/ingest/channel-classify');
 assert.equal((await readCandidate({} as never)).ok,false,'Campaign analysis gated before model access');
 assert.equal(await describeContent([{id:'video'}] as never),null,'Content analysis gated before model access');
 await assert.rejects(()=>classifyChannelIntentAndStore(null as never,'UCfixture'),/approval is not configured/);

try {
 const report=await analyzeChannel('UCfixture',{windowDays:30,maxComments:70,onStage:async s=>{stages.push(s);}});
 assert.equal(report.evidence.videos.length,1,'Period applies to all evidence');
 assert.equal(report.outputStats[0].medianViews,100,'Old video excluded from median');
 assert.equal(report.commentsAnalyzed,70,'Exact comment cap');
 assert.equal(report.corpus.length,70);assert.equal(commentPages,1);assert.equal(collections,1);
 assert.equal(report.commentRegister,null,'Restricted categorization gated');assert.deepEqual(report.commentRisks,[]);
 assert.deepEqual(stages,['resolution','videos','comments']);
} finally {globalThis.fetch=oldFetch;}
console.log('Channel flow: input preservation, states, retention, projection, approval gating, period and sample bounds passed.');

}
verify().catch(error=>{console.error(error);process.exitCode=1;});
