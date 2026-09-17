-- =============================================================================
-- adfit — Migration 0018: a category for attacks that are not slurs
--
-- The first real scan — 797 comments off five of one creator's videos — found
-- twenty-five risky ones, and the nastiest of them fit nowhere. It catalogued
-- her facial features as defects and closed with a saying about what "a woman
-- should never" do. Not a protected-group slur, so not `hate`. Not sexual,
-- violent, illegal or spam. It fell through all five categories, and a section
-- containing it was reported as carrying no hate at all.
--
-- `harassment` is the slot. THE BOUNDARY IS THE WHOLE DESIGN:
--
--     about the WORK          → criticism, not risk, however blunt
--     about the PERSON'S BODY → harassment
--     OR THEIR WORTH
--
-- An audience is allowed to dislike someone's work as loudly as it likes.
-- Widening this to cover disagreement would put ordinary criticism into a
-- number that follows a creator around and shapes what they are paid, and the
-- cost of that is borne entirely by them. When a comment is merely rude, it
-- stays out.
--
-- Like every other category it reaches the creator's rating only through
-- `byCreator`, which for harassment is almost definitionally zero: it is a
-- thing done to someone.
-- =============================================================================

alter table public.comment_moderation_queue
  drop constraint comment_moderation_queue_category_check;

alter table public.comment_moderation_queue
  add constraint comment_moderation_queue_category_check
    check (category in ('hate', 'sexual', 'violence', 'illegal', 'spam', 'harassment'));

comment on column public.report_metrics.comment_risks is
  'Brand-risk categories counted over the WHOLE comment census: '
  '[{category, count, byCreator, hidden, example}] where category is '
  'hate | sexual | violence | illegal | spam | harassment. `count` is every such comment in the '
  'section — an ad-adjacency and moderation figure, NOT a judgement on the creator. `byCreator` is '
  'what the creator wrote or endorsed and is the ONLY part that moves their rating; see '
  'creatorRiskPenalty in src/lib/report/safety.ts. An empty array means the scan has not run and '
  'must never render as a clean section. `harassment` covers personal attacks that are not '
  'protected-group slurs; it must never widen to cover criticism of the work.';
