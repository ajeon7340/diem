# Product Marketing Context — adfit

Shared positioning context. Every marketing skill in `marketing-skills` reads this file
before writing anything, so corrections here propagate to all downstream copy.

**Document version:** 1.0.0
**Last updated:** 2026-09-11

---

## 1. Product Overview

**One-liner:** A verified media kit for creators, and the ad-fit report brands need before
they commit budget.

**What it does:** Creators connect YouTube and Instagram once. adfit pulls their 1st-party
analytics and runs their comment sections through an LLM pipeline that clusters comments by
intent, scores sentiment and brand safety, and benchmarks every figure against the creator's
category. The result is published at `/@handle` with the sensitive half locked. Brands see a
teaser, request access, and the creator approves individually.

**Category:** Creator/influencer media kit and audience verification. Adjacent shelf:
influencer marketing platforms (Grin, Aspire, CreatorIQ) and audience-audit tools (HypeAuditor,
Modash).

**Product type:** Two-sided B2B SaaS marketplace.

**Business model:**
- Creators: free, permanently. They are the supply.
- Brands: free for unlimited 1:1 proposals. No account needed to read a creator's public link.
- Agencies: paid (Pro Agency) for directory search, instant unlocked access to opted-in
  creators, and bulk briefs.

---

## 2. Target Audience

**Target companies:** DTC brands ($1M–$50M revenue) running creator campaigns in-house, and
independent influencer/social agencies managing 5–50 creator relationships per quarter.

**Decision-makers:** Influencer marketing manager, growth/performance marketing lead, agency
account director. Budget holder is usually a VP Marketing or founder at the smaller end.

**Primary use case:** Decide whether a specific creator is worth the spend, before signing.

**Jobs to be done:**
1. "Tell me if this creator's audience actually buys things, not just watches."
2. "Give me something I can put in front of my boss to justify this spend."
3. (Creator side) "Let me prove my audience quality without emailing analytics screenshots to
   every stranger who asks."

---

## 3. Personas

**The Champion — Influencer Marketing Manager.** Cares about not being the person who picked
the creator whose campaign flopped. Their challenge: every media kit they receive is a
self-reported PDF with screenshots. We promise: numbers the creator cannot edit, plus the
qualitative read they currently guess at.

**The Financial Buyer — VP Marketing / founder.** Cares about CAC and defensible spend. Their
challenge: creator budget is the least measurable line item they own. We promise: an estimated
CPM and a category percentile, so the decision has a paper trail.

**The User — Agency account director.** Cares about throughput — evaluating many creators fast.
Their challenge: the research is manual and doesn't scale. We promise: filter a directory by
purchase intent, ad fatigue, and cost ceiling, then brief many creators at once.

**The Supply Side — The Creator.** Cares about being valued for audience quality rather than
follower count, and about not leaking their analytics. We promise: a link that proves it, and
per-brand control over who sees what.

---

## 4. Problems & Pain Points

**Core challenge:** A follower count says nothing about whether that audience buys. Brands pick
creators on reach and vibes, then discover the mismatch after the invoice.

**Why current solutions fall short:**
- *Self-reported media kits* — a PDF the creator made in Canva. Unverifiable by construction.
- *Audience-audit tools* — scrape or estimate from outside. They catch obvious bot followers but
  can't see the creator's real demographics, and they say nothing about comment intent.
- *Platform native analytics* — the creator sees them; the brand never does.
- *Gut feel and past relationships* — doesn't scale and encodes the buyer's blind spots.

**What it costs them:** A mid-size creator campaign is $15k–$50k. Getting it wrong burns the
budget and the quarter. Nobody gets fired for a bad Meta campaign — the data explains itself.
Creator spend has no such defence.

**Emotional tension:** The buyer is making a five-figure decision on a screenshot and a hunch,
and they know it.

---

## 5. Competitive Landscape

**Direct:** HypeAuditor, Modash, Upfluence — audience audits and creator discovery. They are
outside-in: estimates and scraping. They do not hold 1st-party analytics, and they do not read
the comment section for intent.

**Secondary:** CreatorIQ, Grin, Aspire — full campaign-management suites. They solve workflow
after you've chosen the creator; adfit solves the choice itself. Also priced for enterprise.

**Indirect:** The status quo — a Google Sheet, a media kit PDF, and a call. Free, familiar, and
the default we actually have to beat.

---

## 6. Differentiation

1. **1st-party, OAuth-authorised data.** Demographics come from the creator's own platform
   analytics, not a panel or a scrape. This is the thing competitors structurally cannot copy
   without creator consent.
2. **Qualitative, not just demographic.** Comment clustering by intent — purchase, praise,
   question, critique — with representative quotes. Nobody else reads the comment section.
3. **Creator-controlled access.** Locked by default, approved per brand, time-limited link.
   This is why creators opt in at all, and it's what makes the 1st-party data possible.
4. **Decision-grade, not description-grade.** Every figure carries a category percentile, an
   estimated CPM, named brand-safety flags, and a structured do/avoid brief.

---

## 7. Voice & Messaging Rules

- Clear over clever. This audience is spending real money and is already suspicious of
  influencer-marketing hype.
- Specific numbers over adjectives. "28% of comments ask where to buy" beats "high intent".
- **Never fabricate proof.** Pre-launch: no invented customer counts, logos, or testimonials.
  Proof comes from describing the mechanism precisely, not from borrowed credibility.
- Name the limits. Cost figures are estimates, not rate cards; the report is model-generated.
  Saying so is a trust asset with this buyer, not a weakness.
- No exclamation points. No "revolutionise", "seamless", "unlock the power of".

---

## Changelog

- **1.0.0** (2026-09-11) — Initial draft, auto-drafted from the codebase (schema, README,
  report structure, access model) during the marketing-surface rework.
