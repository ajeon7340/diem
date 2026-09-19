'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { Check, LoaderCircle, Search, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import {
  checkHandleAvailability,
  createCreatorProfile,
  resolveChannelPreview,
  type OnboardingState,
} from '@/app/actions/onboarding';
import { INITIAL_ONBOARDING_STATE } from '@/app/actions/state';
import { CREATOR_NICHES } from '@/types';
import { compactNumber } from '@/lib/format';
import { cn } from '@/lib/cn';

const FIELD = cn(
  'h-10 w-full rounded-md border border-line bg-surface px-3 text-[13px] text-ink',
  'placeholder:text-ink-faint outline-none transition-colors',
  'focus:border-indigo focus:ring-2 focus:ring-indigo/20',
);

interface Channel {
  channelId: string;
  youtubeHandle: string;
  title: string;
  subscribers: number | null;
  thumbnail: string | null;
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="rail block">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1 text-[11px] text-rose">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] leading-snug text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

function SubmitButton({ blocked, children }: { blocked: boolean; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending || blocked} className="w-full">
      {pending ? 'Reading your channel…' : children}
    </Button>
  );
}

/**
 * Creator signup, in one screen, starting from the channel.
 *
 * The old form opened on "Handle" — a field whose rules are ours and whose
 * consequence is a permanent URL — and asked for the channel fourth. So the
 * first thing a creator did was invent an identifier, and the thing that makes
 * the product work at all was optional and below the fold.
 *
 * It starts from the channel now, and everything the channel can answer is
 * answered from it: display name, handle, subscriber count. The creator
 * corrects rather than composes.
 */
