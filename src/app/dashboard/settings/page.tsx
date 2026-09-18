import type { Metadata } from 'next';
import Link from 'next/link';

import { getViewer } from '@/lib/access/viewer';
import { getCreatorHandle } from '@/lib/data/requests';
import { getCreatorByHandle } from '@/lib/access/gatekeeper';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { SettingsForm } from '@/components/dashboard/SettingsForm';
import { Panel } from '@/components/ui/Panel';
import { fixtureCreator } from '@/lib/data/fixtures';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const viewer = await getViewer();

  if (!viewer.creatorId) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="rail">Creator only</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">
            Sign in as a creator
          </h1>
          <Link href="/" className="mt-6 text-[13px] text-indigo underline-offset-4 hover:underline">
            Back to adfit
          </Link>
        </main>
      </div>
    );
  }

  const handle = isSupabaseConfigured()
    ? await getCreatorHandle(viewer.creatorId)
    : 'marahwoods';
  const creator = handle
    ? isSupabaseConfigured()
      ? await getCreatorByHandle(handle)
      : fixtureCreator(handle)
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="relative flex-1">
        <div className="grid-rule pointer-events-none absolute inset-x-0 top-0 h-40" aria-hidden />

        <div className="relative mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
          <p className="rail">Dashboard</p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">Settings</h1>
          <DashboardNav active="/dashboard/settings" />

          <div className="mt-8 space-y-4">
            <Panel
              title="Public profile"
              meta={creator ? `/@${creator.handle}` : undefined}
            >
              {creator ? (
                <SettingsForm creator={creator} />
              ) : (
                <p className="px-5 py-12 text-center text-[13px] text-ink-muted">
                  Could not load your profile.
                </p>
              )}
            </Panel>

            <Panel title="Connected accounts" meta="not yet built">
              <div className="px-5 py-6">
                <p className="text-[13px] leading-relaxed text-ink-muted">
                  YouTube and Instagram connection is the next thing to build. Until it ships,
                  verification and the AI report are populated by the ingestion worker rather than
                  self-service OAuth.
                </p>
              </div>
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
}
