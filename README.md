# adfit — Verified AI Media Kit & Collaboration Hub

MVP: a public creator media kit whose numbers stay locked, and two ways to unlock them.

```bash
npm run dev      # runs on built-in fixtures when no Supabase env is set
npm run verify   # 16 assertion suites, ~450 checks, no network or database
```

`/dashboard/studio` and the disclosure read call the YouTube Data API. Put a key in `.env.local`:

```
YOUTUBE_API_KEY=...
```

Without it those two surfaces render their "could not read" states and everything else works.

In fixture mode the header carries a **demo role switcher** (Anon / Free agency / Pro agency /
Creator) so every access mode is walkable without an auth provider. With Supabase configured the
switcher disappears and the viewer comes from the session cookie.

| URL | Mode |
| --- | --- |
| `/@marahwoods` | Anonymous teaser — frosted |
| `/@marahwoods?token=00000000-0000-4000-8000-000000000001` | Track A, approved grant |
| `/@marahwoods?token=…0002` / `…111111` | Expired / invalid link |
| `/@marahwoods` as **Pro agency** | Track B instant access (creator opted in) |
| `/@quietcircuit` as **Pro agency** | Locked — this creator opted *out* of the directory |
| `/directory` | Pro-only search, filters, bulk briefs |
| `/dashboard/requests` | Creator inbox: approve / decline |
| `/join` | Register — pick influencer or business |
| `/pricing` | Plan comparison and FAQ |
| `/offers/new?handle=…&token=…` | Formal offer composer |
| `/dashboard/offers` | Creator: offers + inbound campaign briefs |
| `/dashboard/settings` | Creator: profile, budget range, directory opt-in |
| `/dashboard/studio` | Creator: what moves views on their channel, any video explained, trending |
| `/dashboard/moderation` | Creator: risky comments on their videos, theirs to remove |
| `/@marahwoods/print?token=…` | One-page media kit, selectable text, A4 |

## Positioning

`.agents/product-marketing.md` is the shared positioning context — product, ICP, personas,
competitive set, differentiation, and voice rules. Every skill in the `marketing-skills` plugin
reads it before writing copy, so corrections there propagate rather than having to be repeated.

Two rules from it that constrain the code, not just the copy:

- **No fabricated proof.** Pre-launch, there are no invented customer counts, logos, or
  testimonials anywhere in the UI. Credibility comes from describing the mechanism precisely.
- **Name the limits.** CPM is an estimate and every panel showing it says so; the qualitative
  read is model-generated and ships with its sample size, window, and model version. Public
  opinion is labelled third-party in the panel itself, not only in the footnote — the provenance
  distinction has to survive a screenshot.

## Registration

Passwordless. One magic-link request serves both register and sign-in, and the response is
identical whether or not the address already has an account, so it never reveals who is registered.

```
/join ──┬── /join/creator  ──→ magic link ──→ /onboarding/creator  ──→ /@handle
        └── /join/business ──→ magic link ──→ /onboarding/business ──→ /directory

/signin ──────────────────────→ magic link ──→ /auth/continue ──→ creator? org? neither?
```

- **Influencer** claims a handle (live availability check), sets niche / bio / YouTube handle / budget range, and
  chooses whether to appear in the agency directory — **off by default**, so Track B discovery is
  opt-in rather than something that happens to them.
- **Business** names a workspace and becomes its owner. It starts on `free`: unlimited 1:1
  proposals, no directory. Only the Stripe webhook can move it to `pro_agency`.
- `/auth/continue` dispatches a returning user by what they actually are — profile, directory, or
  back to `/join` if they authenticated but never onboarded.

Registration is gated by the same privilege model as everything else: a creator inserts their own
row behind a column-scoped grant that **omits `is_verified`**, and an organization can only be
created through `create_organization()`, which never takes `billing_plan` from the caller.

In fixture mode no email is sent — submitting drops you into onboarding, and completing it sets the
demo role so you land in the account you just created.

## What's in the report

The report has two halves. The first describes the audience; the second exists because describing
an audience does not get a budget approved.

