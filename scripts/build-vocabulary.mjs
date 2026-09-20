import { writeFileSync } from 'node:fs';

// Groupings, reservations, uninhabited territories — and the SUPERSEDED codes
// ICU still resolves. The latter are the subtle ones: ICU maps 'RH' (Southern
// Rhodesia) to "Zimbabwe", 'YD' to "Yemen", 'NH' to "Vanuatu", 'VD' to
// "Vietnam", 'HV' to "Burkina Faso" and 'UK' to "United Kingdom", so each
// country would appear twice and somebody could store a code that
// `regionCode` rejects. The CURRENT assignment is the one kept — listing the
// obsolete code here rather than letting the duplicate guard pick whichever
// sorts first, which kept the wrong half of every pair.
const NOT_A_COUNTRY = new Set([
  'EU','EZ','UN','QO','XA','XB','ZZ','AC','CP','DG','EA','IC','TA','XK',
  'SU','AN','BU','CS','DD','FX','NT','TP','YU','ZR','BV','HM','AQ','GS','TF','UM','CQ','DY','EH',
  'UK','HV','RH','YD','NH','VD',
]);
const region = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const language = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

const countries = [];
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
  const code = String.fromCharCode(a) + String.fromCharCode(b);
  const name = region.of(code);
  if (!name || name === code || NOT_A_COUNTRY.has(code) || /^(Outlying|Unknown|Pseudo)/.test(name)) continue;
  // Two codes with one name is an alias that slipped through, and it renders as
  // a duplicate row somebody has to choose between blind.
  if (countries.some(([, existing]) => existing === name)) {
    throw new Error(`duplicate country name "${name}" for ${code} — add it to NOT_A_COUNTRY`);
  }
  countries.push([code, name]);
}

const LANG_CODES = 'ab aa af ak sq am ar an hy as av ae ay az bm ba eu be bn bi bs br bg my ca ch ce ny zh cv kw co cr hr cs da dv nl dz en eo et ee fo fj fi fr ff gl ka de el gn gu ht ha he hi ho hu ia id ie ga ig ik io is it iu ja jv kl kn kr ks kk km ki rw ky kv kg ko ku kj la lb lg li ln lo lt lu lv gv mk mg ms ml mt mi mr mh mn na nv nd ne ng nb nn no ii nr oc oj cu om or os pa pi fa pl ps pt qu rm rn ro ru sa sc sd se sm sg sr gd sn si sk sl so st es su sw ss sv ta te tg th ti bo tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa cy wo fy xh yi yo za zu'.split(' ');
const languages = [];
for (const code of LANG_CODES) {
  const name = language.of(code);
  if (name && name !== code) languages.push([code, name]);
}

const rows = (list) => list.map(([c, n]) => `  ['${c}', ${JSON.stringify(n)}],`).join('\n');

const header = [
  '/**',
  ' * Countries and languages, by name.',
  ' *',
  ' * GENERATED ONCE, then committed — not computed at render. `Intl.DisplayNames`',
  ' * gives the same strings, but the server and the browser would each produce',
  ' * their own copy and any disagreement between their ICU versions becomes a',
  ' * hydration mismatch on a form control. A frozen list is also the only way the',
  ' * values stay stable across a Node upgrade, which matters because these codes',
  ' * are what gets stored in the database.',
  ' *',
  ' * WHY CODES ARE STORED AND NAMES ARE SHOWN. YouTube’s `regionCode` takes ISO',
  ' * 3166-1 alpha-2 and `relevanceLanguage` takes ISO 639-1, so the code is what a',
  ' * search actually sends. Nobody should have to know that: a customer picks',
  ' * "United Kingdom" and `GB` is an implementation detail they never see. Typing',
  ' * a two-letter code was the old form, and it is the kind of field people get',
  ' * wrong silently — `UK` is not a country code.',
  ' *',
  ' * Supranational groupings, user-assigned and exceptional reservations, and the',
  ' * uninhabited territories are left out: none is a market anybody runs a',
  ' * campaign in, and each is a row to scroll past.',
  ' *',
  ' * Regenerate: node scripts/build-vocabulary.mjs',
  ' */',
  '',
  'export interface LocaleOption {',
  '  code: string;',
  '  name: string;',
  '}',
  '',
].join('\n');

const body = [
  `const COUNTRY_ROWS: [string, string][] = [\n${rows(countries)}\n];`,
  '',
  `const LANGUAGE_ROWS: [string, string][] = [\n${rows(languages)}\n];`,
  '',
  'export const COUNTRIES: LocaleOption[] = COUNTRY_ROWS.map(([code, name]) => ({ code, name }));',
  'export const LANGUAGES: LocaleOption[] = LANGUAGE_ROWS.map(([code, name]) => ({ code, name }));',
  '',
  'const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.name]));',
  'const LANGUAGE_BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l.name]));',
  '',
  '/**',
  ' * The name for a stored code, or the code itself.',
  ' *',
  ' * Falls back to the code rather than dropping the value: a market saved before',
  ' * a list change is still a real preference, and rendering nothing for it would',
  ' * look like the field had never been filled in.',
  ' */',
  'export function countryName(code: string): string {',
  '  return COUNTRY_BY_CODE.get(code.toUpperCase()) ?? code;',
  '}',
  '',
  'export function languageName(code: string): string {',
  '  return LANGUAGE_BY_CODE.get(code.toLowerCase()) ?? code;',
  '}',
  '',
  '/** Keep only codes this vocabulary knows, so a forged value never reaches the API. */',
  'export function validCountries(value: unknown): string[] {',
  '  return toCodes(value).map((c) => c.toUpperCase()).filter((c) => COUNTRY_BY_CODE.has(c));',
  '}',
  '',
  'export function validLanguages(value: unknown): string[] {',
  '  return toCodes(value).map((c) => c.toLowerCase()).filter((c) => LANGUAGE_BY_CODE.has(c));',
  '}',
  '',
  'function toCodes(value: unknown): string[] {',
  '  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === \'string\');',
  '  if (typeof value === \'string\') return value.split(\',\').map((v) => v.trim()).filter(Boolean);',
  '  return [];',
  '}',
  '',
].join('\n');

writeFileSync('src/lib/locale/vocabulary.ts', header + body);
console.log(`countries ${countries.length}, languages ${languages.length}`);
