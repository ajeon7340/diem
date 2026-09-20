'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addCandidate } from '@/app/actions/campaign';
import { previewChannel, type ChannelState } from '@/app/actions/channel';
import { INITIAL_CANDIDATE_STATE } from '@/app/actions/state';

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="min-h-11 rounded-lg bg-indigo px-4 text-sm font-medium text-white hover:bg-indigo-hover disabled:opacity-50"
    >
      {pending ? 'Please wait…' : children}
    </button>
  );
}
export function CandidateForm({
  campaignId,
  onAdded,
}: {
  campaignId: string;
  onAdded?: (message: string) => void;
}) {
  const [preview, resolve] = useFormState<ChannelState, FormData>(
    previewChannel,
    {},
  );
  const [state, add] = useFormState(addCandidate, INITIAL_CANDIDATE_STATE);
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (state.status === 'ok') onAdded?.(state.message ?? 'Candidate added.');
  }, [state, onAdded]);
  useEffect(() => {
    setEdited(false);
  }, [preview]);
  return (
    <div className="space-y-5 print:hidden">
      <form action={resolve} className="space-y-3">
        <label className="block text-xs font-medium text-ink-muted">
          YouTube channel URL or @handle
          <input
            name="channel"
            required
            maxLength={200}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={() => setEdited(true)}
            placeholder="youtube.com/@creator"
            className="mt-2 w-full rounded-lg border border-line p-3 text-sm font-normal text-ink"
          />
        </label>
        <Submit>Find channel</Submit>
      </form>
      {preview.message && (
        <p role="alert" className="text-sm text-rose">
          {preview.message}
        </p>
      )}
      {preview.channel && !edited && (
        <form
          action={add}
          className="space-y-4 rounded-xl border border-line p-4"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input
            type="hidden"
            name="channel"
            value={preview.channel.channelId}
          />
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview.channel.thumbnail && (
              <img
                alt=""
                src={preview.channel.thumbnail}
                className="h-12 w-12 rounded-full"
              />
            )}
            <div>
              <p className="font-medium">{preview.channel.title}</p>
              <p className="text-xs text-ink-muted">{preview.channel.handle}</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">
            {preview.exists
              ? 'The current report will be reused.'
              : 'Adding this candidate starts public channel analysis.'}
          </p>
          <Submit>Add candidate</Submit>
        </form>
      )}
      {(state.message || state.fieldErrors?.channel) && (
        <p role="status" className="text-sm text-ink-muted">
          {state.message ?? state.fieldErrors?.channel}
        </p>
      )}
    </div>
  );
}
