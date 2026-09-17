-- =============================================================================
-- adfit — Migration 0020: a range, not a floor
--
-- `minimum_budget` asked a creator for the smallest number they would accept
-- and then published it. That is the worst question to ask them: it is an
-- anchor, it is the number a buyer opens at, and every creator who answers it
-- honestly negotiates downward from their own floor. It also told a brand
-- almost nothing — a floor says what a creator will not do, never what a
-- placement with them usually costs.
--
-- A range answers the buyer's actual question ("roughly what should I budget")
-- and costs the creator less to give. `budget_negotiable` is the honest escape
-- for anyone who will not name figures, and it is deliberately NOT the default:
-- a directory of "negotiable" is a directory a buyer cannot plan against, so
-- the form asks for a range first and takes the opt-out second.
--
-- `minimum_budget` is kept and backfilled from `budget_min`. It is the basis
-- of every stored `cost_efficiency` and dropping it would silently change what
-- historical CPMs were derived from.
-- =============================================================================

alter table public.creators
  add column budget_min        integer check (budget_min >= 0),
  add column budget_max        integer check (budget_max >= 0),
  add column budget_negotiable boolean not null default false,
  add constraint creators_budget_range_ordered
    check (budget_min is null or budget_max is null or budget_min <= budget_max);

-- Everyone who published a floor has said something true about their range: it
-- starts there. The top stays null rather than being invented from a multiple.
update public.creators
set budget_min = minimum_budget
where minimum_budget is not null and budget_min is null;

comment on column public.creators.budget_min is
  'Bottom of the range a creator would like for a placement. Backfilled from the old '
  'minimum_budget, which asked for a floor — the worst number to publish, because it anchors '
  'every negotiation at the lowest figure the creator would accept.';

comment on column public.creators.budget_max is
  'Top of that range. NULL means they gave only a floor, which must render as "from X" rather '
  'than as a range with an invented ceiling.';

comment on column public.creators.budget_negotiable is
  'Set when a creator will not publish figures. Honest, and deliberately not the default: a '
  'directory where everyone is "negotiable" cannot be planned against, so the form asks for a '
  'range first. A creator may set this AND a range — "roughly this, and there is room".';

comment on column public.creators.minimum_budget is
  'HISTORICAL. The basis of every stored cost_efficiency, kept so old CPMs stay explicable. New '
  'writes go to budget_min/budget_max; see migration 0020.';

-- Named columns again — `is_verified` stays unreachable from a client, which a
-- table-wide grant would have undone. See 0001.
grant update (budget_min, budget_max, budget_negotiable) on public.creators to authenticated;
