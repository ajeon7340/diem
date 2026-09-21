/**
 * Assertions for the workspace / brand / campaign / search split.
 *
 *   npm run verify:brands
 *
 * FOUR CONCEPTS THAT WERE TWO. `organizations` held both "who is using adfit"
 * and "what they sell", which is right for a brand and wrong for an agency —
 * whose own description is "we are a media agency", and using that as product
 * context for a client's grinder campaign produces a read about the wrong
 * company. These pin the separation, the precedence between the three saved
 * layers, and the two directions data must NOT flow: a search must not rewrite
 * a brand, and a brand must not rewrite a brief.
 */
import { readFileSync } from 'node:fs';

import { channelDestination, channelInput, nextStep, onboardingDestination } from '@/lib/channel/state';
import { buildContext, suggestTopics, PROVENANCE_LABEL } from '@/lib/discovery/context';
import { brandSchema } from '@/lib/schemas-brand';
import { campaignSchema } from '@/lib/schemas-campaign';
import {
  COUNTRIES,
  LANGUAGES,
  countryName,
  languageName,
  validCountries,
  validLanguages,
} from '@/lib/locale/vocabulary';
import { pickBrand, type Brand } from '@/lib/data/brands';
import type { Campaign } from '@/lib/data/campaigns';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}

const cleared = buildContext({ mode: 'criteria', brand: brand(), campaign: null,
  searchParams: { categories: [], language: null, market: null } });
check('cleared topics stay empty when reopening a search', cleared.defaults.categories, []);
check('Any language is not replaced by the brand language', cleared.defaults.language, undefined);
check('Any market is not replaced by the brand market', cleared.defaults.market, undefined);

const CH = 'https://www.youtube.com/@mkbhd';
const ENC = encodeURIComponent(CH);

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: 'b1',
    name: 'Northbeam',
    sells: 'A £180 hand grinder for home espresso',
    categories: ['beauty'],
    website: 'https://northbeam.com/',
    customerNeeds: 'Café-level espresso without a benchtop grinder',
    markets: ['GB', 'IE'],
    contentLanguages: ['en'],
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'c1',
    name: 'Spring launch',
    brand: 'Northbeam',
    brandId: 'b1',
    product: 'The C40 travel grinder',
    useCase: 'Grinding for espresso while travelling',
    audience: null,
    objective: 'launch',
    avoidTopics: 'gambling',
    budgetTotal: null,
    budgetCurrency: 'USD',
    createdAt: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Onboarding: two steps, and the channel survives all of them
// ---------------------------------------------------------------------------

check('a stranger signs up first', nextStep({ signedIn: false, hasWorkspace: false }, CH), `/join/business?channel=${ENC}`);
check(
  'signed in without a workspace names one',
  nextStep({ signedIn: true, hasWorkspace: false }, CH),
  `/onboarding/business?channel=${ENC}`,
);
check(
  'a workspace with the brand step unanswered goes to step 2',
  nextStep({ signedIn: true, hasWorkspace: true, brandSetup: 'pending' }, CH),
  `/onboarding/brand?channel=${ENC}`,
);
check(
  'somebody who chose Set up later is NOT asked again',
  nextStep({ signedIn: true, hasWorkspace: true, brandSetup: 'skipped' }, CH),
  `/channels?channel=${ENC}`,
);
check(
  'and neither is somebody who finished',
  nextStep({ signedIn: true, hasWorkspace: true, brandSetup: 'done' }, CH),
  `/channels?channel=${ENC}`,
);
check(
  'existing call sites that pass no brand state keep their behaviour',
  nextStep({ signedIn: true, hasWorkspace: true }, CH),
  `/channels?channel=${ENC}`,
);
check(
  'a workspace cannot be reached by claiming one while signed out',
  nextStep({ signedIn: false, hasWorkspace: true, brandSetup: 'pending' }, CH),
  `/join/business?channel=${ENC}`,
);

