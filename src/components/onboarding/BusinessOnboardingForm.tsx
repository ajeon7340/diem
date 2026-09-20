'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { createOrganization } from '@/app/actions/onboarding';
import { INITIAL_ONBOARDING_STATE } from '@/app/actions/state';
import { Button } from '@/components/ui/Button';
function Submit() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? 'Creating workspace…' : 'Create workspace'}</Button>; }
export function BusinessOnboardingForm({ channel = '' }: { channel?: string }) {
 const [state, action] = useFormState(createOrganization, INITIAL_ONBOARDING_STATE);
 const router = useRouter();
 useEffect(() => { if(state.redirectTo) router.push(state.redirectTo); }, [state,router]);
 return <form action={action} className="space-y-5">
  <input type="hidden" name="channel" value={channel} />
  <label className="block text-sm">Company or team name<input className="mt-2 w-full rounded-md border p-3" name="organizationName" autoComplete="organization" required minLength={2} maxLength={120} /></label>
  <fieldset><legend className="mb-2 text-sm">We are a</legend><div className="flex gap-6">{['brand','agency'].map(type => <label key={type} className="flex gap-2 text-sm capitalize"><input type="radio" name="customerType" value={type} required />{type}</label>)}</div></fieldset>
  <p className="text-sm text-ink-muted">Agencies can manage campaigns for multiple brands in one workspace. Next, confirm a YouTube channel for your first report.</p>
  {state.message && <p role="status" className="text-sm">{state.message}</p>}
  {state.fieldErrors?.organizationName && <p role="alert">{state.fieldErrors.organizationName}</p>}
  <Submit />
 </form>;
}