export function CreatorOnboardingForm() {
  const router = useRouter();
  const [state, formAction] = useFormState<OnboardingState, FormData>(
    createCreatorProfile,
    INITIAL_ONBOARDING_STATE,
  );

  const [url, setUrl] = useState('');
  const [channel, setChannel] = useState<Channel | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, startLookup] = useTransition();

  const [handle, setHandle] = useState('');
  const [handleState, setHandleState] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle');
  const [handleReason, setHandleReason] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [singlePrice, setSinglePrice] = useState(true);

  useEffect(() => {
    if (state.status === 'success' && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  // Availability is advisory: the unique index and the reserved-handle CHECK
  // are what actually decide, and the server maps both to an inline error.
  useEffect(() => {
    const candidate = handle.trim().replace(/^@+/, '').toLowerCase();
    if (candidate.length < 3) {
      setHandleState('idle');
      return;
    }
    setHandleState('checking');
    const timer = setTimeout(() => {
      void checkHandleAvailability(candidate).then((result) => {
        setHandleState(result.available ? 'free' : 'taken');
        setHandleReason(result.reason ?? null);
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [handle]);

  function lookup() {
    if (!url.trim()) return;
    setLookupError(null);
    startLookup(async () => {
      const result = await resolveChannelPreview(url);
      if (!result.ok || !result.channel) {
        setChannel(null);
        setLookupError(result.message ?? 'Could not read that channel.');
        return;
      }
      setChannel(result.channel);
      setDisplayName((current) => current || result.channel!.title);
      // Null when nothing safe could be derived — a Korean or Japanese handle
      // has no ASCII form and a transliteration would be a guess embedded in
      // their permanent URL. The field stays empty and they choose.
      if (result.suggestedHandle) setHandle((current) => current || result.suggestedHandle!);
    });
  }

  // Submitting with an unresolved URL in the box posts the raw string, which
  // the schema then rejects with "Check the highlighted fields" — a validation
  // error for a link that was never checked. Blurring the field starts a
  // lookup, so clicking straight through used to race it.
  //
  // Empty is still allowed: a creator with no channel can finish signing up,
  // which is why `youtubeHandle` is optional in the first place.
  const needsLookup = url.trim().length > 0 && channel === null;

  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-2.5">
      {/* --- 1. The channel, and what we found in it ----------------------
          Side by side. The acknowledgement is a response to the field beside
          it, and stacking them cost a whole row on a form that has to fit one
          screen. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Your YouTube channel"
          htmlFor="youtubeHandle"
          error={lookupError ?? errors.youtubeHandle}
          hint={channel ? undefined : 'Paste your channel address.'}
        >
          <div className="flex gap-2">
            <input
              id="youtubeHandle"
              name="youtubeHandle"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => !channel && lookup()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Enter means "look it up", not "submit with three empty
                  // fields below".
                  e.preventDefault();
                  lookup();
                }
              }}
              placeholder="youtube.com/@yourchannel"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={FIELD}
            />
            <button
              type="button"
              onClick={lookup}
              disabled={looking || !url.trim()}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-line px-3',
                'text-[12px] font-medium text-ink transition-colors hover:bg-paper disabled:opacity-50',
              )}
            >
              {looking ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Search className="h-3.5 w-3.5" aria-hidden />
              )}
              Find
            </button>
          </div>
        </Field>

        {/* A lookup that silently fills two fields leaves the creator unsure
            whether we found THEIR channel. The subscriber count is the thing
            they can check at a glance. */}
        {channel ? (
          <div className="flex items-center gap-2.5 self-end rounded-panel border border-emerald/30 bg-emerald-wash px-3 py-2">
            {channel.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channel.thumbnail} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full" />
            ) : (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink/5 text-[11px] text-ink-muted">
                {channel.title.slice(0, 1)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-[12px] font-medium text-ink">
                <Check className="h-3 w-3 shrink-0 text-emerald" aria-hidden />
                <span className="truncate">{channel.title}</span>
              </span>
              <span className="tnum block truncate text-[10px] text-ink-muted">
                {channel.youtubeHandle}
                {channel.subscribers !== null
                  ? ` · ${compactNumber(channel.subscribers)} subs`
                  : ' · subs hidden'}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                setChannel(null);
                setLookupError(null);
              }}
              className="shrink-0 text-[10px] text-ink-faint underline-offset-4 hover:underline"
            >
              Not me
            </button>
          </div>
        ) : null}
      </div>

      {/* --- 2. Identity, proposed from the channel ------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" htmlFor="displayName" error={errors.displayName}>
          <input
            id="displayName"
            name="displayName"
            required
            maxLength={80}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your channel name"
            className={FIELD}
          />
        </Field>

        <Field
          label="Profile handle"
          htmlFor="handle"
          error={
            errors.handle ??
            (handleState === 'taken' ? (handleReason ?? 'That handle is taken') : undefined)
          }
          hint={handleState === 'free' ? 'Free — this becomes your URL.' : 'adfit.com/@…'}
        >
          <div
            className={cn(
              'flex h-10 items-center rounded-md border bg-surface pr-2.5 transition-colors',
              'focus-within:ring-2 focus-within:ring-indigo/20',
              handleState === 'taken' || errors.handle
                ? 'border-rose'
                : handleState === 'free'
                  ? 'border-emerald'
                  : 'border-line',
            )}
          >
            <span className="pl-3 text-[13px] text-ink-faint">@</span>
            <input
              id="handle"
              name="handle"
              required
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourname"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent px-1 text-[13px] text-ink outline-none placeholder:text-ink-faint"
            />
            {handleState === 'checking' ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-ink-faint" aria-hidden />
            ) : handleState === 'free' ? (
              <Check className="h-3.5 w-3.5 text-emerald" aria-hidden />
            ) : handleState === 'taken' ? (
              <TriangleAlert className="h-3.5 w-3.5 text-rose" aria-hidden />
            ) : null}
          </div>
        </Field>
      </div>

      {/* --- 3. Niche and price ------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Niche"
          htmlFor="niche"
          error={errors.niche}
          hint="Agencies filter on this."
        >
          <select id="niche" name="niche" required defaultValue="" className={cn(FIELD, 'pr-8')}>
            <option value="" disabled>
              Choose one
            </option>
            {CREATOR_NICHES.map((niche) => (
              <option key={niche} value={niche}>
                {niche}
              </option>
            ))}
          </select>
        </Field>

        {/* A price or a range, because both are real answers. Asking for two
            numbers from someone who charges one made them type the same figure
            twice or leave the field blank — and a blank one drops them out of
            every budget filter in the directory. */}
        <Field
          label="What a placement costs"
          htmlFor="budgetMin"
          error={errors.budgetMin ?? errors.budgetMax}
          hint="Never blocks a request."
        >
          <div className="flex items-center gap-2">
            <input
              id="budgetMin"
              name="budgetMin"
              inputMode="numeric"
              placeholder="15,000"
              aria-label={singlePrice ? 'Price' : 'Lower end'}
              className={cn(FIELD, 'tnum')}
            />
            {singlePrice ? (
              <button
                type="button"
                onClick={() => setSinglePrice(false)}
                className="shrink-0 whitespace-nowrap text-[11px] text-indigo underline-offset-4 hover:underline"
              >
                + range
              </button>
            ) : (
              <>
                <span className="shrink-0 text-[13px] text-ink-faint">to</span>
                <input
                  name="budgetMax"
                  inputMode="numeric"
                  placeholder="25,000"
                  aria-label="Upper end"
                  className={cn(FIELD, 'tnum')}
                />
              </>
            )}
          </div>
        </Field>
      </div>

      {/* No bio here on purpose.
          Nothing downstream needs it: the profile renders without one, the
          directory does not filter on it, and the report does not read it. It
          is the only field on this form a creator could not answer from what
          they already know, so it was the one they stopped at — and it is
          editable in Settings the moment they land. */}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-2.5 rounded-panel border border-line bg-paper px-3.5 py-2.5">
          <input
            type="checkbox"
            name="isDirectoryVisible"
            defaultChecked
            className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-indigo"
          />
          <span>
            <span className="block text-[12px] font-medium text-ink">List me in the directory</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">
              Pro agencies can find you. Off means link-only.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-panel border border-line bg-paper px-3.5 py-2.5">
          <input
            type="checkbox"
            name="budgetNegotiable"
            className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-indigo"
          />
          <span>
            <span className="block text-[12px] font-medium text-ink">Rather not say a price</span>
            {/* Said plainly rather than sold. Withholding is a real choice and
                sometimes the right one; it also drops you out of every budget
                filter, and that is worth knowing before ticking it. */}
            <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">
              Brands filtering by budget will not see you.
            </span>
          </span>
        </label>
      </div>

      {state.status === 'error' && state.message ? (
        <p className="rounded-md border border-rose/30 bg-rose-wash px-3 py-2 text-[12px] text-rose">
          {state.message}
        </p>
      ) : null}

      <SubmitButton blocked={needsLookup}>
        {needsLookup ? 'Confirm your channel to continue' : 'Publish my media kit'}
      </SubmitButton>

      {/* One line, and it still says where the bio went: a field that
          disappears without a word reads as one that no longer exists. */}
      <p className="text-center text-[11px] leading-snug text-ink-faint">
        Publishes immediately. Bio and demographics come later.
      </p>
    </form>
  );
}