| Block | The buyer question it answers |
| --- | --- |
| `demographics`, `topCommentClusters` | Who is watching, and what do they want? |
| `benchmarks` | **Is 78.4 good?** Percentile and median vs a named category cohort. |
| `costEfficiency` | **What does an outcome cost?** Estimated CPM and cost per 1k engaged. |
| `sponsoredPerformance` | **Do their paid posts work?** Organic vs sponsored views and sentiment. |
| `brandSafetyFlags` | **What is the risk, specifically?** Named categories with severity. |
| `categoryExposure` | **Did my competitor just run?** Saturation and exclusivity risk. |
| `recommendedActions` | **What goes in the brief?** Structured do / avoid. |
| `platformBreakdown` | **Which surface do I buy?** Per-platform reach, intent, retention and CPM. |
| `publicOpinion` | **What does the internet say?** Off-platform sentiment, themes, controversies. |
| `outputStats` | **How much do they publish, and how wide is the range?** Counts, cadence, avg/median/peak. |

### Output & engagement

Replaces a lone `activeAudienceRate` ("68% active") in the demographics header, which told a buyer
nothing they could plan around. Per platform: total and windowed post counts, cadence per week, and
**average, median and peak** for views, likes and comments.

Peaks earn their place next to averages. A creator whose best post is 6.7× their median is a
different buy from one who is flat — the multiple is printed beside the peak so the spread is
readable without arithmetic. Cadence sizes the flight.

Volume stats live here and only here: `median views` and `engagement rate` were removed from the
platform panel when this landed, so nothing is stated twice.

Per-platform intent, CPM and sponsored retention sit in the same panel, under
`Commercial, this platform`. They had their own panel until it was merged: YouTube and Instagram
are separate media buys, but on a single-platform creator that panel rendered a table of one under
a note admitting there was no allocation decision to make. Two or more platforms and the cards sit
side by side, so reach, engagement and cost line up in one grid.

### Public opinion (여론)

The one **third-party** signal in the report, and the reason it exists: every other panel reads
1st-party data from surfaces the creator owns and moderates. A warm comment section says nothing
about whether the wider internet is arguing about them. This reads the outside conversation —
how much of it there is, on which platforms, what it is about, and unresolved controversies.

**No sentiment score, deliberately.** An off-platform corpus is assembled by searching, and a
search selects for whoever had a reason to post; scoring its sentiment measures the query rather
than the opinion. The first real corpus built this way returned three themes, all negative,
summing to 100% of the sample — impossible for genuine discussion, and proof the frame produced
the number. Migration `0011` removed it. For how an audience feels, the creator's own comment
corpus is a census rather than a search.

There is no composite verdict for it to override — the report carries no single grade, by design.
An unresolved controversy is shown as a controversy, next to the discussion volume that produced
it, and the buyer weighs it.

Two deliberate constraints:

- **Cost is an estimate, and the UI says so.** It is derived from the creator's published minimum
  against their median views — never a quoted rate. A CPM a buyer mistakes for a rate card is worse
  than no CPM, so the panel carries that caveat inline and renders an honest empty state when the
  creator publishes no minimum.
- **A score without a cohort is not a decision input.** Every headline metric shows its percentile
  and the category median beside it; `benchmarks` is nullable so a thin cohort reads as "no ranking
  yet" rather than a fabricated one.

The profile runs *Audience* → *Commercial fit* → *Risk & brief*: the audience is what a brand is
actually buying, and it frames every figure that follows. Cost efficiency and sponsored-vs-organic
share one **Commercial** panel, both visible at once — what a placement costs only means something
next to whether the money works there, so tabbing them put half the picture a click from the other
half. Agencies can sort and
filter the directory by estimated CPM.

## Studio — the creator side

adfit is a two-sided market and supply has to arrive first, but `requests`, `offers` and
`moderation` all need a brand to have already shown up. On day one, with no advertisers, they are
three empty pages. `/dashboard/studio` is the surface that pays a creator back for arriving alone.

- **What moves views on your channel.** Candidate formats — collaborations, brand tags, long-form,
  title shape, posting day — tested across the whole catalogue with a rank test, not read off the
  top of the list. Both arms need 8 posts before a multiple is shown; below that the row says
  "not enough posts". On the first real channel the top three videos all featured another person,
  which makes "collabs drive hits" look obvious; across all fifty it was 0.79x at p=0.91.
- **Why did that video do well.** Paste any YouTube link. Every figure is against *that channel's
  own* median, which is the only baseline that means anything: the number-one video on the Korean
  trending chart was sitting at 0.30x its own channel's median, while another chart entry was at
  25.7x. Raw view counts cannot tell those apart.
