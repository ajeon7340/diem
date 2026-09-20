import 'server-only';

import { cookies } from 'next/headers';

import type { Viewer } from '@/types';

/**
 * Fixture mode: who you are when no Supabase project is configured.
 *
 * This is all that survives of `lib/data/fixtures.ts`, which was 3,624 lines of
 * seeded creators, reports, offers and access grants. They existed so every
 * branch of the creator media kit — anonymous teaser, approved token, expired
 * token, directory opt-out — was walkable without an auth provider. There is no
 * media kit any more, and a fixture whose only reader has been deleted is not
 * documentation, it is a second definition of the product that nothing checks.
 *
 * What is left is the one thing fixture mode still has to answer: does this
 * visitor belong to an organisation. `npm run dev` with no env then renders the
 * campaign pages with a workspace, and every page says nothing can be saved.
 */

export const DEMO_ROLE_COOKIE = 'adfit_demo_role';

export type DemoRole = 'anonymous' | 'free_agency' | 'pro_agency';

function readDemoRole(): DemoRole {
  const value = cookies().get(DEMO_ROLE_COOKIE)?.value;
  return value === 'free_agency' || value === 'pro_agency' ? value : 'anonymous';
}

export function demoViewer(): Viewer {
  const role = readDemoRole();
  if (role === 'anonymous') {
    return { userId: null, organization: null, isProAgency: false };
  }

  return {
    userId: 'demo-agency',
    organization: {
      id: '0e000000-0000-4000-8000-00000000000f',
      name: 'Northbeam Media',
      billingPlan: role === 'pro_agency' ? 'pro_agency' : 'free',
      // A filled profile, because the demo's job is to show what a fit read
      // does when it knows who is asking. The empty-profile path is worth
      // seeing too — clear these to check it.
      industry: 'Beauty & personal care',
      sells: 'A refillable cleanser and serum line, £28–£44, sold direct and through Boots',
      audience: 'Women 22–35 in the UK and Ireland, skincare-literate, price-conscious',
      categories: ['beauty'],
      objectives: ['consideration', 'launch'],
      climatePreference: 'warm',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    isProAgency: role === 'pro_agency',
  };
}
