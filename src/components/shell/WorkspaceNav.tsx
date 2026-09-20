'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartNoAxesCombined, FolderOpen, Settings2, Telescope } from 'lucide-react';

const links = [
  // First, because it is where the work now starts: a customer who does not yet
  // know which channels to evaluate had no entry point at all before discovery.
  { href: '/discover', label: 'Discover creators', icon: Telescope },
  { href: '/channels', label: 'Channel analysis', icon: ChartNoAxesCombined },
  { href: '/campaigns', label: 'Campaigns', icon: FolderOpen },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];
export function WorkspaceNav() {
  const pathname = usePathname();
  return <nav aria-label="Main navigation" className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
    {links.map(({ href, label, icon: Icon }) => {
      const active = pathname === href || pathname.startsWith(`${href}/`);
      return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${active ? 'bg-indigo-wash text-indigo' : 'text-ink-muted hover:bg-paper hover:text-ink'}`}><Icon size={15} aria-hidden />{label}</Link>;
    })}
  </nav>;
}