- **Trending now.** YouTube's own published chart, by region and category.

All three read public data only, and all three stay inside one content owner at a time — see
`withinOwner` in `src/lib/youtube/scope.ts`, which throws rather than combining two.

## The access model

The one load-bearing decision: **locked metrics are never sent to an unauthorised browser.**
Frosted glass is a curiosity device over placeholder geometry, not access control.

```
anon visitor      →  creator_public_profiles view   →  identity + 2–3 chips only
token holder      →  get_report_by_token() RPC      →  validates, logs the view, returns payload
pro agency member →  RLS on report_metrics          →  any creator with is_directory_visible
creator (owner)   →  RLS on report_metrics          →  own row only
worker / Stripe   →  service role                   →  bypasses RLS
```

- `anon` holds **no** table privilege on `social_accounts`, `report_metrics`, `access_requests`,
  `organizations`, or the campaign tables. Its entire surface is `SELECT` on two views and
  `EXECUTE` on two `SECURITY DEFINER` functions.
- **Track B's paywall is an RLS policy**, not an app check. `directory_listings` is a
  `security_invoker` view over `report_metrics`, so a free-plan account joins against zero visible
  rows and the directory comes back empty. The upgrade wall only picks which empty state to draw.
- Brands never `INSERT` into `access_requests` — `request_creator_access()` owns the write, so
  `status`, `access_token`, and `expires_at` cannot be forged. No account needed to propose.
- Approval rotates the token and stamps a 14-day expiry **in a trigger**, and the creator's client
  holds a column grant on `(status, expires_at)` only. A creator cannot mint their own grant.
- Column-level grants also keep `creators.is_verified` and `organizations.billing_plan` out of
  client reach: a creator cannot self-verify, and an org admin cannot sell themselves a Pro plan.
- `get_report_by_token()` binds the token to the requested handle, so a grant for creator A cannot
  unblur creator B. `expired` is reported distinctly from `invalid` — the holder had a real grant.

## Gatekeeper precedence

`resolveProfileAccess()` tries four verdicts in order: **owner → pro_agency → token → locked**.
Pro is checked before the token so a standing entitlement doesn't burn a per-link view counter, but
it falls through to the token when the creator has *not* opted into the directory — an agency can
still hold a 1:1 grant. On every locked branch the returned object has no `report` key at all.

## Layout

```
supabase/migrations/0001_init.sql   Schema, RLS, 2 views, 3 functions
supabase/migrations/0002_registration.sql
                                    create_organization(), reserved handles
src/lib/auth/actions.ts             Magic-link send
src/app/auth/callback|continue      Code exchange, post-sign-in dispatch
src/app/join, /onboarding           Registration screens
src/types/index.ts                  Domain contract (ProfileView union)
src/types/database.ts               Row + RPC shapes as PostgREST returns them
src/lib/schemas.ts                  Zod for jsonb columns, forms, and URL filters
src/lib/access/gatekeeper.ts        The four-verdict resolver
src/lib/access/viewer.ts            Who is asking (identity, not authorisation)
src/lib/data/directory.ts           Track B listing query
src/lib/supabase/server.ts          anon / session / service-role clients
src/middleware.ts                   /handle → /@handle, no-store on ?token=
src/app/[handle]/page.tsx           Public profile
src/app/directory/page.tsx          Pro directory + bulk briefs
src/app/dashboard/requests/page.tsx Creator inbox
```

## Setup against a real project

```bash
cp .env.local.example .env.local     # fill in URL + anon key
supabase db push                     # or: psql -f supabase/migrations/0001_init.sql
```

## What the report shows, and what it deliberately doesn't

The report is trimmed to what changes a buying decision. Anything that appeared twice, or that a
marketer cannot act on, was cut:

| Cut | Why |
| --- | --- |
| Headline metrics grid (unlocked) | Duplicated the verdict strip — brand safety rendered 3×, purchase intent and CPM 2× each. It now serves the locked teaser only. |
| Brand-safety gauge and composite score | A number out of 100 is not actionable, and the verdict already carries it. The named flags survive. |
| Two organic-vs-sponsored bar charts | Restated the two figures printed directly above them. |
| Standalone sentiment score | Soft signal. Nobody buys on "78.4"; it survives inside the organic → sponsored comparison. |
| Engagement rate in the risk panel | A commercial metric filed under risk. Moved next to cost, where it explains cost-per-engaged. |
| "Off-topic and banter" comment cluster | Real signal about the channel, zero bearing on a buying decision. |
| Per-panel provenance and disclaimers | Stated once in a single footnote instead of three times. |

