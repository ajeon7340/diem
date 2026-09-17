import { AlertTriangle, Clock, EyeOff, KeyRound, Building2, LockKeyhole, UserRound } from 'lucide-react';

import type { AccessMode } from '@/types';
import { daysUntil, shortDate } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * States exactly why the visitor sees what they see. An expired link is named
 * as expired — the holder had a real grant and deserves a better dead end than
 * a generic lock.
 */
export function AccessBanner({ access }: { access: AccessMode }) {
  if (access.mode === 'token') {
    return (
      <Bar tone="emerald" icon={KeyRound}>
        <span>
          Full report unlocked for{' '}
          <strong className="font-medium">{access.grant.companyName}</strong>
        </span>
        <span className="tnum ml-auto text-[11px] text-ink-faint">
          Expires {shortDate(access.grant.expiresAt)} · {daysUntil(access.grant.expiresAt)}d left
        </span>
      </Bar>
    );
  }

  if (access.mode === 'pro_agency') {
    return (
      <Bar tone="indigo" icon={Building2}>
        <span>
          Unlocked via <strong className="font-medium">{access.organization.name}</strong> Pro
          Agency — this creator opted into the directory
        </span>
        <span className="tnum ml-auto text-[11px] text-ink-faint">No approval needed</span>
      </Bar>
    );
  }

  if (access.mode === 'owner') {
    return (
      <Bar tone="slate" icon={UserRound}>
        <span>You&apos;re viewing your own profile. Brands see the locked version below.</span>
      </Bar>
    );
  }

  if (access.reason === 'no_token') return null;

  const COPY = {
    expired: {
      icon: Clock,
      tone: 'amber' as const,
      title: 'This access link has expired',
      body: 'Time-limited links close automatically. Send a new proposal to receive a fresh link.',
    },
    invalid_token: {
      icon: AlertTriangle,
      tone: 'rose' as const,
      title: 'This access link is not valid for this profile',
      body: 'It may have been revoked, may still be awaiting approval, or may belong to a different creator.',
    },
    report_pending: {
      icon: LockKeyhole,
      tone: 'slate' as const,
      title: 'Access granted, but the report is still generating',
      body: 'The AI pipeline runs after the creator connects their accounts. Check back shortly.',
    },
    not_directory_visible: {
      icon: EyeOff,
      tone: 'slate' as const,
      title: 'This creator has not opted into the agency directory',
      body: 'Pro instant access only covers directory-visible creators. Send a 1:1 proposal instead — it is free.',
    },
  };

  const { icon: Icon, tone, title, body } = COPY[access.reason];

  return (
    <Bar tone={tone} icon={Icon} align="start">
      <div>
        <p className="text-[12px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[12px] text-ink-muted">{body}</p>
      </div>
    </Bar>
  );
}

const TONES = {
  emerald: 'border-emerald/30 bg-emerald-wash',
  indigo: 'border-indigo/25 bg-indigo-wash',
  amber: 'border-amber/30 bg-amber-wash',
  rose: 'border-rose/30 bg-rose-wash',
  slate: 'border-line bg-surface',
} as const;

const ICON_TONES = {
  emerald: 'text-emerald',
  indigo: 'text-indigo',
  amber: 'text-amber',
  rose: 'text-rose',
  slate: 'text-ink-faint',
} as const;

function Bar({
  tone,
  icon: Icon,
  align = 'center',
  children,
}: {
  tone: keyof typeof TONES;
  icon: typeof KeyRound;
  align?: 'center' | 'start';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-panel border px-4 py-3 text-[12px] text-ink',
        TONES[tone],
        align === 'center' ? 'flex-wrap items-center' : 'items-start',
      )}
    >
      <Icon
        className={cn('h-4 w-4 shrink-0', ICON_TONES[tone], align === 'start' && 'mt-0.5')}
        aria-hidden
      />
      {children}
    </div>
  );
}