// The channel typed before anybody had an account is the whole point of the
// journey, and every hop is a place it can be dropped.
check('the channel survives step 1', channelDestination(CH, '/onboarding/brand'), `/onboarding/brand?channel=${ENC}`);
check(
  'a channel entered before sign-up reaches its report, not a search page',
  onboardingDestination(CH, 'brand-id'),
  `/channels?channel=${ENC}`,
);
check(
  'without one, onboarding ends in discovery with the new brand selected',
  onboardingDestination('', 'brand-id'),
  '/discover?brand=brand-id',
);
check('and in plain discovery when the brand step was skipped', onboardingDestination('', null), '/discover');
check('the channel is bounded before it is round-tripped', channelInput('x'.repeat(500)).length, 200);
check('and a non-string never becomes a destination', channelInput({ evil: true }), '');

// ---------------------------------------------------------------------------
// The brand profile itself
// ---------------------------------------------------------------------------

const parsed = brandSchema.safeParse({
  name: '  Northbeam  ',
  sells: 'A hand grinder',
  categories: ['beauty', 'beauty', ' '],
  website: 'northbeam.com',
  customerNeeds: '',
  markets: ['GB', 'XX', 'ie'],
  contentLanguages: ['en', 'zz'],
  makeDefault: 'on',
});
check('a valid profile parses', parsed.success, true);
if (parsed.success) {
  check('the name is trimmed', parsed.data.name, 'Northbeam');
  check('categories are de-duplicated', parsed.data.categories, ['beauty']);
  check('a bare domain becomes a URL', parsed.data.website, 'https://northbeam.com/');
  check('an empty optional is null, not an empty string', parsed.data.customerNeeds, null);
  check('an unknown country code is dropped rather than sent to YouTube', parsed.data.markets, ['GB', 'IE']);
  check('and so is an unknown language', parsed.data.contentLanguages, ['en']);
  check('the default checkbox reads as a boolean', parsed.data.makeDefault, true);
}
check(
  'a brand with no name is refused',
  brandSchema.safeParse({ name: '', sells: 'x', markets: [], contentLanguages: [] }).success,
  false,
);
check(
  'and so is one with no description — it is what discovery starts from',
  brandSchema.safeParse({ name: 'x', sells: '', markets: [], contentLanguages: [] }).success,
  false,
);
check('nonsense in the website field is dropped, not stored', brandSchema.safeParse({
  name: 'x', sells: 'y', website: 'not a url', markets: [], contentLanguages: [],
}).success && brandSchema.parse({ name: 'x', sells: 'y', website: 'not a url', markets: [], contentLanguages: [] }).website, null);

// ---------------------------------------------------------------------------
// Names, not codes
// ---------------------------------------------------------------------------

check('countries are a full list', COUNTRIES.length > 200, true);
check('languages too', LANGUAGES.length > 150, true);
check('a code renders as a name', countryName('GB'), 'United Kingdom');
check('lower case still resolves', countryName('gb'), 'United Kingdom');
check('languages likewise', languageName('ko'), 'Korean');
check('an unknown code falls back to itself rather than vanishing', countryName('QQ'), 'QQ');
check('"UK" is not a country code and is not accepted', validCountries(['UK']), []);
check('but "GB" is', validCountries(['gb']), ['GB']);
check('a comma string is accepted as well as an array', validLanguages('en, ko'), ['en', 'ko']);
check('and an object is not', validCountries({ code: 'GB' }), []);

// ---------------------------------------------------------------------------
// Precedence: search > campaign > brand
// ---------------------------------------------------------------------------

const brandOnly = buildContext({ mode: 'criteria', brand: brand(), campaign: null });
check('a brand fills What you sell', brandOnly.defaults.product, 'A £180 hand grinder for home espresso');
check('and says where it came from', brandOnly.provenance.product, 'brand');
check('the first saved market is the default', brandOnly.defaults.market, 'GB');
check('and the first saved language', brandOnly.defaults.language, 'en');

const withCampaign = buildContext({ mode: 'criteria', brand: brand(), campaign: campaign() });
check('a campaign overrides the brand on product', withCampaign.defaults.product, 'The C40 travel grinder');
check('and is labelled as the campaign', withCampaign.provenance.product, 'campaign');
check(
  'while a field the campaign does not set still comes from the brand',
  withCampaign.provenance.market,
  'brand',
);
check('the campaign supplies what to avoid', withCampaign.defaults.excludeTopics, 'gambling');

