'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { addCandidate } from '@/app/actions/campaign';
import { previewChannel, type ChannelState } from '@/app/actions/channel';
import { INITIAL_CANDIDATE_STATE } from '@/app/actions/state';
function Submit({children}:{children:React.ReactNode}) {const {pending}=useFormStatus();return <button disabled={pending} className="rounded bg-indigo px-4 py-2 text-sm text-white">{pending?'Please wait…':children}</button>;}
export function CandidateForm({campaignId}:{campaignId:string}) {
 const [preview,resolve]=useFormState<ChannelState,FormData>(previewChannel,{});
 const [state,add]=useFormState(addCandidate,INITIAL_CANDIDATE_STATE);
 return <div className="space-y-4 p-5 print:hidden"><form action={resolve} className="flex flex-wrap gap-3"><label className="flex-1"><span className="sr-only">YouTube channel URL or handle</span><input name="channel" required maxLength={200} placeholder="YouTube channel URL or @handle" className="w-full rounded border p-2 text-sm"/></label><Submit>Resolve channel</Submit></form>
 {preview.message&&<p role="alert" className="text-sm">{preview.message}</p>}
 {preview.channel&&<form action={add} className="space-y-3 rounded border p-4"><input type="hidden" name="campaignId" value={campaignId}/><input type="hidden" name="channel" value={preview.channel.channelId}/><div className="flex items-center gap-3">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {preview.channel.thumbnail&&<img alt="" src={preview.channel.thumbnail} className="h-12 w-12 rounded-full"/>}<div><p className="font-medium">{preview.channel.title}</p><p className="text-sm text-ink-muted">{preview.channel.handle}</p></div></div><p className="text-sm">{preview.exists?'Reuse the existing report. No collection is needed.':'Confirm this channel to queue its analysis and add it to the campaign.'}</p><label className="block text-sm">Candidate-specific quoted fee (USD, optional)<input name="proposedFee" inputMode="decimal" className="ml-2 rounded border p-2"/></label><Submit>{preview.exists?'Confirm and reuse report':'Confirm and add candidate'}</Submit></form>}
 {(state.message||state.fieldErrors?.channel)&&<p role="status" className="text-sm">{state.message??state.fieldErrors?.channel}</p>}
 </div>;
}
