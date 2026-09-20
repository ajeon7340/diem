import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { DEMO_ROLE_COOKIE, type DemoRole } from '@/lib/data/demo';
import { cn } from '@/lib/cn';

const ROLES: { value: DemoRole; label: string }[] = [
  { value: 'anonymous', label: 'Anon' },
  { value: 'free_agency', label: 'Free agency' },
  { value: 'pro_agency', label: 'Pro agency' },
];

/**
 * Fixture-mode only: walks a reviewer through all three access modes without an
 * auth provider. `SiteHeader` renders it solely when Supabase is unconfigured,
 * and `demoViewer()` is the only code that reads the cookie — with a real
 * project wired up, the viewer comes from the session and this is inert.
 */
export function DemoRoleSwitcher() {
  const current = (cookies().get(DEMO_ROLE_COOKIE)?.value ?? 'anonymous') as DemoRole;

  async function setRole(formData: FormData) {
    'use server';
    const role = String(formData.get('role')) as DemoRole;
    cookies().set(DEMO_ROLE_COOKIE, role, { path: '/', httpOnly: false, sameSite: 'lax' });
    revalidatePath('/', 'layout');
  }

  return (
    <form action={setRole} className="flex items-center gap-1 rounded-md border border-line p-0.5">
      <span className="rail px-1.5">Demo</span>
      {ROLES.map((role) => (
        <button
          key={role.value}
          name="role"
          value={role.value}
          type="submit"
          className={cn(
            'rounded px-2 py-1 text-[11px] transition-colors',
            current === role.value
              ? 'bg-indigo text-white'
              : 'text-ink-muted hover:bg-paper hover:text-ink',
          )}
        >
          {role.label}
        </button>
      ))}
    </form>
  );
}