A second pass cut the prose itself — the unlocked report went from 5,988 to 3,581 characters of
visible text (**40%**), without dropping a single figure:

| Cut | Why |
| --- | --- |
| Public opinion narrative + theme quotes | The themes, shares and sentiments already said it. **−62%** on that panel. |
| AI summary paragraph | Restated the clusters panel almost line for line. Reduced to a one-line lede on the brief, which is the part available nowhere else. |
| Section subtitles | "What does this cost, and is it good?" restated the section label above it. |
| Long-form disclaimers | Three paragraphs became three short lines; the page footnote halved. |
| "organic → sponsored" caption ×2 | The `184K → 171K` arrow already says it. Stated once in the panel meta. |
| "Highest flag: competitor conflict" | Made *competitor conflict* appear three times inside one strip. The tile now counts flags; the callout below names one. |

Numbers stay, prose shrinks. What survives in prose is the brief, the risk notes, and the comment
quotes — the parts a buyer cannot reconstruct from a number.

### Creators who have never run an advertisement

A never-sponsored creator is a *position*, not an absence, and the report used to render it as a
row of blanks plus one fabricated number.

- **`adFatigueLevel` is nullable.** Ad fatigue is response decay across sponsored posts; with zero
  sponsored posts there is no decay to measure. The mapper used to default an absent value to
  `'moderate'`, and a creator with no sponsorship history was being shown a reassuring `'low'`.
  Null now means *no basis*, the type makes that representable, and the directory excludes
  unmeasured creators from a fatigue filter rather than quietly counting them as low.
- **Organic-only CPM is flagged.** CPM comes from median views, and for these creators every view
  is unsponsored — so the headline is the best case presented as the expected case. The panel now
  states it and gives a realistic figure using `cohortMedianRetention`, which is computable cohort
  data rather than an invented multiplier: *"$387 organic · budget nearer $490 at the category's
  79% retention."*
- **The tradeoff is named**, in favour and against, instead of an empty panel: no ad fatigue, no
  competitor conflict and no exclusivity to clear, against no evidence of how the audience reacts
  to a first paid placement.

### One entry is real

`/@jooshica` is the only creator in the fixture set assembled from an actual channel rather than
invented — read from public YouTube data on 2026-09-12: 2.91M subscribers, 30 video titles and
view counts, nothing else.

It exists to prove the degradation paths under real constraints rather than staged ones. Median
94.5K views, peak 845K — **8.9× the median**, which is exactly the spread the peak column was added
for. Everything requiring credentials is null, not estimated:

| Blocked by | Fields |
| --- | --- |
| OAuth, channel owner | demographics |
| Data API key | comment text → clusters, sentiment, intent, brand safety; per-post likes |
| Creator self-declares | minimum budget → CPM |

She is also `isVerified: false` — verification means confirmed 1st-party OAuth data, and this
profile has none.

### Creators with no readable comments

Every qualitative score is derived from the comment corpus. When it is empty — comments disabled,
account too new, access restricted — the application was coercing NULL to 0 and rendering:

```
purchase intent 0.0%    sentiment 0.0    brand safety 0.0/100
```

which reads as a toxic audience that never converts. The truth is *not measured*, and that
rendering would have actively damaged a creator for turning comments off. Same failure as the
ad-fatigue default in 0008, on three headline figures at once.

`sentimentScore`, `purchaseIntentRate`, `brandSafetyScore` and their per-platform equivalents are
now nullable, so "no basis" is representable rather than collapsing into the worst possible
rating. `comment_coverage` records *why*, and the notice names it: *"The creator has comments
turned off, so nothing here is measurable from them."*

**Partial coverage is flagged separately.** Comments readable on 3 of 40 posts is a biased sample,
not merely a small one, and it gets its own gap line.

What still works without comments is most of the report: demographics and output come from
platform analytics, public opinion is off-platform, cost comes from views. `/@northvane` is the
worked example — 318k followers, comments disabled, and a report that says what it can and
declines what it cannot.

