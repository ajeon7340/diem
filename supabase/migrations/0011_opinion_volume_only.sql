-- =============================================================================
-- adfit — Migration 0011: off-platform discussion is volume, not sentiment
--
-- 0005 added `public_opinion` with a `netSentiment` score, a `trend`, and a
-- sentiment per source and per theme. Those columns are removed here, from the
-- stored rows and from the index built on one of them, because the number was
-- not recoverable.
--
-- THE DEFECT
--
-- An off-platform corpus is assembled by searching. A search is a selection:
-- query a creator's name and the results skew toward whoever had a reason to
-- post about them, which is disproportionately conflict. Sentiment scored over
-- a set chosen that way measures the query, not the opinion.
--
-- This was not theoretical. The first real corpus built this way — 7,906
-- comments across seven YouTube commentary videos about one creator — returned
-- a net score of -0.52 and three themes, all negative, summing to 100% of the
-- sample. No genuine body of discussion about a person contains zero positive
-- themes. The sample was selected for criticism before a single score was
-- computed, and the pipeline then reported the selection as a finding.
--
-- The same creator's own comment corpus, read in the same week, was 21,330
-- comments of which 1,080 (5.1%) were critical. Both numbers shipped in one
-- report, and the report had no way to say which one was load-bearing.
--
-- WHAT SURVIVES
--
-- Volume, sources, themes and linked evidence. Those stay true of a selected
-- set: "7,906 comments on seven videos, mostly about X" is a fact about the
-- set that was read, and a buyer can act on it. "Sentiment -0.52" claims to be
-- a fact about the public, and is not.
--
-- No mention threshold rescues this — more comments from the same frame is a
-- larger biased sample, not a smaller bias. Do not reintroduce a score without
-- a sampling frame that admits discussion regardless of stance. For how an
-- audience feels, `top_comment_clusters` already reads the creator's own
-- comment section, which is a census rather than a search.
-- =============================================================================

-- Built in 0005 to let agencies filter the directory on reputation risk. The
-- expression it indexes is being deleted; a filter over it would rank creators
-- by how aggressively someone searched for their critics.
drop index if exists public.report_metrics_opinion_idx;

-- Strip the keys from stored rows. Zod already drops them at the read boundary,
-- so this is not what protects the UI — it is so the column cannot be read
-- straight from SQL by a future job that never sees the TypeScript.
update public.report_metrics
set public_opinion = (
  (public_opinion - 'netSentiment' - 'trend')
  || jsonb_build_object(
       'sources',
       coalesce(
         (
           select jsonb_agg(elem - 'sentiment' order by ord)
           from jsonb_array_elements(
                  case jsonb_typeof(public_opinion -> 'sources')
                    when 'array' then public_opinion -> 'sources'
                    else '[]'::jsonb
                  end
                ) with ordinality as t(elem, ord)
         ),
         '[]'::jsonb
       ),
       'themes',
       coalesce(
         (
           select jsonb_agg(elem - 'sentiment' order by ord)
           from jsonb_array_elements(
                  case jsonb_typeof(public_opinion -> 'themes')
                    when 'array' then public_opinion -> 'themes'
                    else '[]'::jsonb
                  end
                ) with ordinality as t(elem, ord)
         ),
         '[]'::jsonb
       )
     )
)
where jsonb_typeof(public_opinion) = 'object'
  and (
    public_opinion ? 'netSentiment'
    or public_opinion ? 'trend'
    or jsonb_path_exists(public_opinion, '$.sources[*].sentiment')
    or jsonb_path_exists(public_opinion, '$.themes[*].sentiment')
  );

comment on column public.report_metrics.public_opinion is
  'Off-platform discussion: how much the wider internet is saying about this creator, '
  'on which platforms, and about what. THIRD-PARTY derived, unlike every other column '
  'here — sourced from public web discussion, not from creator-authorised analytics. '
  'The UI must label it as such. Carries NO sentiment score by design: the corpus is '
  'assembled by search, and a search selects for who had a reason to post, so an '
  'average over it measures the query rather than the opinion. See migration 0011.';
