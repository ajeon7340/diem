'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { startDiscovery, type DiscoveryState } from '@/app/actions/discovery';
import { INITIAL_DISCOVERY } from '@/app/actions/state';
import { LOCALE_PARAMETER_DISCLOSURE } from '@/lib/youtube/search-contract';
import { SIMILARITY_DIMENSIONS } from '@/lib/discovery/schemas';
import { SIMILARITY_DIMENSION_LABEL, SIMILARITY_LIMIT, type DiscoveryMode } from '@/lib/discovery/types';

/**
 * One form per mode, all three posting to one action.
 *
 * The forms differ because the questions differ; what they share is that only
 * ONE FIELD IS EVER REQUIRED. Every other input narrows the search, and a
 * customer who fills in none of them gets a broad search that SAYS it is broad
 * — the same rule the campaign brief already follows, and for the same reason:
 * a required field is answered carelessly to get past the form, and a careless
 * answer is worse than an empty one because nothing downstream can tell them
 * apart.
 */

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="primary-action disabled:opacity-60">
      {pending ? 'Searching…' : children}
    </button>
  );
}

const field = 'min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint';
const label = 'block text-[12px] font-medium text-ink';
const hint = 'mt-1 text-[12px] leading-relaxed text-ink-muted';

function Errors({ state }: { state: DiscoveryState }) {
  const messages = [state.message, ...Object.values(state.fieldErrors ?? {})].filter(Boolean);
  if (messages.length === 0) return null;
  return (
    <p role="alert" className="rounded-xl border border-amber/30 bg-amber-wash px-3 py-2 text-[12px] text-ink">
      {messages.join(' ')}
    </p>
  );
}

export function CriteriaForm({ campaignId }: { campaignId: string | null }) {
  const [state, action] = useFormState(startDiscovery, INITIAL_DISCOVERY);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="mode" value="criteria" />
      {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}

      <div>
        <label className={label} htmlFor="keywords">
          Topics or keywords
        </label>
        <input
          id="keywords"
          name="keywords"
          className={`${field} mt-1.5`}
          placeholder="home espresso, coffee gear review"
          maxLength={400}
        />
        <p className={hint}>
          One search per term, in your own words, sent to YouTube exactly as typed. Separate with commas.
        </p>
      </div>

      <div>
        <label className={label} htmlFor="product">
          What you are selling
        </label>
        <textarea
          id="product"
          name="product"
          rows={3}
          maxLength={2000}
          className="mt-1.5 w-full rounded-xl border border-line bg-surface p-3 text-[13px] text-ink placeholder:text-ink-faint"
          placeholder="A £180 hand grinder for people making espresso at home."
        />
        <p className={hint}>Optional. Used to pick out matching words in what we retrieve.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="language">
            Content language
          </label>
          <input id="language" name="language" className={`${field} mt-1.5`} placeholder="en" maxLength={2} />
        </div>
        <div>
          <label className={label} htmlFor="market">
            Market
          </label>
          <input id="market" name="market" className={`${field} mt-1.5`} placeholder="GB" maxLength={2} />
        </div>
      </div>
      <p className="text-[12px] leading-relaxed text-ink-muted">{LOCALE_PARAMETER_DISCLOSURE}</p>

      <fieldset>
        <legend className={label}>Video length</legend>
        <p className={hint}>
          YouTube filters one length at a time. Tick more than one and the search is not narrowed by length —
          the results panel says so.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          {[
            ['short', 'Under 4 minutes'],
            ['medium', '4–20 minutes'],
            ['long', 'Over 20 minutes'],
          ].map(([value, text]) => (
            <label key={value} className="inline-flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" name="formats" value={value} className="h-4 w-4" />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="minSubscribers">
            Subscribers from
          </label>
          <input id="minSubscribers" name="minSubscribers" inputMode="numeric" className={`${field} mt-1.5 tnum`} placeholder="any" />
        </div>
        <div>
          <label className={label} htmlFor="maxSubscribers">
            Subscribers to
          </label>
          <input id="maxSubscribers" name="maxSubscribers" inputMode="numeric" className={`${field} mt-1.5 tnum`} placeholder="any" />
        </div>
        <div>
          <label className={label} htmlFor="publishedWithinDays">
            Published within
          </label>
          <select id="publishedWithinDays" name="publishedWithinDays" className={`${field} mt-1.5`} defaultValue="">
            <option value="">Any time</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">A year</option>
          </select>
        </div>
      </div>
      <p className={hint}>
        A subscriber range is applied to what the search returns, not across YouTube. The results say how many
        it removed.
      </p>

      <div>
        <label className={label} htmlFor="excludeTopics">
          Topics to exclude
        </label>
        <input id="excludeTopics" name="excludeTopics" className={`${field} mt-1.5`} placeholder="gambling, crypto" maxLength={400} />
        <p className={hint}>Dropped if the term appears in the channel name, description or a retrieved title.</p>
      </div>

      <Errors state={state} />
      <Submit>Search for creators</Submit>
    </form>
  );
}

export function SimilarForm({ campaignId }: { campaignId: string | null }) {
  const [state, action] = useFormState(startDiscovery, INITIAL_DISCOVERY);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="mode" value="similar" />
      {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}

      <div>
        <label className={label} htmlFor="channel">
          Reference channel
        </label>
        <input
          id="channel"
          name="channel"
          required
          maxLength={200}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={`${field} mt-1.5`}
          placeholder="YouTube channel URL or @handle"
        />
        <p className={hint}>Resolved and shown back to you before anything is searched for.</p>
      </div>

      <fieldset>
        <legend className={label}>What should be similar</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SIMILARITY_DIMENSIONS.map((dimension) => (
            <label key={dimension} className="inline-flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" name="dimensions" value={dimension} defaultChecked className="h-4 w-4" />
              {SIMILARITY_DIMENSION_LABEL[dimension]}
            </label>
          ))}
        </div>
        <p className={hint}>Anything we cannot evaluate is named as unevaluated rather than scored.</p>
      </fieldset>

      <p className="rounded-xl border border-line bg-paper px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
        {SIMILARITY_LIMIT}
      </p>

      <Errors state={state} />
      <Submit>Find similar channels</Submit>
    </form>
  );
}