In the directory, unmeasured creators **drop out of measured filters** rather than sorting as
zero: "purchase intent above 10%" is a question they cannot answer, so ranking them last would be
a silent wrong answer.

### Thin data

Most creators are small, and the pipeline will happily emit a purchase-intent rate from forty
comments. Rendered at the same weight as a figure drawn from twelve thousand, that is not a thin
signal — it is a wrong one, and it is the failure mode that would make the product useless for the
long tail it most needs to serve.

`src/lib/report/sufficiency.ts` classifies each signal from counts already in the report — no new
pipeline contract. Thresholds are stated in one place rather than scattered through components:
below ~100 comments a four-way intent split puts single digits in each bucket, so the percentages
move several points per comment.

What changes when the sample is thin:

- **Percentiles are withheld** when the cohort is too small to rank against — "No cohort ranking
  yet" rather than a number that looks like a ranking.
- **A notice lists every gap** and what would close it.
- Comment clusters carry their **count alongside the share**, so `34%` reads as `34% · 41`.

`/@fernpress?token=…` is the worked example: 8.4k followers, 121 comments, no sponsored history,
cohort of 11, no off-platform discussion. `npm run verify:sufficiency` pins the thresholds.

### Figures, not commentary

The report states numbers and their context; it does not write the buyer's conclusion for them. A
written verdict ("Strong commercial fit"), per-platform prose reads, the AI summary paragraph and
the do/avoid brief were all removed — the tiles carry the read on their own.

One thing that looks like prose survives because it is not interpretation: the **sufficiency
notice**, which states what the sample cannot support. A risk callout that repeated the top
brand-safety flag above the fold was removed — the flag is stated in full in its own panel, and
surfacing it twice was emphasis, not information.

Platform cards carry figures only. Intent badges ("Highest intent", "Buying", "Praise") were
labels asserting a conclusion the purchase-intent number already makes.

The underlying columns (`ai_summary`, `recommended_actions`, platform notes, controversies) are
still written by the pipeline and still stored — they are analysis, and dropping the columns would
be destructive. They are simply not rendered, and the client components take **narrowed props** so
unrendered fields do not ship in the RSC payload either.

### Evidence is checkable

Both qualitative panels used to rest on a single unattributed quote. For a product whose entire
claim is *don't take the creator's word for it*, that was the weakest thing in the report — a buyer
could not tell a typical comment from a cherry-picked one, and could not check either.

**Comment clusters** draw from the creator's **own posts and videos**. Each cluster now carries its
keyphrases (so the grouping is legible), an absolute `commentCount` rather than a rounded share,
and two to three comments with likes, date, and a permalink to the comment itself. Each states
**why it was surfaced** — `typical`, `most liked`, `most recent` — because a buyer reads a
most-liked comment very differently from a representative one.

**Public opinion** tabs by platform: `Overall · YouTube · Reddit · X · Instagram · TikTok ·
Forums · Press`, each carrying its mention count.

The tab list is **fixed** — `OPINION_PLATFORMS` — not derived from whatever the results contain,
and each tab has **three** states, not two:

| State | Shows | Means |
| --- | --- | --- |
| has data | `Reddit 812` | read, and found discussion |
| covered, empty | `Reddit 0` | read, and there was nothing there |
| **not covered** | `Reddit —` struck through | **not read — nothing is claimed either way** |

The third state exists because inferring coverage from results is a lie whenever a platform could
not be reached. `coveredPlatforms` records where we actually looked. A zero is a measurement; a
dash is not.

**Reddit is a licensing question, not an engineering one.** Its anonymous `.json` endpoint returns
403 and it blocks crawlers, but that is the lesser obstacle. Reddit's
[Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy)
states:

> You must not sell, license, share, or otherwise commercialize Reddit data without express written
> approval. This extends to commercial and non-commercial mining, scraping, or using data for
> purposes like ads targeting or to train machine learning or AI models.

adfit would do every part of that — share excerpts with paying agencies, run an LLM over them, and
exist to inform ad placement. So Reddit stays out of `coveredPlatforms` until there is written
approval, **however the data is obtained**; a technically clever route around the 403 would not
change the answer.

**X and Instagram were checked and block it too**, by different clauses:

