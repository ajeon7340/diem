import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { getViewer } from '@/lib/access/viewer';
import { createSessionClient,isSupabaseConfigured } from '@/lib/supabase/server';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import { revokeShare } from '@/app/actions/channel';
import { WorkspaceForm } from '@/components/settings/WorkspaceForm';
export const dynamic='force-dynamic';
export default async function Settings() {
 const viewer=await getViewer();if(!viewer.organization)redirect('/signin');
 const shares=isSupabaseConfigured()?(await createSessionClient().from('report_shares').select('token,created_at,expires_at').eq('organization_id',viewer.organization.id).order('created_at',{ascending:false})).data??[]:[];
 return <><SiteHeader/><main className="mx-auto max-w-3xl px-6 py-10"><h1 className="text-3xl font-semibold">Settings</h1><h2 className="mt-8 font-semibold">Workspace</h2><p className="mt-3 text-sm">Briefs, notes, fees and decisions are workspace-private.</p><WorkspaceForm name={viewer.organization.name} customerType={viewer.organization.customerType}/><h2 className="mt-8 font-semibold">YouTube analysis access</h2><p className="mt-3 text-sm">{AMENDMENT_ACCEPTED?'Derived-analysis approval is configured by the operator.':'Restricted derived analyses are gated. Applicable approval must be established and configured by the operator.'}</p><h2 className="mt-8 font-semibold">Shared reports</h2><p className="my-3 text-sm">Revocation disables the link. Downloaded copies must be deleted or refreshed by their printed data deadline.</p>{shares.map(s=><form key={s.token} action={revokeShare} className="flex items-center justify-between gap-4 border-b py-4 text-sm"><input name="token" type="hidden" value={s.token}/><span>Created {new Date(s.created_at).toLocaleDateString('en-US')} · Expires {new Date(s.expires_at).toLocaleDateString('en-US')}</span><button className="text-indigo">Revoke link</button></form>)}{!shares.length&&<p className="text-sm text-ink-muted">No shared links.</p>}</main></>;
}