export function CompetitorForm({ campaignId }: { campaignId: string | null }) {
  const [state, action] = useFormState(startDiscovery, INITIAL_DISCOVERY);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="mode" value="competitor" />
      {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}

      <div>
        <label className={label} htmlFor="knownCompetitors">
          Competitors you already know
        </label>
        <input
          id="knownCompetitors"
          name="knownCompetitors"
          className={`${field} mt-1.5`}
          placeholder="Comandante, 1Zpresso"
          maxLength={800}
        />
        <p className={hint}>
          Entered brands are confirmed straight away. Anything suggested has to be confirmed by you before it is
          searched for.
        </p>
      </div>

      <div>
        <label className={label} htmlFor="competitor-product">
          Your product
        </label>
        <textarea
          id="competitor-product"
          name="product"
          rows={3}
          maxLength={2000}
          className="mt-1.5 w-full rounded-xl border border-line bg-surface p-3 text-[13px] text-ink placeholder:text-ink-faint"
          placeholder="A £180 hand grinder for people making espresso at home."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="category">
            Category
          </label>
          <input id="category" name="category" className={`${field} mt-1.5`} placeholder="Coffee equipment" maxLength={200} />
        </div>
        <div>
          <label className={label} htmlFor="customerNeed">
            Main customer need
          </label>
          <input id="customerNeed" name="customerNeed" className={`${field} mt-1.5`} placeholder="Consistent grind without a benchtop machine" maxLength={500} />
        </div>
        <div>
          <label className={label} htmlFor="competitor-market">
            Market
          </label>
          <input id="competitor-market" name="market" className={`${field} mt-1.5`} placeholder="GB" maxLength={2} />
        </div>
        <div>
          <label className={label} htmlFor="pricePositioning">
            Price positioning
          </label>
          <select id="pricePositioning" name="pricePositioning" className={`${field} mt-1.5`} defaultValue="">
            <option value="">Not stated</option>
            <option value="value">Value</option>
            <option value="mid">Mid-market</option>
            <option value="premium">Premium</option>
          </select>
        </div>
      </div>

      <Errors state={state} />
      <Submit>Identify competing brands</Submit>
    </form>
  );
}

export function ModeForm({ mode, campaignId }: { mode: DiscoveryMode; campaignId: string | null }) {
  if (mode === 'similar') return <SimilarForm campaignId={campaignId} />;
  if (mode === 'competitor') return <CompetitorForm campaignId={campaignId} />;
  return <CriteriaForm campaignId={campaignId} />;
}