| Platform | Clause | Why adfit hits it |
| --- | --- | --- |
| **Reddit** | "must not sell, license, share, or otherwise commercialize Reddit data without express written approval… extends to ads targeting or to train machine learning or AI models" | share + commercialize + mine + ads targeting + LLM. Five for five. |
| **X** | "we restrict the redistribution of X Content to third parties… you may only distribute Post IDs, Direct Message IDs, and/or User IDs" | the panel shows post *excerpts* to brands, not IDs. The 500-objects carve-out is for **non-automated** delivery (spreadsheets, PDFs) — not a live report. |
| **Instagram / Meta** | prohibited: "Selling, licensing, or purchasing Platform Data" and "Processing Platform Data without valid User consent in order to **build or augment user profiles** for any purpose" | building creator profiles and selling access is the product. |

**The constraint is the public-opinion feature, not the product.** The 1st-party half — demographics
and comments from channels the creator authorised via OAuth — is exactly what these APIs are for,
and consent is the mechanism. It is the third-party half, aggregating what *other* people said
about a creator on platforms they do not control, that needs licensing.

X has a compliant shape worth noting: store **Post IDs only** and render through X's official embed,
so the content is served by X rather than redistributed by adfit. That satisfies "the best place to
get X Content is directly from X" and would let the panel show real posts without holding them.

