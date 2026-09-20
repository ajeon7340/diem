'use client';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { previewChannel, startChannel, type ChannelState } from '@/app/actions/channel';
function Submit({ children }: { children: React.ReactNode }) { const { pending }=useFormStatus(); return <button disabled={pending} className="rounded-md bg-indigo px-4 py-3 text-sm text-white disabled:opacity-50">{pending ? 'Please wait…' : children}</button>; }
export function ChannelEntry({ initial = '' }: { initial?: string }) {
 const [preview, resolve] = useFormState<ChannelState,FormData>(previewChannel,{});
 const [started,start] = useFormState<ChannelState,FormData>(startChannel,{});
 return <div className="space-y-5">
 <form action={resolve} className="flex flex-col gap-3 sm:flex-row"><label className="flex-1"><span className="sr-only">YouTube channel URL or @handle</span><input name="channel" defaultValue={initial} required maxLength={200} placeholder="YouTube channel URL or @handle" className="w-full rounded-md border p-3" /></label><Submit>Resolve channel</Submit></form>
 {preview.message && <p role="alert">{preview.message}</p>}
 {preview.channel && <div className="rounded-lg border bg-surface p-6"><div className="flex items-center gap-4">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {preview.channel.thumbnail && <img src={preview.channel.thumbnail} alt="" className="h-14 w-14 rounded-full" />}
 <div><h2 className="font-semibold">{preview.channel.title}</h2><p className="text-sm text-ink-muted">{preview.channel.handle}</p></div></div>
 <p className="my-4 text-sm">Confirm this is the channel you want to evaluate.</p>
 <form action={start} className="space-y-4"><input name="channelId" type="hidden" value={preview.channel.channelId} /><input name="refresh" type="hidden" value={preview.exists ? 'true':'false'} />
 <details><summary className="cursor-pointer text-sm">Analysis options</summary><div className="mt-3 space-y-3 text-sm"><label>Analysis period <select name="days" defaultValue="90" className="ml-2 rounded border p-2"><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option></select></label><p>Collect both formats, up to 50 recent uploads and 600 comments. Filter formats in the report without recollecting.</p></div></details>
 <div className="flex items-center gap-4"><Submit>{preview.exists ? 'Refresh analysis' : 'Confirm and analyze'}</Submit>{preview.exists && <Link className="text-indigo" href={`/channels/${preview.channel.channelId}`}>View report</Link>}</div>
 </form></div>}
 {started.message && <p role="status">{started.message}</p>}
 </div>;
}
