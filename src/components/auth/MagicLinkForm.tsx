'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { MailCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { sendMagicLink, type MagicLinkState } from '@/lib/auth/actions';
import { INITIAL_MAGIC_LINK_STATE } from '@/app/actions/state';
import type { AccountType } from '@/lib/schemas';
import { cn } from '@/lib/cn';

const FIELD = cn(
  'h-11 w-full rounded-md border border-line bg-surface px-3 text-[13px] text-ink',
  'placeholder:text-ink-faint outline-none transition-colors',
  'focus:border-indigo focus:ring-2 focus:ring-indigo/20',
);

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? 'Sending…' : label}
    </Button>
  );
}

/**
 * One form for register and sign-in: with magic links they are the same
 * request. The response is identical whether or not the address already has an
 * account, so this never reveals who is registered.
 */
export function MagicLinkForm({
  accountType,
  channel = '',
  label = 'Email me a sign-in link',
  demoMode = false,
}: {
  accountType: AccountType | null;
  channel?: string;
  label?: string;
  demoMode?: boolean;
}) {
  const [state, formAction] = useFormState<MagicLinkState, FormData>(
    sendMagicLink,
    INITIAL_MAGIC_LINK_STATE,
  );

  // Mocked delivery. Said plainly, in amber rather than the success green, and
  // with the link shown rather than followed: a screen that claims to have
  // emailed something it did not email is the one outcome worse than not
  // sending it. The token is real and single-use — only the inbox is skipped.
  if (state.status === 'sent' && state.mockLink) {
    return (
      <div className="rounded-panel border border-amber/30 bg-amber-wash px-5 py-7">
        <p className="text-[13px] font-medium text-ink">
          Email delivery is mocked on this deployment
        </p>
        <p className="mt-1.5 max-w-[46ch] text-[12px] leading-relaxed text-ink-muted">
          Nothing was sent to {state.email}. The link below is a real one-time
          sign-in token — it works once and expires like any other.
        </p>
        <a
          href={state.mockLink}
          className="mt-4 inline-flex h-10 items-center rounded-md bg-ink px-4 text-[13px] font-medium text-surface"
        >
          Open the sign-in link
        </a>
      </div>
    );
  }

  if (state.status === 'sent') {
    return (
      <div className="rounded-panel border border-emerald/30 bg-emerald-wash px-5 py-8 text-center">
        <MailCheck className="mx-auto h-7 w-7 text-emerald" aria-hidden />
        <p className="mt-3 text-[14px] font-medium text-ink">Check your inbox</p>
        <p className="tnum mx-auto mt-1.5 max-w-[40ch] text-[12px] leading-relaxed text-ink-muted">
          We sent a sign-in link to {state.email}. It expires in an hour and works once.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="channel" value={channel} />
      {accountType ? <input type="hidden" name="accountType" value={accountType} /> : null}

      <label htmlFor="email" className="rail block">
        Work email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@company.com"
        className={FIELD}
      />

      {state.status === 'error' && state.message ? (
        <p className="rounded-md border border-rose/30 bg-rose-wash px-3 py-2 text-[12px] text-rose">
          {state.message}
        </p>
      ) : null}

      <SubmitButton label={label} />

      <p className="text-center text-[11px] leading-relaxed text-ink-faint">
        {demoMode
          ? 'Fixture mode: no email is sent — submitting drops you straight into onboarding.'
          : 'No password. We email a one-time link that signs you in.'}
      </p>
    </form>
  );
}
