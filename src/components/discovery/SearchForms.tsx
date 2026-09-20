'use client';

import { useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Search } from 'lucide-react';

import { saveSearchAsBrandDefaults } from '@/app/actions/brand';
import { startDiscovery, type DiscoveryState } from '@/app/actions/discovery';
import { COUNTRIES, LANGUAGES } from '@/lib/locale/vocabulary';
import { PROVENANCE_LABEL, type SearchContext } from '@/lib/discovery/context';
import { INITIAL_DISCOVERY } from '@/app/actions/state';
import { LOCALE_PARAMETER_DISCLOSURE } from '@/lib/youtube/search-contract';
import { SIMILARITY_DIMENSIONS } from '@/lib/discovery/schemas';
import { SIMILARITY_DIMENSION_LABEL, SIMILARITY_LIMIT, type DiscoveryMode } from '@/lib/discovery/types';

/**
 * One form per mode, all three posting to one action, all three shaped for a
 * 300px column.
 *
 * WHAT CHANGED FROM THE FIRST VERSION, and why. It was a full-width card with
 * every input at the same weight and every caveat printed beside its field.
 * Read down a narrow rail that is a wall: eleven controls, six paragraphs, and
 * the Search button somewhere past the fold. Now the required input comes
 * first, everything optional folds into "More filters", and the long sentences
 * move to `title` help on the control they qualify — they are still one hover
 * or one focus away, which is where a caveat about a field belongs.
 *
 * NOTHING IS DROPPED. Every input the action accepts is still here, because
 * hiding a filter is not the same as simplifying a form.
 *
 * THE SUBMIT AND RESET NEVER SCROLL. They sit in a footer outside the scroll
 * region — see `FilterPanel` — so a long filter list cannot put Search below
 * the fold.
 *
 * NO REQUEST FIRES WHILE TYPING. Every one of these is a plain form submit, so
 * the quota is spent when somebody asks for it and never on a keystroke.
 */

export interface FilterDefaults {
  keywords?: string;
  customerNeed?: string;
  product?: string;
  language?: string;
  market?: string;
  formats?: string[];
  minSubscribers?: string;
  maxSubscribers?: string;
  publishedWithinDays?: string;
  excludeTopics?: string;
  channel?: string;
  dimensions?: string[];
  category?: string;
  pricePositioning?: string;
  knownCompetitors?: string;
}

const field =
  'min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-faint';
const label = 'block text-[12px] font-medium text-ink';
const help = 'mt-1 text-[11px] leading-relaxed text-ink-muted';
const scroll = 'min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4';

/**
 * Where a prefilled value came from.
 *
 * A field that filled itself in with no explanation reads as something the
 * customer typed and forgot, and the reflex is to edit it rather than trust it.
 * Three words fixes that.
 */
function From({ context, field: key }: { context?: SearchContext; field: keyof FilterDefaults }) {
  const source = context?.provenance?.[key];
  if (!source || source === 'search') return null;
  return <span className="ml-1.5 font-normal text-ink-faint">· {PROVENANCE_LABEL[source]}</span>;
}

/**
 * A market or language picker, named rather than coded.
 *
 * The brand's own saved values come first, because they are the likely answer;
 * the full vocabulary follows. ONE AT A TIME because that is what the API
 * takes — `regionCode` and `relevanceLanguage` are single-valued — so a brand
 * that sells in four markets picks which one this search is about.
 */
