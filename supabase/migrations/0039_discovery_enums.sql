-- =============================================================================
-- New enum values, alone in their own migration.
--
-- Postgres will not let a value added to an enum be USED in the same
-- transaction that added it, and `supabase db push` runs each file in one. 0036
-- exists for exactly this reason and this is the same shape: the values land
-- here, and 0040 — which writes functions that reference them — runs after the
-- commit.
--
-- THE THREE KINDS are discovery passes, queued on the same `analysis_jobs`
-- table as everything else. 0028 said it outright: "A third pass is a new enum
-- value and a new handler in the worker, NOT a second jobs table — the
-- claiming, leasing and retry rules are the same work whatever is being
-- computed." Discovery needs every one of those rules and none of them
-- differently.
-- =============================================================================

alter type public.analysis_job_kind add value if not exists 'discover_criteria';
alter type public.analysis_job_kind add value if not exists 'discover_similar';
alter type public.analysis_job_kind add value if not exists 'discover_collabs';

-- PARTIAL is a real outcome, not a soft failure. A discovery run that reached
-- its search bound with thirty candidates in hand did not fail and did not
-- succeed at what it was asked: it has results AND it stopped early, and the
-- page has to be able to say both. Deriving it from the data was the
-- alternative and it is the mistake this codebase keeps finding — "stopped
-- early" and "found everything there was" produce identical rows.
alter type public.analysis_job_status add value if not exists 'partial';

-- CANCELLED is likewise its own state. A customer who navigates away from a
-- search they did not want has not caused a failure, and a failed job shows
-- them an error about their own decision, offers a retry, and counts against
-- the attempt budget.
alter type public.analysis_job_status add value if not exists 'cancelled';
