import { SiteHeader } from '@/components/shell/SiteHeader';
import { ChannelReport } from '@/components/channel/ChannelReport';
import { PrintReport } from '@/components/channel/ReportActions';
import type { ChannelReportView } from '@/lib/channel/report';
export const dynamic='force-dynamic';
export default function Sample() {
 const now=Date.now();
 const report:ChannelReportView={channelId:'sample',title:'Everyday Workshop',handle:'Fictional sample channel',avatar:null,description:'An illustrative channel about practical home repairs, tools and weekend projects.',subscribers:42000,fetchedAt:new Date(now).toISOString(),start:new Date(now-90*86400000).toISOString(),end:new Date(now).toISOString(),windowDays:90,
 videos:['A beginner’s tool kit','Repairing a loose cabinet hinge','Choosing a drill for small projects','Weekend shelf build'].map((title,i)=>({id:`sample-${i}`,title,publishedAt:new Date(now-(i+1)*12*86400000).toISOString(),views:[18000,22000,12000,31000][i],seconds:[480,120,620,900][i],format:i===1?'short':'long'})),comments:0,unreadable:0,truncated:false,promotions:[],clusters:[],derivedAllowed:false,analysedAt:null};
 return <><SiteHeader/><main className="report-page mx-auto max-w-5xl px-6 py-10"><div className="print:hidden"><PrintReport/></div><ChannelReport report={report} sample/></main></>;
}