function LocalePicker({
  id,
  name,
  label: text,
  options,
  preferred,
  defaultValue,
  context,
  field: key,
  anyLabel,
}: {
  id: string;
  name: string;
  label: string;
  options: { code: string; name: string }[];
  preferred: string[];
  defaultValue?: string;
  context?: SearchContext;
  field: keyof FilterDefaults;
  anyLabel: string;
}) {
  const saved = options.filter((option) => preferred.includes(option.code));
  const rest = options.filter((option) => !preferred.includes(option.code));
  return (
    <div>
      <label className={label} htmlFor={id}>
        {text}
        <From context={context} field={key} />
      </label>
      <select id={id} name={name} defaultValue={defaultValue ?? ''} className={`${field} mt-1.5`}>
        <option value="">{anyLabel}</option>
        {saved.length ? (
          <optgroup label="Saved on this brand">
            {saved.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label="All">
          {rest.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

/**
 * Topic chips built from what the customer already wrote on the brand and the
 * campaign. Clicking one APPENDS it to the topics field, which stays editable —
 * topics describe what this search is exploring, not a permanent attribute of
 * the company.
 */
function TopicSuggestions({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (term: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] text-ink-muted">From your brand and campaign — click to add:</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {suggestions.map((term) => (
          <li key={term}>
            <button
              type="button"
              onClick={() => onPick(term)}
              className="rounded-md border border-line bg-paper px-2 py-1 text-[11px] text-ink-muted hover:border-line-strong hover:text-ink"
            >
              + {term}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Write the current market, language and product line back to the brand.
 *
 * A NAMED BUTTON, never a side effect of searching. `formAction` sends this one
 * submit to a different server action, so the same fields the customer is
 * looking at are what gets saved — and nothing is saved unless they press it.
 */
function SaveAsBrandDefaults() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={saveSearchAsBrandDefaults}
      disabled={pending}
      className="text-[11px] text-ink-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
      title="Saves what you sell, the market and the language onto this brand. Topics stay with the search."
    >
      Save as brand defaults
    </button>
  );
}

/** The optional half, folded away. Open once something inside it is set. */
function MoreFilters({ children, open }: { children: React.ReactNode; open: boolean }) {
  return (
    <details open={open} className="rounded-lg border border-line bg-paper">
      <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-ink">More filters</summary>
      <div className="space-y-4 border-t border-line px-3 py-3">{children}</div>
    </details>
  );
}

function Footer({ state }: { state: DiscoveryState }) {
  const { pending } = useFormStatus();
  const messages = [state.message, ...Object.values(state.fieldErrors ?? {})].filter(Boolean);

  return (
    <div className="shrink-0 border-t border-line bg-surface px-4 py-3">
      {messages.length ? (
        <p role="alert" className="mb-2.5 rounded-lg border border-amber/30 bg-amber-wash px-2.5 py-2 text-[12px] leading-relaxed text-ink">
          {messages.join(' ')}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="primary-action flex-1 disabled:opacity-60">
          {pending ? 'Searching…' : (<><Search size={15} aria-hidden /> Search</>)}
        </button>
        {/* Native reset: returns every control to the value it was rendered
            with, which after a search is what was searched for — not empty. */}
        <button
          type="reset"
          className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-muted hover:bg-paper hover:text-ink"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export function CriteriaForm({
  campaignId,
  defaults = {},
  context,
}: {
  campaignId: string | null;
  defaults?: FilterDefaults;
  context?: SearchContext;
}) {
  const [state, action] = useFormState(startDiscovery, INITIAL_DISCOVERY);
  const topics = useRef<HTMLInputElement>(null);
  const hasOptional = Boolean(
    defaults.language || defaults.market || defaults.formats?.length || defaults.minSubscribers ||
      defaults.maxSubscribers || defaults.publishedWithinDays || defaults.excludeTopics,
  );

  /** Append, never replace: a suggestion adds to what is already typed. */
  function addTopic(term: string) {
    const input = topics.current;
    if (!input) return;
    const current = input.value.trim();
    if (current.toLowerCase().split(/\s*,\s*/).includes(term.toLowerCase())) return;
    input.value = current ? `${current}, ${term}` : term;
    input.focus();
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="mode" value="criteria" />
      {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
      {context?.brand ? <input type="hidden" name="brandId" value={context.brand.id} /> : null}

      <div className={scroll}>
        <div>
          <label className={label} htmlFor="keywords">
            Topics
          </label>
          <input
            id="keywords"
            name="keywords"
            ref={topics}
            defaultValue={defaults.keywords ?? ''}
            className={`${field} mt-1.5`}
            placeholder="home espresso, coffee gear"
            maxLength={400}
            title="One search per term, sent to YouTube exactly as you type it. Separate terms with commas."
          />
          <p className={help}>What this search is exploring — not saved to the brand.</p>
        </div>

        <TopicSuggestions suggestions={context?.topicSuggestions ?? []} onPick={addTopic} />

        <div>
          <label className={label} htmlFor="product">
            What you sell
            <From context={context} field="product" />
          </label>
          <textarea
            id="product"
            name="product"
            rows={3}
            defaultValue={defaults.product ?? ''}
            maxLength={2000}
            className="mt-1.5 w-full rounded-lg border border-line bg-surface p-2.5 text-[13px] text-ink placeholder:text-ink-faint"
            placeholder="A £180 hand grinder for home espresso."
          />
          <p className={help}>Helps pick out matches in what we retrieve.</p>
        </div>

        <MoreFilters open={hasOptional}>
          <LocalePicker
            id="language"
            name="language"
            label="Creator content language"
            options={LANGUAGES}
            preferred={context?.brand?.contentLanguages ?? []}
            defaultValue={defaults.language}
            context={context}
            field="language"
            anyLabel="Any language"
          />
          <LocalePicker
            id="market"
            name="market"
            label="Market"
            options={COUNTRIES}
            preferred={context?.brand?.markets ?? []}
            defaultValue={defaults.market}
            context={context}
            field="market"
            anyLabel="Any market"
          />
          <p className={help}>
            Search preferences sent to YouTube. They are not a measure of who watches.
          </p>

          <fieldset>
            <legend className={label}>Video length</legend>
            <div className="mt-1.5 space-y-1.5">
              {[
                ['short', 'Under 4 min'],
                ['medium', '4–20 min'],
                ['long', 'Over 20 min'],
              ].map(([value, text]) => (
                <label key={value} className="flex items-center gap-2 text-[12px] text-ink">
                  <input
                    type="checkbox"
                    name="formats"
                    value={value}
                    defaultChecked={defaults.formats?.includes(value)}
                    className="h-4 w-4"
                  />
                  {text}
                </label>
              ))}
            </div>
            <p className={help} title="YouTube accepts one videoDuration per request. With more than one ticked the search is not narrowed by length, and the results panel says so.">
              One at a time narrows the search.
            </p>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="minSubscribers">
                Subs from
              </label>
              <input
                id="minSubscribers"
                name="minSubscribers"
                defaultValue={defaults.minSubscribers ?? ''}
                inputMode="numeric"
                className={`${field} tnum mt-1.5`}
                placeholder="any"
              />
            </div>
            <div>
              <label className={label} htmlFor="maxSubscribers">
                Subs to
              </label>
              <input
                id="maxSubscribers"
                name="maxSubscribers"
                defaultValue={defaults.maxSubscribers ?? ''}
                inputMode="numeric"
                className={`${field} tnum mt-1.5`}
                placeholder="any"
              />
            </div>
          </div>
          <p
            className={help}
            title="Applied to what the search returned, not across YouTube. The results panel reports how many rows it removed."
          >
            Applied after retrieval, and counted.
          </p>

          <div>
            <label className={label} htmlFor="publishedWithinDays">
              Published within
            </label>
            <select
              id="publishedWithinDays"
              name="publishedWithinDays"
              defaultValue={defaults.publishedWithinDays ?? ''}
              className={`${field} mt-1.5`}
            >
              <option value="">Any time</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">A year</option>
            </select>
          </div>

          <div>
            <label className={label} htmlFor="excludeTopics">
              Exclude topics
              <From context={context} field="excludeTopics" />
            </label>
            <input
              id="excludeTopics"
              name="excludeTopics"
              defaultValue={defaults.excludeTopics ?? ''}
              className={`${field} mt-1.5`}
              placeholder="gambling, crypto"
              maxLength={400}
              title="A candidate is dropped if the term appears in its channel name, description or a retrieved video title."
            />
          </div>

          {context?.brand ? <SaveAsBrandDefaults /> : null}
        </MoreFilters>
      </div>

      <Footer state={state} />
    </form>
  );
}

export function SimilarForm({
  campaignId,
  defaults = {},
  context,
}: {
  campaignId: string | null;
  defaults?: FilterDefaults;
  context?: SearchContext;
}) {
  const [state, action] = useFormState(startDiscovery, INITIAL_DISCOVERY);
  const picked = defaults.dimensions;

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="mode" value="similar" />
      {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
      {context?.brand ? <input type="hidden" name="brandId" value={context.brand.id} /> : null}

      <div className={scroll}>
        <div>
          <label className={label} htmlFor="channel">
            Reference channel
          </label>
          <input
            id="channel"
            name="channel"
            required
            defaultValue={defaults.channel ?? ''}
            maxLength={200}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={`${field} mt-1.5`}
            placeholder="URL or @handle"
          />
          <p className={help}>Shown back to you before anything is searched for.</p>
        </div>

        <MoreFilters open={Boolean(picked && picked.length !== SIMILARITY_DIMENSIONS.length)}>
          <fieldset>
            <legend className={label}>Similar in</legend>
            <div className="mt-1.5 space-y-1.5">
              {SIMILARITY_DIMENSIONS.map((dimension) => (
                <label key={dimension} className="flex items-center gap-2 text-[12px] text-ink">
                  <input
                    type="checkbox"
                    name="dimensions"
                    value={dimension}
                    defaultChecked={picked ? picked.includes(dimension) : true}
                    className="h-4 w-4"
                  />
                  {SIMILARITY_DIMENSION_LABEL[dimension]}
                </label>
              ))}
            </div>
            <p className={help}>Anything we cannot evaluate is named, not scored.</p>
          </fieldset>
        </MoreFilters>

        <p className={`${help} rounded-lg border border-line bg-paper px-2.5 py-2`} title={SIMILARITY_LIMIT}>
          Similar in what they publish — not in who watches.
        </p>
      </div>

      <Footer state={state} />
    </form>
  );
}

export function CompetitorForm({
  campaignId,
  defaults = {},
  context,
}: {
  campaignId: string | null;
  defaults?: FilterDefaults;
  context?: SearchContext;
}) {
  const [state, action] = useFormState(startDiscovery, INITIAL_DISCOVERY);
  const hasOptional = Boolean(
    defaults.category || defaults.customerNeed || defaults.market || defaults.pricePositioning,
  );

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="mode" value="competitor" />
      {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
      {context?.brand ? <input type="hidden" name="brandId" value={context.brand.id} /> : null}

      <div className={scroll}>
        <div>
          <label className={label} htmlFor="knownCompetitors">
            Competing brands
          </label>
          <input
            id="knownCompetitors"
            name="knownCompetitors"
            defaultValue={defaults.knownCompetitors ?? ''}
            className={`${field} mt-1.5`}
            placeholder="Comandante, 1Zpresso"
            maxLength={800}
            title="Brands you enter are confirmed straight away. Anything suggested has to be confirmed by you before it is searched for."
          />
          <p className={help}>Yours are confirmed; suggestions need your confirmation.</p>
        </div>

        <div>
          <label className={label} htmlFor="competitor-product">
            Your product
            <From context={context} field="product" />
          </label>
          <textarea
            id="competitor-product"
            name="product"
            rows={3}
            defaultValue={defaults.product ?? ''}
            maxLength={2000}
            className="mt-1.5 w-full rounded-lg border border-line bg-surface p-2.5 text-[13px] text-ink placeholder:text-ink-faint"
            placeholder="A £180 hand grinder for home espresso."
          />
        </div>

        <MoreFilters open={hasOptional}>
          <div>
            <label className={label} htmlFor="category">
              Category
            </label>
            <input
              id="category"
              name="category"
              defaultValue={defaults.category ?? ''}
              className={`${field} mt-1.5`}
              placeholder="Coffee equipment"
              maxLength={200}
            />
          </div>
          <div>
            <label className={label} htmlFor="customerNeed">
              Customer need
            </label>
            <input
              id="customerNeed"
              name="customerNeed"
              defaultValue={defaults.customerNeed ?? ''}
              className={`${field} mt-1.5`}
              placeholder="Consistent grind, no benchtop"
              maxLength={500}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="competitor-market">
                Market
              </label>
              <input
                id="competitor-market"
                name="market"
                defaultValue={defaults.market ?? ''}
                className={`${field} mt-1.5`}
                placeholder="GB"
                maxLength={2}
                title={LOCALE_PARAMETER_DISCLOSURE}
              />
            </div>
            <div>
              <label className={label} htmlFor="pricePositioning">
                Price
              </label>
              <select
                id="pricePositioning"
                name="pricePositioning"
                defaultValue={defaults.pricePositioning ?? ''}
                className={`${field} mt-1.5`}
              >
                <option value="">—</option>
                <option value="value">Value</option>
                <option value="mid">Mid</option>
                <option value="premium">Premium</option>
              </select>
            </div>
          </div>
        </MoreFilters>
      </div>

      <Footer state={state} />
    </form>
  );
}

export function ModeForm({
  mode,
  campaignId,
  defaults,
  context,
}: {
  mode: DiscoveryMode;
  campaignId: string | null;
  defaults?: FilterDefaults;
  context?: SearchContext;
}) {
  if (mode === 'similar') return <SimilarForm campaignId={campaignId} defaults={defaults} context={context} />;
  if (mode === 'competitor') return <CompetitorForm campaignId={campaignId} defaults={defaults} context={context} />;
  return <CriteriaForm campaignId={campaignId} defaults={defaults} context={context} />;
}