const withSearch = buildContext({
  mode: 'criteria',
  brand: brand(),
  campaign: campaign(),
  searchParams: { product: 'Something else entirely', keywords: ['hand grinder'], market: 'DE' },
});
check('a search override beats both', withSearch.defaults.product, 'Something else entirely');
check('and is labelled as the search', withSearch.provenance.product, 'search');
check('the search market wins too', withSearch.defaults.market, 'DE');
check('topics come only from the search — never from a saved profile', withSearch.defaults.keywords, 'hand grinder');
check('a brand alone contributes no topics', brandOnly.defaults.keywords, undefined);
check('every provenance value has a label', Object.keys(PROVENANCE_LABEL).sort(), ['brand', 'campaign', 'search']);

// ---------------------------------------------------------------------------
// Topic suggestions: the customer's own words, not a generated list
// ---------------------------------------------------------------------------

const suggestions = suggestTopics(brand(), campaign());
check('categories become suggestions', suggestions.includes('beauty'), true);
check('so do saved customer needs', suggestions.includes('Café-level espresso without a benchtop grinder'), true);
check('and the campaign use case', suggestions.includes('Grinding for espresso while travelling'), true);
check('nothing is suggested from an empty profile', suggestOn(null, null), []);
function suggestOn(b: Brand | null, c: Campaign | null) {
  return suggestTopics(b, c);
}

// ---------------------------------------------------------------------------
// Which brand a surface starts on
// ---------------------------------------------------------------------------

const a = brand({ id: 'a', name: 'Alpha' });
const b = brand({ id: 'b', name: 'Beta' });
const archived = brand({ id: 'z', name: 'Gone', archivedAt: '2026-09-10T00:00:00.000Z' });

check('an explicit request wins', pickBrand([a, b], 'b', 'a')?.id, 'b');
check('then the workspace default', pickBrand([a, b], null, 'b')?.id, 'b');
check('then the first live brand', pickBrand([a, b], null, null)?.id, 'a');
check('an archived brand is never selected', pickBrand([archived], null, 'z'), null);
check('and an id from another workspace selects nothing rather than guessing', pickBrand([a], 'not-ours', null)?.id, 'a');
check('no brands means no brand', pickBrand([], 'x', 'y'), null);

// ---------------------------------------------------------------------------
// Legacy campaigns keep working
// ---------------------------------------------------------------------------

const legacy = campaign({ brandId: null, brand: 'Typed by hand' });
const legacyContext = buildContext({ mode: 'criteria', brand: null, campaign: legacy });
check('a campaign with no linked brand still supplies its own product', legacyContext.defaults.product, 'The C40 travel grinder');
check('and no brand context is invented for it', legacyContext.brand, null);
check(
  'the brief accepts an empty brand link without error',
  campaignSchema.safeParse({ name: 'Old', brandId: '', brand: 'Typed by hand' }).success,
  true,
);
check(
  'an empty link parses to null rather than an empty uuid',
  campaignSchema.parse({ name: 'Old', brandId: '', brand: 'Typed by hand' }).brandId,
  null,
);
check(
  'a malformed brand link is refused rather than stored',
  campaignSchema.safeParse({ name: 'Old', brandId: 'not-a-uuid' }).success,
  false,
);

// ---------------------------------------------------------------------------
// The two directions data must not flow
// ---------------------------------------------------------------------------

const forms = readFileSync('src/components/discovery/SearchForms.tsx', 'utf8');
check(
  'the search form writes to a brand only through a named button',
  (forms.match(/formAction=\{saveSearchAsBrandDefaults\}/g) ?? []).length,
  1,
);
check(
  'and that button is the only reference to the brand-writing action',
  (forms.match(/saveSearchAsBrandDefaults/g) ?? []).length,
  2,
);

const brandActions = readFileSync('src/app/actions/brand.ts', 'utf8');
check(
  'saving search defaults ADDS to the saved markets rather than replacing them',
  brandActions.includes('new Set([...market, ...(brand.markets ?? [])])'),
  true,
);
check(
  'and never touches topics',
  /saveSearchAsBrandDefaults[\s\S]*?^}/m.exec(brandActions)?.[0].includes('keywords'),
  false,
);

const campaignForm = readFileSync('src/components/campaign/CampaignForm.tsx', 'utf8');
check(
  'picking a brand only fills a field that is empty',
  campaignForm.includes('!product.current.value.trim()'),
  true,
);
check(
  'and the brand NAME is copied onto the brief rather than read back later',
  campaignForm.includes('value={selected?.name ?? campaign?.brand ?? \'\'}'),
  true,
);

