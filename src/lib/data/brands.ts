import 'server-only';

import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Reading brands back.
 *
 * Under the CUSTOMER's session throughout, never the service role. An agency's
 * client list is competitive information and RLS is what keeps it inside the
 * workspace; a read that used the service key and filtered by organisation in
 * TypeScript would behave identically right up until the day somebody forgot
 * the filter.
 */

export interface Brand {
  id: string;
  name: string;
  sells: string | null;
  categories: string[];
  website: string | null;
  customerNeeds: string | null;
  /** ISO codes. Always rendered through the vocabulary, never shown raw. */
  markets: string[];
  contentLanguages: string[];
  archivedAt: string | null;
  createdAt: string;
}

export async function getBrands(
  organizationId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<Brand[]> {
  if (!isSupabaseConfigured()) return [];
  let query = createSessionClient()
    .from('brands')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });
  if (!includeArchived) query = query.is('archived_at', null);

  const { data, error } = await query.returns<Record<string, unknown>[]>();
  if (error) {
    console.error('[brands] query failed', error.message);
    return [];
  }
  return (data ?? []).map(toBrand);
}

export async function getBrand(id: string): Promise<Brand | null> {
  if (!isSupabaseConfigured() || !id) return null;
  // RLS decides visibility: a brand belonging to another workspace simply does
  // not come back, so there is no authorisation check to forget here.
  const { data } = await createSessionClient()
    .from('brands')
    .select('*')
    .eq('id', id)
    .maybeSingle<Record<string, unknown>>();
  return data ? toBrand(data) : null;
}

function toBrand(row: Record<string, unknown>): Brand {
  return {
    id: row.id as string,
    name: row.name as string,
    sells: (row.sells as string) ?? null,
    categories: (row.categories as string[]) ?? [],
    website: (row.website as string) ?? null,
    customerNeeds: (row.customer_needs as string) ?? null,
    markets: (row.markets as string[]) ?? [],
    contentLanguages: (row.content_languages as string[]) ?? [],
    archivedAt: (row.archived_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

/**
 * Which brand a surface should start on.
 *
 * The one explicitly asked for, else the workspace default, else the first
 * unarchived brand, else none. Never a guess from a name: two brands called
 * "Northbeam" in one agency are two clients, and picking either by string match
 * is the merge this whole table is built to avoid.
 */
export function pickBrand(brands: Brand[], requested: string | null, defaultId: string | null): Brand | null {
  const live = brands.filter((b) => b.archivedAt === null);
  return (
    live.find((b) => b.id === requested) ??
    live.find((b) => b.id === defaultId) ??
    live[0] ??
    null
  );
}
