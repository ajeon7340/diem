import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { DEMO_ROLE_COOKIE } from '@/lib/data/fixtures';

/** POST-only: a GET sign-out can be triggered by any third-party image tag. */
export async function POST(request: NextRequest) {
  if (isSupabaseConfigured()) {
    const supabase = createSessionClient();
    await supabase.auth.signOut();
  } else {
    cookies().delete(DEMO_ROLE_COOKIE);
  }

  return NextResponse.redirect(new URL('/', request.nextUrl.origin), { status: 303 });
}
