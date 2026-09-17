import { CATEGORY_CAUTION, CATEGORY_LABEL, type CampaignCategory } from '@/types';
import type { FitClaim } from './fit';

/**
 * The offline stand-in for the fit read.
 *
 * Local development has no ANTHROPIC_API_KEY, and a panel that only ever
 * renders an error teaches nobody anything about the feature. These are
 * hand-written against the fixture figures so the surface can be driven end to
 * end — the refusal branches, the claim check, the dropped-claim warning, the
 * staleness line — without a network call.
 *
 * IT IS NOT THE FEATURE, AND MUST NEVER BE MISTAKEN FOR IT.
 *
 * These are written in the pitch voice the real prompt asks for — lead with
 * the strongest honest match, name what the creator is NOT for — but they are
 * pitched at nobody in particular, because a stand-in cannot read a buyer's
 * profile. That is the half that makes the real feature worth having.
 *
 * The real read is written against the organisation looking at the page and
 * the brief they are working from; that is the entire justification for having
 * generated prose in a report that deleted its verdict, its per-platform reads
 * and its do/avoid brief. These paragraphs are keyed to the CREATOR alone.
 * They would read identically to every viewer — which is precisely the test
 * the real feature has to pass and this one deliberately fails. So:
 *
 *   - it is reachable only when there is no API key AND Supabase is
 *     unconfigured, i.e. the fixture demo and nothing else;
 *   - it is never written to `fit_summaries`;
 *   - the panel labels it a stand-in rather than a generated read.
 *
 * The claims are real, and are checked against the live report exactly as a
 * model's would be. If a fixture figure moves, the sentence that cites it gets
 * dropped and the panel says so — which makes this a working test of the
 * verification path rather than a decorative placeholder.
 */

/**
 * Where a fixture creator is a poor match for a category, and what to say
 * instead. Redirects rather than rejections — a mismatch is a routing problem,
 * and the creator did not choose to be measured against this brief.
 */
const OFF_CATEGORY: Record<string, Partial<Record<CampaignCategory, string>>> = {
  jooshica: {
    technology:
      'Her product conversation is cosmetics, not hardware — a tech placement would be buying reach rather than the intent this channel does have. Beauty and entertainment are where the same audience already engages with products.',
    finance:
      'Nothing in this channel\u2019s history is finance-adjacent, so there is no signal either way — that is an absence of evidence rather than a negative read.',
  },
  quietcircuit: {
    beauty:
      'This is a measurement-led audio audience; a beauty placement has no precedent here to read against. Their strength is technical credibility, which is worth more to a category where specifications decide the purchase.',
  },
  fernpress: {
    gaming:
      'A stationery and paper audience with no gaming history, so there is nothing to measure against. The 34% intent this channel does show is worth testing in the categories it already covers.',
  },
};

interface LocalFit {
  summary: string;
  claims: FitClaim[];
}

