-- =============================================================================
-- adfit — Migration 0030: what atmosphere a buyer is looking for
--
-- Every creator report already carries a comment-climate read — warm, ordinary,
-- rough or hostile, derived at read time from the census and the axes (see
-- `lib/report/climate.ts`). The directory table already shows it as a column.
-- Nothing on the buyer side could be compared against it: `organizations` knew
-- what a buyer sells and who to, and nothing about what kind of comment section
-- they are actually comfortable placing an ad beside.
--
-- A NARROWER VOCABULARY THAN THE REPORT'S OWN, on purpose. `ClimateLabel` has
-- four values because a report has to be able to say `hostile` — that is a
-- fact about a real comment section and hiding it would be the exact mistake
-- this codebase spends the most code refusing to make. A PREFERENCE is a
-- different kind of value: nobody buying media is choosing to affirmatively
-- WANT a hostile section, so offering it as an option would be a control that
-- does nothing except let a form look complete. Two real answers exist —
-- "warm matters to me" and "a rougher section does not rule a creator out" —
-- plus no answer, which stays the default and is not a third value: a buyer
-- who never touches the field gets a general read, same as every other field
-- on this profile.
--
-- STORE-ONLY, deliberately, for now. This does not filter `/directory` and
-- does not gate anything — it is read into the fit-summary prompt (see
-- `lib/report/fit.ts`) so the written pitch can speak to it: "warm" against a
-- report that reads `rough` is the sentence a buyer actually needs, delivered
-- as prose rather than as a search result that silently excluded the creator.
-- Turning it into a live filter is a second, separable step — DirectoryFilters
-- and the search query would both need to change, and that is a product
-- decision about whether "no answer" should mean "show everything" or
-- "show only what was explicitly asked for", which this migration does not
-- make.
-- =============================================================================

alter table public.organizations
  add column climate_preference text
    check (climate_preference is null or climate_preference in ('warm', 'edgy_ok'));

comment on column public.organizations.climate_preference is
  'Optional. "warm" = a positive-skewing, low-friction comment section matters to this buyer. '
  '"edgy_ok" = a rougher or more combative section does not rule a creator out. Null is not a '
  'third value meaning neutral — it means the field was never answered, same as every other '
  'buyer-profile column. Never filters or gates anything by itself; read into the fit-summary '
  'prompt in lib/report/fit.ts so the pitch can address it in prose. Does NOT rank or exclude '
  'creators — see the migration header for why a live filter is a separate decision.';

-- Same column-grant discipline as 0019: named columns only. `billing_plan`
-- and `stripe_customer_id` must stay unreachable from a client regardless of
-- what else this grant widens to, or an org admin could upgrade themselves.
grant update (climate_preference)
  on public.organizations to authenticated;