const campaignActions = readFileSync('src/app/actions/campaign.ts', 'utf8');
check(
  'no campaign write ever updates a brand row',
  /from\('brands'\)/.test(campaignActions),
  false,
);

// ---------------------------------------------------------------------------
// Migration guarantees
// ---------------------------------------------------------------------------

const migration = readFileSync('supabase/migrations/0041_brands.sql', 'utf8');
check('one brand per name per workspace, case-insensitively', migration.includes('create unique index brands_one_per_name'), true);
check('saving the same brand twice updates rather than duplicates', migration.includes('on conflict (organization_id, lower(btrim(name))) do update'), true);
check('a brand pointer is checked against the owning workspace', migration.includes('brand_not_in_workspace'), true);
check('on campaigns', migration.includes('campaigns_brand_in_workspace'), true);
check('and on searches', migration.includes('discovery_searches_brand_in_workspace'), true);
check('brands are archived, never deleted', migration.includes('archived_at'), true);
check('existing workspaces are NOT dragged back through onboarding', migration.includes("brand_setup_state text not null default 'skipped'"), true);
check('no campaign is auto-linked by matching a name', /update\s+public\.campaigns\s+set\s+brand_id/i.test(migration), false);
check('the website column says nothing reads it', migration.includes('NOTHING READS IT'), true);
check('markets and languages are named as search preferences', migration.includes('SEARCH PREFERENCES'), true);

// ---------------------------------------------------------------------------
// Settings stops telling customers about operator configuration
// ---------------------------------------------------------------------------

const settings = readFileSync('src/app/settings/page.tsx', 'utf8');
check('the three sections exist', ['workspace', 'brands', 'sharing'].every((s) => settings.includes(`'${s}'`)), true);
check(
  'and the operator approval paragraph is gone from customer settings',
  /ADFIT_YOUTUBE_DERIVED_APPROVAL|approval is configured by the operator/.test(settings),
  false,
);
check(
  'no control in settings could enable restricted analysis',
  /AMENDMENT_ACCEPTED\s*=/.test(settings),
  false,
);

const policy = readFileSync('src/lib/report/policy.ts', 'utf8');
check(
  'the gate is still environment-only, unreachable from any form',
  policy.includes("process.env.ADFIT_YOUTUBE_DERIVED_APPROVAL === 'approved'"),
  true,
);

// ---------------------------------------------------------------------------
// What onboarding does not ask
//
// Each of these is a field somebody proposes adding every few months because it
// would be "useful to have", and each one is answered carelessly by a person
// trying to reach their first report. A careless answer is worse than an empty
// one because nothing downstream can tell them apart.
// ---------------------------------------------------------------------------

/**
 * Comments stripped before matching.
 *
 * The first version of these checks failed against the file's own
 * documentation: a header explaining that the form asks nothing about billing
 * contains the word "billing". What is being asserted is the MARKUP.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const step1 = code('src/components/onboarding/BusinessOnboardingForm.tsx');
check(
  'step 1 asks for a name and an account type and nothing else',
  /billing|companySize|jobTitle|phone|invite|budget/i.test(step1),
  false,
);
check('and marks both as required', (step1.match(/· required/g) ?? []).length, 2);

const step2 = readFileSync('src/app/onboarding/brand/page.tsx', 'utf8');
check('step 2 can be skipped in one click', step2.includes('Set up later'), true);
check('and has a Back control', step2.includes('← Back'), true);
check('it carries the channel through both steps', step2.includes('name="channel"'), true);
check(
  'an agency is asked for a CLIENT brand, not its own',
  step2.includes('Add your first client brand'),
  true,
);

const brandForm = code('src/components/brand/BrandForm.tsx');
check(
  'the agency brand name is never prefilled from the workspace',
  brandForm.includes("customerType === 'agency' ? '' : (workspaceName ?? '')"),
  true,
);
check(
  'the website is labelled as unread',
  readFileSync('src/components/brand/BrandForm.tsx', 'utf8').includes('adfit does not read it'),
  true,
);
check(
  'and nothing in the form fetches it',
  /fetch\(|enrich/i.test(brandForm),
  false,
);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