**YouTube is the exception — it expressly permits this.** Its
[derived-metrics policy](https://developers.google.com/youtube/terms/derived-metrics-policy) names
adfit's use case almost line for line:

> **Planning (Creator Insights):** You may use API Data metadata to assess channels and videos for
> both "Brand Suitability" and "Brand Safety" for the purpose of **influencer marketing, vetting,
> and matchmaking**.

and permits, by explicit example: a "Creator Influence Score" from weighted view/engagement ratios;
**NLP on comments fetched via the Data API** to publish a satisfaction rating; and *"using API Data
to advise brands on how much to pay a channel for a sponsorship."*

Three conditions attach, and adfit does not meet all of them yet:

1. **Accept the amendment.** Derived metrics are prohibited by default. Acceptance is via the quota
   extension form — "Section 5: Use Cases…" → "Analytics & Reporting". Process, not code.
2. **Financial disclaimer.** §2 requires projections be shown as third-party estimates with a
   prominent disclaimer they are not Google-approved. *Done* — the cost panel now reads
   "A third-party projection, not approved by Google or YouTube."
3. **30-day retention on content.** This is the open one. Accepted clients may store *statistical*
   metrics and *derived* metrics for 36 months — but:

   > Other data (such as video titles, creator names, descriptions, and **comment text**) must
   > still follow the 30-day refresh and deletion policy.

   `top_comment_clusters[].comments[].text` and `.postTitle` are stored indefinitely. **That needs a
   30-day refresh-or-delete job before this ships.** Cluster shares, counts and sentiment scores are
   derived metrics and may stay.

One boundary worth stating: §4 forbids inferring protected attributes — age, race, religion,
politics, orientation, health. adfit's age and gender come from the Analytics API *with the
creator's authorisation*, which is reading consented data rather than inferring it. The line to not
cross is estimating those attributes from comments.

It makes footprint shape visible at a glance. Marah's discussion is Reddit 812 / X 604 /
Forums 341 / Press 90 and **zero** on YouTube; Jooshica's is **7.9K on YouTube and zero
everywhere else**. Two very different reputational profiles that a derived tab list would have
rendered as the same shape.

Filtering narrows the *evidence*, never a theme's measured share — a theme is 38% of all mentions
whether or not the selected platform carries the sample. Per-platform sentiment is volume-weighted,
so a four-mention platform cannot swing the mean.

Themes each show a sample excerpt **inline**, with source, engagement, date and
a link out to the third-party discussion. These briefly sat behind a disclosure to save height; a
quoted line is the whole reason to trust a theme label, so hiding it meant most readers never saw
the evidence for any of them.

Two deliberate constraints:

- **No author field, anywhere.** Comments and posts are public and the permalink exposes whoever
  wrote them, but reprinting handles inside a document that gets emailed around a buying team is a
  different act from linking to the source.
- **Every href is validated before render.** `safeExternalUrl` admits only `http`/`https`, so a
  `javascript:` or `data:` URL written into a jsonb column cannot execute on click; links carry
  `rel="noopener noreferrer"` and show their destination host. A URL that fails validation still
  renders its label as plain text — losing the link beats dropping the provenance.

On paper a link is not clickable, so the print sheet names the post and date instead.

### Units

Two scales coexist in one report and that is a reading hazard, so both are always stated:
`sentimentScore` and `brandSafetyScore` run **0–100** (rendered `94.1/100`), while comment- and
mention-level sentiment is **signed, −1 to +1**. `SENTIMENT_SCALE` in `src/lib/format.ts` is the
single source for that label so no panel invents its own wording, and `signedSentiment()` renders
the value with a true minus sign.

Every figure group carries what it is measuring — `share of comments · count · sentiment −1 to +1`,
`% of comments affected`, `share of sponsored posts`. A number without its unit is not a fact.

### Bars use their track

Demographics shows all three dimensions at once, each scaled to **its own** largest bucket —
geography tops out at 41% and age at 47%, so a shared scale would leave both columns half empty.
These were briefly tabbed on the grounds that three sets of bars read as noise; that was true when
every bar was drawn against an absolute 100% track, and stopped being true once each section got
its own scale.


`ShareBar` takes an optional `max`: bars scale against the largest value in their set rather than
an absolute 100%. A group of 38/27/19/16% values drawn against a full track is four slivers in a
mostly empty row, and the differences between them — the only reason to draw a bar — become
unreadable. Peak fill went from 47% to 100%. Same treatment on the print sheet.

### Progressive disclosure

A third pass made three panels interactive, which cut what is on screen again (3,581 → 3,259
chars) while putting *back* detail the compaction had deleted outright:

- **Comment clusters split horizontally.** Stacked vertically they read as unrelated facts; side
  by side they read as one audience divided into perspectives, which is the actual claim. A
  proportion bar above makes the split legible before a single label is read, and selecting a
  perspective reveals its representative quote — so all four quotes are available, one at a time,
  instead of four walls of text or none.

All three are client components receiving already-authorised props, so the gate is unchanged: a
locked visitor gets placeholder geometry behind the glass and the controls are inert via
`pointer-events: none`.

## PDF export

`/@handle/print?token=…` renders the whole report as one A4 page. Print CSS and the browser's own
Save-as-PDF, not a rasterising library — the output stays **selectable and searchable**, which
matters for a document that gets pasted into a deck or attached to a procurement thread. Zero
bundle cost.

A separate route rather than print rules over the profile, for one reason: the interactive panels
hide most of their content behind tabs, so printing the profile would emit a quarter of the
demographics and one comment quote. The sheet expands everything.

- Entitlement runs through the same gatekeeper — **if you cannot read the report you cannot print
  it.** Verified locked for anon, expired tokens, free-plan agencies, and directory opt-outs.
- The sheet records **who it was issued to**, in the masthead and the footer, so a leaked PDF is
  traceable to a grant.

## Offers — the end of the funnel

`submit_offer()` accepts from two senders and lets neither INSERT directly:

- **Track A** — a token holder with *no account at all*. The access token is the credential, and
  the RPC re-validates it on exactly the terms `get_report_by_token()` uses: approved, unexpired,
  and bound to this creator.
- **Track B** — a signed-in Pro member, only for a creator who opted into the directory. The same
  condition that unlocked the report.

The rule the UI states is one sentence: *if you can read the report, you can make an offer on it.*
The creator holds a column grant on `offers.status` alone, so accepting or declining cannot alter
the fee or terms being responded to.

**Revoking** sets `expires_at` into the past, so `get_report_by_token` reports the link as
`expired` — a better dead end for the holder than a silent failure. The schema always allowed this;
until now nothing in the UI exposed it, so "revocable" was a claim the product could not honour.

## Not yet built

- OAuth connect flow for YouTube Data/Analytics and Instagram Graph
- Team invites — `create_organization()` enforces one org per user for now
- The LLM pipeline that writes `report_metrics`
- Stripe checkout + the webhook that sets `organizations.billing_plan`
- Notification email — three `TODO(phase-2)` hooks are in place (access approved, proposal
  received, offer received); all need an email provider

## Before real creator tokens land

`social_accounts.access_token` / `refresh_token` are plaintext columns. RLS keeps them off the API
(no role but the owner and the service role can read the table), but move them into Supabase Vault
(pgsodium) and store only the secret id before ingesting a live token. The rate limiter in
`src/app/actions/request-access.ts` is per-instance and needs a shared store once this runs on more
than one node.
