import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { archiveBrand, setDefaultBrand } from '@/app/actions/brand';
import { revokeShare } from '@/app/actions/channel';
import { BrandForm } from '@/components/brand/BrandForm';
import { PanelSection, WorkspaceLayout } from '@/components/shell/WorkspaceLayout';
import { WorkspaceForm } from '@/components/settings/WorkspaceForm';
import { Badge } from '@/components/ui/Badge';
import { getViewer } from '@/lib/access/viewer';
import { getBrands } from '@/lib/data/brands';
import { countryName, languageName } from '@/lib/locale/vocabulary';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

const SECTIONS = [
  ['workspace', 'Workspace'],
  ['brands', 'Brand profiles'],
  ['sharing', 'Sharing and reports'],
] as const;

type Section = (typeof SECTIONS)[number][0];

/**
 * Three sections, one at a time.
 *
 * It used to be one long column: a workspace form, a paragraph of OPERATOR
 * CONFIGURATION about YouTube approval, and a list of share links. The middle
 * one is gone from here entirely — a customer cannot act on it, there is no
 * control beside it, and its only effect was to suggest that restricted
 * analysis is something an ordinary user might switch on. It is not, and where
 * a gated feature is actually encountered the surface there says so in a line.
 * Deployment configuration belongs in the README.
 *
 * Sections are LINKS rather than client state so a colleague can be sent
 * straight to Brands, and so the browser back button does what it looks like it
 * does.
 */
