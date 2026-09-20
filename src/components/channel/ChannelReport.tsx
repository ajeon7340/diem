import { DERIVED_DISCLOSURE } from '@/lib/report/policy';
import type { ReactNode } from 'react';
import type { ChannelReportView } from '@/lib/channel/report';
import { performance } from '@/lib/channel/report';
import { safeExternalUrl } from '@/lib/format';
const date=(value:string|null)=>value?new Date(value).toLocaleDateString('en-US',{timeZone:'UTC'}):'Not recorded';
const number=(value:number|null)=>value===null?'Unavailable':value.toLocaleString('en-US');
function Section({title,report,children,limitation}:{title:string;report:ChannelReportView;children:ReactNode;limitation:string}) {
 return <section className="report-section rounded-lg border bg-surface p-6"><h2 className="mb-4 text-lg font-semibold">{title}</h2>{children}<p className="mt-5 border-t pt-3 text-xs leading-relaxed text-ink-muted">Source: {report.channelId==='sample'?'Illustrative fixture, not collected from YouTube':'official YouTube Data API'} · Collected {date(report.fetchedAt)} · Period {date(report.start)}–{date(report.end)} · Sample: {report.videos.length} videos, {report.comments} comments. {limitation}</p></section>;
}
export function ChannelReport({report,sample=false,format='all'}:{report:ChannelReportView;sample?:boolean;format?:string}) {
 const selected=report.videos.filter(v=>format==='all'||v.format===format);
 const explicit=report.promotions.filter(p=>p.disclosure==='explicit');
 const unknown=report.promotions.filter(p=>p.disclosure!=='explicit');
 return <article className="channel-report space-y-5">
 {sample&&<p className="rounded border border-amber bg-amber-wash p-4 text-sm font-medium">Sample report · Fictional channel and illustrative data. Not an assessment of a real creator.</p>}
 <header className="flex gap-4 py-4">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {report.avatar&&<img src={report.avatar} alt="" className="h-16 w-16 rounded-full"/>}
 <div><p className="rail">YouTube channel report</p><h1 className="mt-2 text-3xl font-semibold">{report.title}</h1><p className="mt-1 text-sm text-ink-muted">{report.handle}</p></div></header>
 <Section title="Executive summary" report={report} limitation="The report describes this bounded public sample, independently of any campaign.">
 <p>{report.contentProfile?.summary||report.description||'No channel description available.'}</p>
 <dl className="my-5 grid gap-4 sm:grid-cols-3"><div><dt className="text-sm text-ink-muted">Subscribers</dt><dd className="mt-1 text-xl">{number(report.subscribers)}</dd></div><div><dt className="text-sm text-ink-muted">Recent uploads sampled</dt><dd className="mt-1 text-xl">{report.videos.length}</dd></div><div><dt className="text-sm text-ink-muted">Public paid-promotion disclosures</dt><dd className="mt-1 text-xl">{explicit.length}</dd></div></dl>
 <p className="text-sm">{report.clusters.length?`Observed comment themes: ${report.clusters.slice(0,3).map(c=>c.label).join('; ')}.`:'Comment interests and questions have not been established.'}</p>
 <p className="mt-3 text-sm">Confirm product experience, proposed format, usage rights and availability before contracting. Public data cannot establish audience demographics, sales or future results.</p>
 </Section>
 <Section title="Content profile" report={report} limitation="Titles are creator-provided evidence. Recurring topics and series are not inferred without approved analysis.">
 {report.contentProfile?.topics.map((topic,i)=><details key={i} open className="mb-3 rounded border p-3"><summary className="text-sm font-medium">{topic.label}</summary><p className="mt-2 text-sm text-ink-muted">{topic.limitation}</p><ul className="mt-2 text-sm">{topic.videoIds.map(id=><li key={id}><a className="text-indigo" href={`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`}>{report.videos.find(v=>v.id===id)?.title??'Supporting video'}</a></li>)}</ul></details>)}
 <p className="mb-3 text-sm">Supporting videos from the selected period. {report.truncated?'Collection is capped; older uploads in this period may be missing.':''}</p>
 <details open><summary className="cursor-pointer text-sm">View supporting videos ({selected.length})</summary><ul className="mt-3 space-y-2 text-sm">{selected.map(v=><li key={v.id}><a href={sample?undefined:`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`} target="_blank" rel="noopener noreferrer" className="text-indigo">{v.title}</a><span className="ml-2 text-ink-muted">{date(v.publishedAt)} · {number(v.views)} views</span></li>)}</ul></details>
 </Section>
 <Section title="Performance" report={report} limitation="Views accumulate with age. Compare within age bands; these are observations, not forecasts. Cadence is a lower bound when the upload cap is reached.">
 <p className="mb-4 text-sm">Shorts cannot be identified reliably from duration alone in the public API. Short videos (≤3 minutes) are a proxy and can include non-Shorts; longer videos are shown separately.</p>
 <div className="grid gap-5 sm:grid-cols-2">{(['short','long'] as const).filter(f=>format==='all'||format===f).map(f=>{
 const videos=report.videos.filter(v=>v.format===f);const p=performance(videos,Date.parse(report.fetchedAt));return <div key={f} className="rounded border p-4"><h3 className="font-medium">{f==='short'?'Shorts / short videos (proxy)':'Long-form (>3 minutes)'}</h3><p className="my-3 text-sm">{videos.length} uploads sampled · {(videos.length/(report.windowDays/7)).toFixed(1)} uploads/week in sample</p><p className="text-sm">Median: {number(p.median)} views · Range: {number(p.min)}–{number(p.max)} · {p.n} with view counts</p><table className="mt-3 w-full text-sm"><thead><tr><th className="text-left">Video age</th><th>Sample</th><th>Median views</th></tr></thead><tbody>{p.ageBands.map(b=><tr key={b.label}><td className="py-1">{b.label}</td><td className="text-center">{b.n}</td><td className="text-center">{number(b.median)}</td></tr>)}</tbody></table></div>;
 })}</div>
 {report.videos.some(v=>v.format==='unknown')&&<p className="mt-3 text-sm">Some videos have unknown duration and are excluded from the format comparison.</p>}
 </Section>
 <Section title="Comment response" report={report} limitation="Commenters are self-selected and are not representative of all viewers. Product-related questions and purchase language do not establish purchases or conversion.">
 {!report.derivedAllowed?<p className="text-sm">Comment categorization and sentiment analysis are unavailable until applicable YouTube derived-analysis approval is configured.</p>:!report.analysedAt?<p className="text-sm">Comment analysis has not completed. No audience conclusion is available.</p>:report.clusters.length===0?<p className="text-sm">No supported comment themes available in this sample. Missing or disabled comments do not indicate negative response.</p>:<><p className="mb-3 text-sm">Classified sample: {report.comments} comments · Analysis {date(report.analysedAt)}. Themes can include recurring questions, product-related questions, usage experiences, positive reactions and concerns.</p>{report.clusters.map((c,i)=><details key={i} open className="mb-3 rounded border p-3"><summary className="cursor-pointer text-sm font-medium">{c.label} · {c.commentCount ?? 'Unrecorded count'} / {report.comments} comments</summary><div className="mt-3 space-y-3">{c.comments.map((comment,j)=>{const url=safeExternalUrl(comment.url);return <blockquote key={j} className="border-l-2 pl-3 text-sm"><p>{comment.text??'Quote expired. Consult the source.'}</p>{url&&<a className="text-indigo" href={url} rel="noopener noreferrer" target="_blank">{comment.postTitle||'Source video and comment'}</a>}</blockquote>;})}</div></details>)}</>}
 <p className="mt-3 text-sm">Collected {report.comments} comments. Comment access failed or was disabled on {report.unreadable} sampled videos; this limits evidence and says nothing negative about the audience.</p>
 </Section>
 <Section title="Sponsorship history" report={report} limitation="History is incomplete. A paid-promotion flag does not identify the brand. Performance differences are not evidence that sponsorship caused a change.">
 <h3 className="font-medium">Explicit public paid-promotion disclosure</h3>
 {explicit.length===0?<p className="mt-2 text-sm">No confirmed records found.</p>:<ul className="mt-2 space-y-2 text-sm">{explicit.map(p=><li key={p.postId}><a className="text-indigo" href={`https://www.youtube.com/watch?v=${encodeURIComponent(p.postId)}`}>{p.title}</a> · Brand not identified by the disclosure</li>)}</ul>}
 <h3 className="mt-5 font-medium">Unconfirmed mentions or suspected collaborations</h3><ul className="mt-2 space-y-2 text-sm">{unknown.map(p=><li key={p.postId}><a className="text-indigo" href={`https://www.youtube.com/watch?v=${encodeURIComponent(p.postId)}`}>{p.title}</a> · Description marker; collaboration unconfirmed</li>)}</ul>{!unknown.length&&<p className="mt-2 text-sm">No unconfirmed markers recorded in this sample.</p>}
 <h3 className="mt-5 font-medium">Customer-provided collaboration records</h3><p className="mt-2 text-sm">Not part of the reusable public-source report. Ask the creator or consult your workspace’s records.</p>
 </Section>
 <Section title="Pre-contact review" report={report} limitation="Third-party comment behavior must not be attributed to the creator. Missing evidence does not establish suitability or unsuitability.">
 <ul className="mb-3 list-disc pl-5 text-sm">{report.contentProfile?.questions.map((q,i)=><li key={i}>{q}</li>)}</ul>
 <p className="text-sm">No creator-behavior conclusion has been established from this report. Review the linked creator content in context.</p><ul className="mt-3 list-disc space-y-2 pl-5 text-sm"><li>Which products has the creator personally used, and what can they substantiate?</li><li>Which collaboration format fits your product use case?</li><li>Are there current brand exclusivity or disclosure obligations?</li><li>What are the quoted fee, deliverables, usage rights and approval terms?</li></ul>
 </Section>
 {report.derivedAllowed&&<p className="text-xs text-ink-muted">{DERIVED_DISCLOSURE}</p>}
 <footer className="text-xs leading-relaxed text-ink-muted">Generated {new Date().toISOString()} · Underlying data collected {date(report.fetchedAt)}. Refresh or delete this report and any exported copies by {date(new Date(Date.parse(report.fetchedAt)+30*86400000).toISOString())}. Exports do not update or revoke automatically. No demographic estimates, fake-subscriber percentages, sales forecasts or aggregate influence scores are produced.</footer>
 </article>;
}
