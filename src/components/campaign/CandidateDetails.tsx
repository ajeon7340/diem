'use client';
import { useFormState,useFormStatus } from 'react-dom';
import { updateCandidateDetails } from '@/app/actions/campaign';
import { INITIAL_CANDIDATE_STATE } from '@/app/actions/state';
function Submit(){const{pending}=useFormStatus();return <button disabled={pending} className="rounded border px-3 py-2 text-sm text-indigo">{pending?'Saving…':'Save private details'}</button>;}
export function CandidateDetails({candidateId,campaignId,fee,notes}:{candidateId:string;campaignId:string;fee:number|null;notes:string|null}){
 const[state,action]=useFormState(updateCandidateDetails,INITIAL_CANDIDATE_STATE);
 return <details className="border-t p-5 print:hidden"><summary className="cursor-pointer text-sm">Private notes and quoted fee</summary><form action={action} className="mt-3 space-y-3"><input name="candidateId" value={candidateId} type="hidden"/><input name="campaignId" value={campaignId} type="hidden"/><label className="block text-sm">Quoted fee (USD, optional)<input name="proposedFee" inputMode="decimal" defaultValue={fee??''} className="ml-2 rounded border p-2"/></label><label className="block text-sm">Internal notes<textarea name="notes" maxLength={4000} defaultValue={notes??''} className="mt-1 w-full rounded border p-2" rows={3}/></label><Submit/>{state.message&&<p role="status" className="text-sm">{state.message}</p>}</form></details>;
}