export default async function Settings({ searchParams }: { searchParams: { section?: string } }) {
  const viewer = await getViewer();
  if (!viewer.organization) redirect('/signin');

  const section: Section = (SECTIONS.map(([id]) => id) as string[]).includes(searchParams.section ?? '')
    ? (searchParams.section as Section)
    : 'workspace';

  const [brands, shares] = await Promise.all([
    getBrands(viewer.organization.id, { includeArchived: true }),
    isSupabaseConfigured()
      ? createSessionClient()
          .from('report_shares')
          .select('token,created_at,expires_at')
          .eq('organization_id', viewer.organization.id)
          .order('created_at', { ascending: false })
          .then((r) => r.data ?? [])
      : Promise.resolve([] as { token: string; created_at: string; expires_at: string }[]),
  ]);

  const live = brands.filter((b) => b.archivedAt === null);
  const archived = brands.filter((b) => b.archivedAt !== null);

  const agency = viewer.organization.customerType === 'agency';

  return (
    <WorkspaceLayout
      panel={
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-4">
          <PanelSection>
            <p className="rail">Settings</p>
            <h1 className="mt-1.5 text-[17px] font-semibold tracking-tight text-ink">
              {viewer.organization.name}
            </h1>
            <p className="mt-1 text-[12px] text-ink-muted">
              {viewer.organization.customerType === null
                ? // Null is not "brand": every workspace made before the
                  // question was asked stores null, and saying so is the
                  // difference between a default and an answer nobody gave.
                  'Account type not set'
                : agency
                  ? 'Agency — campaigns for client brands'
                  : 'Brand — campaigns for your own products'}
            </p>
          </PanelSection>

          <PanelSection title="Sections">
            <nav aria-label="Settings sections">
              <ul className="space-y-0.5">
                {SECTIONS.map(([id, title]) => (
                  <li key={id}>
                    <Link
                      href={`/settings?section=${id}`}
                      aria-current={section === id ? 'page' : undefined}
                      className={`block rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                        section === id
                          ? 'bg-indigo-wash font-medium text-indigo'
                          : 'text-ink-muted hover:bg-paper hover:text-ink'
                      }`}
                    >
                      {title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </PanelSection>

          <PanelSection title="What stays private">
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Briefs, notes, fees and brand profiles stay in this workspace and are excluded from
              shares and exports by default.
            </p>
          </PanelSection>
        </div>
      }
    >
      {section === 'workspace' ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-[15px] font-semibold text-ink">Workspace</h2>
          <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-ink-muted">
            An agency runs campaigns for client brands; a brand runs its own.
          </p>
          <WorkspaceForm name={viewer.organization.name} customerType={viewer.organization.customerType} />
        </section>
      ) : null}

      {section === 'brands' ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-[15px] font-semibold text-ink">Brands</h2>
            <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-ink-muted">
              Saved once and reused across searches and campaigns.{' '}
              {viewer.organization.customerType === 'agency' ? 'One per client.' : 'One per product line.'}
            </p>

            {live.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-ink-muted">
                No brands yet. Searching works without one; a brand saves retyping.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
                {live.map((brand) => (
                  <li key={brand.id} className="px-3 py-3">
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium text-ink">{brand.name}</span>
                          {viewer.organization!.defaultBrandId === brand.id ? (
                            <Badge tone="indigo">Default</Badge>
                          ) : null}
                          {brand.categories.slice(0, 2).map((category) => (
                            <span key={category} className="text-[11px] text-ink-faint">
                              {category}
                            </span>
                          ))}
                        </div>
                        {brand.sells ? (
                          <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-muted">{brand.sells}</p>
                        ) : null}
                        {brand.markets.length || brand.contentLanguages.length ? (
                          <p className="mt-0.5 text-[11px] text-ink-faint">
                            {[
                              brand.markets.map(countryName).join(', '),
                              brand.contentLanguages.map(languageName).join(', '),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {viewer.organization!.defaultBrandId === brand.id ? null : (
                          <form action={setDefaultBrand}>
                            <input type="hidden" name="brandId" value={brand.id} />
                            <button
                              type="submit"
                              className="min-h-8 rounded-lg border border-line-strong bg-surface px-2.5 text-[12px] font-medium text-ink hover:bg-paper"
                            >
                              Make default
                            </button>
                          </form>
                        )}
                        <form action={archiveBrand}>
                          <input type="hidden" name="brandId" value={brand.id} />
                          <button
                            type="submit"
                            className="min-h-8 rounded-lg px-2 text-[12px] text-ink-muted hover:text-ink"
                            title="Hides it from selectors. Campaigns and their history are kept."
                          >
                            Archive
                          </button>
                        </form>
                      </div>
                    </div>

                    <details className="mt-2">
                      <summary className="cursor-pointer text-[12px] text-ink-muted underline-offset-4 hover:text-ink hover:underline">
                        Edit
                      </summary>
                      <div className="mt-3 border-t border-line pt-3">
                        <BrandForm brand={brand} customerType={viewer.organization!.customerType} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}

            <details className="mt-4" open={live.length === 0}>
              <summary className="cursor-pointer text-[13px] font-medium text-indigo">
                {viewer.organization.customerType === 'agency' ? 'Add another client brand' : 'Add another brand'}
              </summary>
              <div className="mt-3 border-t border-line pt-4">
                <BrandForm
                  customerType={viewer.organization.customerType}
                  workspaceName={viewer.organization.name}
                  makeDefault={live.length === 0}
                />
              </div>
            </details>
          </div>

          {archived.length ? (
            <div className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-[15px] font-semibold text-ink">Archived</h2>
              <p className="mt-1 text-[12px] text-ink-muted">
                Hidden from pickers. Campaigns and history are untouched.
              </p>
              <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                {archived.map((brand) => (
                  <li key={brand.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">{brand.name}</span>
                    <form action={archiveBrand}>
                      <input type="hidden" name="brandId" value={brand.id} />
                      <input type="hidden" name="restore" value="true" />
                      <button type="submit" className="min-h-8 rounded-lg px-2 text-[12px] text-indigo">
                        Restore
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {section === 'sharing' ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-[15px] font-semibold text-ink">Shared reports</h2>
          <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-ink-muted">
            Revoking disables a link immediately. Copies already downloaded can’t be recalled — each
            carries its own printed deadline.
          </p>
          {shares.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-ink-muted">
              No shared links.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
              {shares.map((share) => (
                <li key={share.token}>
                  <form action={revokeShare} className="flex items-center justify-between gap-4 px-3 py-2.5">
                    <input name="token" type="hidden" value={share.token} />
                    <span className="tnum text-[12px] text-ink-muted">
                      Created {new Date(share.created_at).toLocaleDateString('en-US')} · Expires{' '}
                      {new Date(share.expires_at).toLocaleDateString('en-US')}
                    </span>
                    <button type="submit" className="min-h-8 shrink-0 rounded-lg px-2 text-[12px] text-indigo">
                      Revoke
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </WorkspaceLayout>
  );
}