const BY_HANDLE: Record<string, LocalFit> = {
  marahwoods: {
    summary:
      'If you need the buying signal to be provable rather than promised, this is the one: 28.1% intent across 11,842 comments with the floor still at 27.3%, and nine product placements at 92.9% sponsored retention saying the paid history agrees with the comment section. You are not buying a hypothesis here. What you are negotiating is price — plan around the $97.83 estimated CPM and spend the argument there.',
    claims: [
      { text: 'Intent is 28.1% of the product conversation.', metric: 'purchaseIntentRate', value: 0.281 },
      { text: 'The lower bound holds at 27.3%.', metric: 'purchaseIntentFloor', value: 0.273 },
      { text: 'Drawn from 11,842 comments.', metric: 'commentsAnalyzed', value: 11_842 },
      { text: 'Nine posts carried a product.', metric: 'productPostsAnalyzed', value: 9 },
      { text: 'Sponsored posts hold 92.9% of organic views.', metric: 'sponsoredRetention', value: 0.929 },
      { text: 'Estimated CPM of $97.83.', metric: 'estimatedCpm', value: 97.83 },
    ],
  },
  quietcircuit: {
    summary:
      'Buy this one for the verdict, not the volume. 9.0% intent over 3,104 comments with an 8.0% floor is a modest number measured well, and the audience arrives to evaluate rather than to buy on sight — which is exactly what you want when a specification decides the purchase. Sponsored posts hold 74.9% across three placements, so pay for the endorsement carrying weight and not for the reach.',
    claims: [
      { text: 'Intent is 9.0%.', metric: 'purchaseIntentRate', value: 0.09 },
      { text: 'With a lower bound of 8.0%.', metric: 'purchaseIntentFloor', value: 0.0804 },
      { text: 'Drawn from 3,104 comments.', metric: 'commentsAnalyzed', value: 3_104 },
      { text: 'Sponsored posts retain 74.9% of organic views.', metric: 'sponsoredRetention', value: 0.749 },
      { text: 'Across three product-bearing posts.', metric: 'productPostsAnalyzed', value: 3 },
      // Was 'Brand safety scores 95.8' — a figure from the 0-100 composite
      // that was deleted. `raisedFlags` is a COUNT, so the claim could never
      // match and the panel carried a dropped-claim warning on every render.
      { text: 'One of three checks raised a flag, at low severity.', metric: 'raisedFlags', value: 1 },
    ],
  },
  fernpress: {
    summary:
      'The strongest intent signal in the directory, and the cheapest place to find out whether it holds: 34%, with 121 comments putting the honest floor at 26.2%, and no product placement yet to prove it either way. Neither of the two checks that ran raised anything, which is a small screen and a real result. One placement turns this from the best guess available into evidence, and you would be the one holding it — the $387.10 CPM is what a small audience costs, not what a weak one does.',
    claims: [
      { text: 'Intent reads 34%.', metric: 'purchaseIntentRate', value: 0.34 },
      { text: 'With a 26.2% lower bound.', metric: 'purchaseIntentFloor', value: 0.2617 },
      { text: 'From 121 comments.', metric: 'commentsAnalyzed', value: 121 },
      { text: 'No product-bearing posts yet.', metric: 'productPostsAnalyzed', value: 0 },
      // Same stale composite. Nothing raised is a real result and says so;
      // it is not a score, and two checks is a small screen, which the panel
      // beside it prints.
      { text: 'Neither check raised anything.', metric: 'raisedFlags', value: 0 },
      { text: 'Estimated CPM of $387.10.', metric: 'estimatedCpm', value: 387.1 },
    ],
  },
  // REWRITTEN BECAUSE THE EVIDENCE MOVED, AND THE ARGUMENT MOVED WITH IT.
  //
  // This paragraph used to sell "attention that stays: the one paid post held
  // 76% of organic views, which at this size is a real result." The 76% came
  // from a fabricated promotion row — the video did not exist — and the real
  // placement holds 31.9%. That is not a softer version of the same pitch, it
  // is the opposite finding, and the honest read leads with the drop-off
  // instead of burying it. A stand-in that kept the old sentence with a new
  // number would have been the exact failure the claim check exists to catch.
  jooshica: {
    summary:
      'Buy this for reach and for the top of a funnel, and price the drop-off in before you sign: the one paid placement on record took 31.9% of her organic median, so a sponsored post here reaches roughly a third of the audience an organic one does. What you are buying at that price is still 2.9M subscribers and a 21,330-comment section, and 18.1% of the product conversation carries real intent — but that conversation is a small slice of an audience that shows up for her rather than for what she holds. If your brief is direct response, this is the wrong buy and the figures say so. If it is awareness at scale in beauty, one placement is not enough evidence to judge her on and the second one is where you will learn something.',
    claims: [
      { text: 'Intent is 18.1% of the product conversation.', metric: 'purchaseIntentRate', value: 0.1812 },
      { text: 'Across 21,330 comments.', metric: 'commentsAnalyzed', value: 21_330 },
      { text: 'The one paid placement took 31.9% of organic views.', metric: 'sponsoredRetention', value: 0.319 },
      // No brand-safety claim: it used to cite "89.8", a leftover from the
      // 0-100 composite that was deleted. `raisedFlags` is a COUNT now, so the
      // claim could never match and the panel carried a dropped-claim warning
      // on every render.
    ],
  },
  // The only stand-in written for a creator whose figures are mostly ABSENT,
  // and the reason it is here: the pitch voice is easy to sustain when there is
  // a 28% intent rate to lead with, and the honest version of this feature is
  // the one that still argues when there is not. Nothing is invented — the
  // claims below are the four things actually measured on this channel.
  gajaeman: {
    summary:
      'Two things are measured here and neither is purchase intent: 2,392 comments read across five uploads, and 1.55% engagement on a 474,000-subscriber channel posting three times a week. That is a loud, present audience and nothing yet says whether it buys — the classifier has not run, and a rate invented in its absence would be the only dishonest number in this report. What the census does say is the part most buyers will decide on: 7.4% of that section carries an insult, a slur, a threat or something sexual, none of it written by the creator. For a mainstream consumer brief that is disqualifying and you should stop here. For endemic gaming, peripherals or anything sold to people who already live in this register, a combative section is the audience you were trying to reach and everyone else is paying to avoid it. Ask for one placement and the intent read at the same time; both are cheap next to guessing.',
    claims: [
      { text: '2,392 comments have been read.', metric: 'commentsAnalyzed', value: 2_392 },
      { text: 'Engagement runs 1.55%.', metric: 'engagementRate', value: 0.0155 },
      // No `productPostsAnalyzed` claim: `intent` is null on this row, so there
      // is nothing to check it against and verifyClaims correctly drops it.
      // Leaving it in would put a permanent "1 claim dropped" warning on the
      // panel for a figure the paragraph never cites.
      { text: 'No brand-safety flag has been raised against the creator.', metric: 'raisedFlags', value: 0 },
    ],
  },
  // northvane has no comment corpus, so assessFitEligibility refuses before
  // anything here is reached. Its absence is the correct behaviour, not a gap.
};

/**
 * Only in the fixture demo.
 *
 * Both conditions matter. No API key alone would let this answer in a real
 * deployment whose key had merely gone missing — which would turn an outage
 * into silent, plausible, creator-generic prose presented as a generated read.
 * That is the worst failure this feature has available to it.
 */
export function isLocalFitMode(): boolean {
  return (
    !process.env.ANTHROPIC_API_KEY &&
    !(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function localFitSummary(
  handle: string,
  category: CampaignCategory | null,
): LocalFit | null {
  const base = BY_HANDLE[handle];
  if (!base) return null;
  if (!category) return base;

  const caution = CATEGORY_CAUTION[category];
  const label = CATEGORY_LABEL[category];
  const off = OFF_CATEGORY[handle]?.[category];

  return {
    // The stand-in cannot actually reason about a category, so it says which
    // one it was asked about and, where the fixture knows the creator is a poor
    // match, redirects rather than staying silent — the same move the prompt
    // asks the real read to make. Anything cleverer here would be inventing.
    summary: [
      `For a ${label} campaign: ${base.summary}`,
      off ?? null,
      caution ?? null,
    ]
      .filter(Boolean)
      .join(' '),
    claims: base.claims,
  };
}
