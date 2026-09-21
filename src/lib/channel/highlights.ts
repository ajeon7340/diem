import type { ChannelReportView } from './report';
import { comparable, performance, setAside } from './report';
import { composition, dominantFormat, FORMAT_LABEL } from './composition';
import type { VideoEvidence } from '@/lib/ingest/analyze';
import type { Promotion } from '@/types';

/**
 * What the report actually says, decided from collected facts.
 *
 * THE SUMMARY WAS THE CHANNEL'S OWN BIO. `report.description` is prose the
 * creator wrote about themselves, printed under a heading that said "Executive
 * summary" — so the first thing a buyer read was marketing copy presented as
 * our finding. Nothing here comes from the bio. Every sentence below is built
 * from figures this collection produced, and when a figure is missing the
 * sentence says so rather than being dropped.
 *
 * EVERYTHING IS DETERMINISTIC. No model call, no gate: these are counts,
 * medians and dates over one channel's own sample, which is the within-owner
 * arithmetic III.E.2 permits and `scope.ts` describes. The gated material —
 * comment themes, the content profile — stays where it was and is rendered
 * only when approval is configured.
 *
 * FOUR CLAIMS WERE REMOVED FROM HERE BECAUSE THEY DID NOT FOLLOW FROM WHAT WAS
 * MEASURED, and each replacement computes the thing the sentence was reaching
 * for rather than softening the wording:
 *
 *   "the top upload is 4.7× the median, so one video carries much of the
 *   reach"   Two faults. A ratio to the median says nothing about a share of
 *            the total — a sample of identical videos plus one at 4.7× has its
 *            top upload carrying 4% of the views, not "much". And views are not
 *            reach: one person watching ten times is ten views and one person.
 *            Now: the top upload's SHARE OF TOTAL SAMPLED VIEWS is computed and
 *            printed, and the word reach is gone from the product.
 *
 *   "both formats appear, so a brief can ask for either"   Having published a
 *            Short does not establish that anyone will accept a Short as a
 *            deliverable. Publishing history is not availability. The sentence
 *            states the composition and stops; availability moved to the
 *            questions, where it is asked rather than assumed.
 *
 *   "nearest the median, so it shows a typical upload"   Proximity to a view
 *            count says nothing about whether the CONTENT is typical, and the
 *            median in question was taken across mixed formats on a channel
 *            that is 70% long-form. Now the middle is found WITHIN a format
 *            group and the label describes what it measured.
 *
 *   "collection was capped — ask what else was published"   That is our
 *            incomplete collection turned into a question for the creator.
 *            A cap is a limitation of this report, and it is now listed as one.
 */

const DAY = 86_400_000;

export interface Observation {
  /** One sentence, in the past tense, about what was collected. */
  text: string;
  /** Video ids the sentence rests on. Rendered as links. */
  supporting: string[];
}

/**
 * Why an upload is in the report. One card per purpose, never two.
 *
 * The old selection picked the most viewed, the most recent and the nearest the
 * median — three rules that on a channel uploading steadily return the same
 * upload twice and explain nothing the other two did not. Each purpose here
 * answers a different question, and one that is already answered is skipped.
 */
export type EvidencePurpose = 'sponsored' | 'subject' | 'format' | 'typical' | 'outlier' | 'recent';

export interface RepresentativeVideo {
  video: VideoEvidence;
  purpose: EvidencePurpose;
  /** Why this one is in the report. Printed beside it. Factual, never a verdict. */
  reason: string;
  /** True when another video in the sample carries the same title. */
  titleRepeats: boolean;
  /** YouTube's paid-promotion flag. Null is "not reported", never false. */
  disclosed: boolean;
}

/** The thumbnail YouTube serves for a video id. Never cropped or overlaid. */
export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
}

export function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/**
 * Rounded for reading, exact underneath.
 *
 * "18.2K views" is what somebody scanning a page wants; 18,247 is what the
 * appendix and the title attribute keep. Rounding in the display only means the
 * two can never disagree, because there is only one number.
 */
export function compact(value: number | null): string {
  if (value === null) return 'Not reported';
  const round = (n: number, unit: string) => `${trimZero(n.toFixed(1))}${unit}`;
  if (value >= 1_000_000) return round(value / 1_000_000, 'M');
  if (value >= 1_000) return round(value / 1_000, 'K');
  return value.toLocaleString('en-US');
}

/** 18.2K keeps its decimal; 49.0K does not need one. */
function trimZero(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value;
}

export function exact(value: number | null): string {
  return value === null ? 'Not reported' : value.toLocaleString('en-US');
}

/** Whole percents. A share of a fifty-video sample has no decimal place in it. */
export function percent(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

/**
 * How much of a report there is to read.
 *
 * FIVE STATES, and the two that get collapsed are the two that matter. A
 * collection that failed having read NOTHING is not a report with a caveat —
 * there is no sample, and printing "this sample has limitations" over an empty
 * page describes something that does not exist. A report whose data has aged
 * out is not a failure either: it was correct and is now past its deadline.
 */
export type ReportDepth = 'full' | 'thin' | 'empty' | 'expired';

export function reportDepth(report: ChannelReportView, now = Date.now()): ReportDepth {
  const age = now - Date.parse(report.fetchedAt);
  if (Number.isFinite(age) && age > 30 * DAY) return 'expired';
  if (report.videos.length === 0) return 'empty';
  if (report.videos.length < 3) return 'thin';
  return 'full';
}

/**
 * The factual summary: what was collected, and what it shows.
 *
 * Written as clauses that are each independently true, so a missing figure
 * removes its clause rather than making the paragraph wrong.
 *
 * THE TWO WINDOWS ARE TWO SENTENCES. What was asked for and what came back are
 * different facts; the first version printed the request in the position where
 * a reader expects the sample, so a 90-day request read as 90 days of uploads
 * even when the collection cap stopped it after eleven weeks.
 */
export function factualSummary(report: ChannelReportView, now = Date.now()): string[] {
  const depth = reportDepth(report, now);
  if (depth === 'empty') {
    return [
      'No uploads were collected in this period, so this report has no sample to describe. That is a gap in what was collected, not a finding about the channel.',
    ];
  }

  const lines: string[] = [];
  const at = Date.parse(report.fetchedAt);
  const eligible = comparable(report.videos);
  const aside = setAside(report.videos);

  const span =
    report.sampledStart && report.sampledEnd
      ? `, published between ${shortDate(report.sampledStart)} and ${shortDate(report.sampledEnd)}`
      : '';
  lines.push(
    `${report.videos.length} upload${report.videos.length === 1 ? '' : 's'} were read on ${shortDate(report.fetchedAt)}${span}.`,
  );
  // The request, said separately and only when it differs from what was found.
  // Printing "we asked for 90 days" under a sample that fills 90 days is noise.
  if (report.sampledStart && report.requestedStart) {
    const missed = Math.round((Date.parse(report.sampledStart) - Date.parse(report.requestedStart)) / DAY);
    if (missed >= 7) {
      lines.push(
        `A ${report.windowDays}-day window was requested; the sample begins ${missed} days inside it${report.truncated ? ', because the collection reached its upload limit first' : ''}.`,
      );
    }
  }

  const long = eligible.filter((v) => v.format === 'long');
  const short = eligible.filter((v) => v.format === 'short');
  const unknown = eligible.filter((v) => v.format === 'unknown');

  const parts: string[] = [];
  for (const [label, group] of [
    ['long-form', long],
    ['short (≤3 min, a duration proxy)', short],
  ] as const) {
    if (group.length === 0) continue;
    const p = performance(group, at);
    if (p.median === null) {
      parts.push(`${group.length} ${label}, none reporting a view count`);
      continue;
    }
    parts.push(`${group.length} ${label} with a median of ${compact(p.median)} views over the ${p.n} that reported one`);
  }
  if (parts.length) lines.push(`The sample splits into ${parts.join(', and ')}.`);
  if (unknown.length) {
    lines.push(
      `${unknown.length} upload${unknown.length === 1 ? '' : 's'} report no duration in the public metadata and ${unknown.length === 1 ? 'sits' : 'sit'} outside the format comparison.`,
    );
  }

  // Live and upcoming uploads are named rather than quietly dropped, because a
  // reader who counts the rows will otherwise find one missing.
  const excluded: string[] = [];
  if (aside.live) excluded.push(`${aside.live} live broadcast${aside.live === 1 ? '' : 's'}`);
  if (aside.upcoming) excluded.push(`${aside.upcoming} scheduled premiere${aside.upcoming === 1 ? '' : 's'}`);
  if (excluded.length) {
    const count = aside.live + aside.upcoming;
    lines.push(
      `${excluded.join(' and ')} ${count === 1 ? 'is' : 'are'} in the sample and excluded from every view figure — a broadcast still running and a video nobody can watch yet are not comparable results.`,
    );
  }

  const disclosed = report.promotions.filter((p) => p.disclosure === 'explicit').length;
  lines.push(
    disclosed > 0
      ? `${disclosed} of the sampled uploads carry YouTube's paid-promotion flag. The flag does not name the sponsor.`
      : 'No sampled upload carries YouTube’s paid-promotion flag. That is what this sample shows, not a record of the channel never having run one.',
  );

  if (depth === 'thin') {
    lines.push(
      `Only ${report.videos.length} upload${report.videos.length === 1 ? '' : 's'} could be read, which is too few to describe a pattern. Treat everything above as illustrative of this sample alone.`,
    );
  }
  return lines;
}

/**
 * Up to four observations, each pointing at the videos behind it.
 *
 * Ordered by how much a buyer can act on them. Every one is a statement about
 * the SAMPLE — never about the creator, the audience, or what will happen next.
 *
 * Measured against the COLLECTION time, not against now: the view counts were
 * read when the collection ran, so an age band computed against the current
 * clock would drift further from the figures it describes every day the report
 * sits unopened.
 */
export function observations(report: ChannelReportView): Observation[] {
  const out: Observation[] = [];
  const eligible = comparable(report.videos);
  if (eligible.length === 0) return out;
  const at = Date.parse(report.fetchedAt);
  const profile = composition(eligible);

  // 1. WHAT THIS CHANNEL MAKES. First, because it is the question somebody
  //    opened the report with, and the old first observation was a format
  //    count that answered none of it.
  const dominant = dominantFormat(profile);
  if (dominant && dominant.videoIds.length >= 2) {
    const subject = profile.subjects[0];
    out.push({
      text:
        `${dominant.videoIds.length} of ${profile.sampled} sampled uploads are titled as ${FORMAT_LABEL[dominant.format].toLowerCase()}` +
        (subject
          ? `, and “${subject.term}” appears in ${subject.videoIds.length} titles. Both are readings of retrieved metadata, not of the videos.`
          : '. That is a reading of retrieved titles, not of the videos.'),
      supporting: dominant.videoIds.slice(0, 3),
    });
  }

  // 2. Format composition, stated and nothing inferred from it. What the
  //    creator WILL accept as a deliverable is a question, not a count.
  const long = eligible.filter((v) => v.format === 'long');
  const short = eligible.filter((v) => v.format === 'short');
  if (long.length && short.length) {
    const bigger = long.length >= short.length ? long : short;
    const label = bigger === long ? 'long-form' : 'short (≤3 min, a duration proxy)';
    out.push({
      text: `${bigger.length} of ${eligible.length} comparable uploads are ${label}, and ${eligible.length - bigger.length} ${eligible.length - bigger.length === 1 ? 'is' : 'are'} the other length. What the creator would agree to produce is not visible in a publishing history.`,
      supporting: bigger.slice(0, 3).map((v) => v.id),
    });
  } else if (long.length || short.length) {
    const only = long.length ? long : short;
    const label = long.length ? 'long-form' : 'short (≤3 min, a duration proxy)';
    out.push({
      text: `Every comparable upload in this sample is ${label}. Nothing here shows the other length being published, which is not the same as it being unavailable.`,
      supporting: only.slice(0, 3).map((v) => v.id),
    });
  }

  // 3. CONCENTRATION, AS A SHARE OF THE TOTAL — which is the thing the old
  //    sentence claimed and the ratio to the median could not establish.
  const p = performance(eligible, at);
  if (p.n >= 3 && p.median !== null && p.max !== null && p.min !== null && p.total) {
    const best = [...eligible]
      .filter((v) => v.views !== null)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
    const share = p.max / p.total;
    const even = 1 / p.n;
    if (share >= Math.max(0.2, even * 3)) {
      out.push({
        text: `The most-viewed upload accounts for ${percent(p.max, p.total)} of the ${compact(p.total)} views across the ${p.n} uploads reporting a count — an even split would be ${percent(1, p.n)} each. Views are plays, not people, and one person can account for several.`,
        supporting: best ? [best.id] : [],
      });
    } else {
      out.push({
        text: `No single upload dominates: the most-viewed accounts for ${percent(p.max, p.total)} of the ${compact(p.total)} views across the ${p.n} reporting a count, against ${percent(1, p.n)} for an even split. Views are plays, not people.`,
        supporting: best ? [best.id] : [],
      });
    }
  }

  // 4. Cadence over the span the sample actually covers, not over the window
  //    that was requested. A capped collection of the 50 most recent uploads
  //    says nothing about the months before the earliest one it read.
  const spanDays =
    report.sampledStart && report.sampledEnd
      ? Math.max((Date.parse(report.sampledEnd) - Date.parse(report.sampledStart)) / DAY, 1)
      : null;
  if (spanDays !== null && spanDays >= 7) {
    const rate = report.videos.length / (spanDays / 7);
    out.push({
      text: report.truncated
        ? `${rate.toFixed(1)} uploads a week across the ${Math.round(spanDays)} days this sample spans. The collection stopped at its upload limit, so nothing here describes the period before ${shortDate(report.sampledStart)}.`
        : `${rate.toFixed(1)} uploads a week across the ${Math.round(spanDays)} days this sample spans.`,
      supporting: [],
    });
  }

  return out.slice(0, 4);
}

/**
 * What this report cannot tell you, separated from what to ask the creator.
 *
 * THESE ARE OUR GAPS, NOT THEIRS. The old list mixed the two, so "collection
 * was capped for this period" became "ask what else was published in it" —
 * an outreach question that hands our incomplete collection to the creator as
 * homework. A cap is a limitation of this report and is stated as one; a
 * refresh with a larger bound is the fix, and it is ours to run.
 */
export function limitations(report: ChannelReportView): string[] {
  const out: string[] = [];
  const aside = setAside(report.videos);
  const unknown = comparable(report.videos).filter((v) => v.format === 'unknown').length;

  if (report.truncated) {
    out.push(
      `The collection stopped at its upload limit, so this sample is the most recent ${report.videos.length} uploads rather than everything published in the ${report.windowDays}-day window. Re-collect with a larger bound to widen it.`,
    );
  }
  if (aside.live || aside.upcoming) {
    const bits = [
      aside.live ? `${aside.live} live broadcast${aside.live === 1 ? '' : 's'}` : null,
      aside.upcoming ? `${aside.upcoming} scheduled premiere${aside.upcoming === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    const count = aside.live + aside.upcoming;
    out.push(
      `${bits.join(' and ')} could not be compared on views and ${count === 1 ? 'was' : 'were'} excluded from every figure above.`,
    );
  }
  if (unknown > 0) {
    out.push(
      `${unknown} upload${unknown === 1 ? '' : 's'} report no duration publicly, so ${unknown === 1 ? 'it sits' : 'they sit'} outside the long-form and short comparison.`,
    );
  }
  const p = performance(report.videos, Date.parse(report.fetchedAt));
  if (p.unreported > 0) {
    out.push(
      `${p.unreported} comparable upload${p.unreported === 1 ? '' : 's'} report no view count. That is unknown, not zero, and ${p.unreported === 1 ? 'it is' : 'they are'} excluded from every median and range.`,
    );
  }
  if (!report.derivedAllowed) {
    out.push(
      'Comment themes are not available on this deployment, so nothing here describes how viewers responded.',
    );
  }
  out.push(
    'Everything above is public metadata. No upload was watched, no transcript was read, and nothing here shows who the audience is or what they bought.',
  );
  return out.slice(0, 5);
}

/**
 * Up to three things to settle before contacting anybody.
 *
 * QUESTIONS FOR THE CREATOR ONLY. Anything this report cannot answer BECAUSE OF
 * HOW WE COLLECTED is a limitation and belongs in `limitations`; what belongs
 * here is what only the creator knows.
 */
export function openQuestions(report: ChannelReportView): string[] {
  const out: string[] = [];
  const eligible = comparable(report.videos);
  const long = eligible.filter((v) => v.format === 'long').length;
  const short = eligible.filter((v) => v.format === 'short').length;

  if (report.promotions.some((p) => p.disclosure === 'explicit')) {
    out.push(
      'Which brands were behind the disclosed paid promotions, and does any exclusivity still apply? YouTube’s flag marks the video, not the advertiser.',
    );
  }
  // The availability question the old observation ASSERTED an answer to.
  if (long && short) {
    out.push(
      'Which lengths would they actually take on as a deliverable? Both appear in the sample; publishing a format is not agreeing to produce one.',
    );
  } else if (long || short) {
    out.push(
      `This sample is ${long ? 'entirely long-form' : 'entirely short'}. Ask whether they produce the other length, and on what terms.`,
    );
  }
  if (report.unreadable > 0) {
    out.push(
      `Comments could not be read on ${report.unreadable} sampled upload${report.unreadable === 1 ? '' : 's'}. Ask whether comments are usually open, and what response they normally see.`,
    );
  }
  // The gated profile's own questions come last and only when it ran.
  for (const question of report.contentProfile?.questions ?? []) out.push(question);

  if (out.length === 0) {
    out.push('Confirm the creator has used the product themselves, and what they can substantiate about it.');
  }
  return out.slice(0, 3);
}

/**
 * Three or four uploads, each doing a job none of the others does.
 *
 * THE OLD RULES OVERLAPPED. "Most viewed", "most recent" and "nearest the
 * median" return the same upload more than once on a channel that publishes
 * steadily, and "nearest the median, so it shows a typical upload" was two
 * errors in one clause: the median was taken across mixed formats on a
 * long-form channel, and proximity to a view count is not evidence that the
 * CONTENT is typical of anything.
 *
 * EACH PURPOSE IS FILLED ONCE. A subject example, a format example, one upload
 * from the middle of its own format group, a genuine outlier where one exists,
 * and a disclosed paid promotion where one exists. A purpose already covered by
 * a chosen upload is skipped rather than filled with a near-duplicate.
 *
 * A VIEW COUNT THAT WAS NOT REPORTED IS NOT ZERO, so those uploads are never
 * chosen as "most viewed" and never sort to the bottom as though they failed.
 *
 * TWO UPLOADS CAN SHARE A TITLE. A re-upload, a series, a part two named the
 * same — they are different videos with different ids, and collapsing them as
 * duplicates would hide one. They are kept and flagged.
 */
export function representativeVideos(report: ChannelReportView, limit = 4): RepresentativeVideo[] {
  const eligible = comparable(report.videos);
  if (eligible.length === 0) return [];

  const titleCounts = new Map<string, number>();
  for (const video of report.videos) {
    const key = video.title.trim().toLowerCase();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  const disclosedIds = new Set(
    report.promotions.filter((p) => p.disclosure === 'explicit').map((p) => p.postId),
  );
  const byId = new Map(eligible.map((v) => [v.id, v]));
  const picked: { id: string; purpose: EvidencePurpose; reason: string }[] = [];
  const used = new Set<string>();
  const take = (id: string | undefined, purpose: EvidencePurpose, reason: string) => {
    if (!id || used.has(id) || !byId.has(id) || picked.length >= limit) return;
    used.add(id);
    picked.push({ id, purpose, reason });
  };

  const profile = composition(eligible);
  const at = Date.parse(report.fetchedAt);
  const overall = performance(eligible, at);

  // 1. A disclosed paid promotion. It is the single most decision-relevant
  //    upload in the sample and it also stops the sponsorship list from having
  //    to repeat a card the evidence section already carries.
  const sponsored = eligible.find((v) => disclosedIds.has(v.id));
  if (sponsored) {
    take(
      sponsored.id,
      'sponsored',
      `Carries YouTube’s paid-promotion flag — ${disclosedIds.size} of ${report.videos.length} sampled upload${disclosedIds.size === 1 ? ' does' : 's do'}. The flag does not name the sponsor`,
    );
  }

  // 2. The most-covered recurring subject.
  const subject = profile.subjects[0];
  if (subject) {
    take(
      subject.videoIds.find((id) => !used.has(id)),
      'subject',
      `“${subject.term}” is in ${subject.videoIds.length} of ${profile.sampled} sampled titles — the most-repeated subject in the sample`,
    );
  }

  // 3. The format the channel publishes most, if a different upload shows it.
  const dominant = dominantFormat(profile);
  if (dominant) {
    take(
      dominant.videoIds.find((id) => !used.has(id)),
      'format',
      `One of ${dominant.videoIds.length} uploads whose title reads as ${FORMAT_LABEL[dominant.format].toLowerCase()} — the commonest shape in this sample`,
    );
  }

  // 4. The middle of its OWN format group. Not "typical content": the claim is
  //    only about where this upload's view count sits among comparable ones.
  const group = (['long', 'short', 'unknown'] as const)
    .map((f) => eligible.filter((v) => v.format === f))
    .sort((a, b) => b.length - a.length)[0];
  if (group && group.length >= 4) {
    const gp = performance(group, at);
    const label = group[0].format === 'long' ? 'long-form' : group[0].format === 'short' ? '≤3 min' : 'undated-duration';
    if (gp.median !== null) {
      const nearest = [...group]
        .filter((v) => v.views !== null && !used.has(v.id))
        .sort((a, b) => Math.abs((a.views ?? 0) - gp.median!) - Math.abs((b.views ?? 0) - gp.median!))[0];
      take(
        nearest?.id,
        'typical',
        `Its view count sits nearest the ${compact(gp.median)} median of the ${gp.n} ${label} uploads that reported one — a position in a distribution, not a judgement about the content`,
      );
    }
  }

  // 5. An outlier, only where one exists. A "most viewed" on an even sample is
  //    the top of a narrow band and explains nothing.
  if (overall.max !== null && overall.median !== null && overall.median > 0) {
    const threshold = overall.p75 !== null ? Math.max(overall.p75 * 2, overall.median * 3) : overall.median * 3;
    if (overall.max >= threshold) {
      const best = [...eligible]
        .filter((v) => v.views !== null)
        .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
      take(
        best?.id,
        'outlier',
        `${compact(best?.views ?? null)} views — ${(overall.max / overall.median).toFixed(1)}× the sample median and ${percent(overall.max, overall.total ?? overall.max)} of its total views. An outlier, not the norm`,
      );
    }
  }

  // 6. The most recent, to fill a short list. Labelled as recency, which is all
  //    it is, rather than dressed up as a selection rule.
  if (picked.length < Math.min(limit, 3)) {
    const byDate = [...eligible].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    for (const video of byDate) {
      if (picked.length >= Math.min(limit, 3)) break;
      take(video.id, 'recent', 'The most recent upload in the sample');
    }
  }

  return picked
    .map(({ id, purpose, reason }) => {
      const video = byId.get(id)!;
      return {
        video,
        purpose,
        reason,
        titleRepeats: (titleCounts.get(video.title.trim().toLowerCase()) ?? 0) > 1,
        disclosed: disclosedIds.has(video.id),
      };
    })
    .sort((a, b) => Date.parse(b.video.publishedAt) - Date.parse(a.video.publishedAt));
}

/**
 * Disclosed sponsorships, with the flag kept apart from the brand.
 *
 * `exclude` carries the ids already shown as representative uploads, so the
 * sponsorship section lists what the reader has NOT already seen instead of
 * printing the same three videos twice on facing pages.
 */
export function disclosedPromotions(
  report: ChannelReportView,
  limit = 3,
  exclude: Iterable<string> = [],
): Promotion[] {
  const seen = new Set(exclude);
  return report.promotions
    .filter((p) => p.disclosure === 'explicit' && !seen.has(p.postId))
    .slice(0, limit);
}

/** How many disclosed promotions there are in total, listed or not. */
export function disclosedCount(report: ChannelReportView): number {
  return report.promotions.filter((p) => p.disclosure === 'explicit').length;
}

export function shortDate(value: string | null): string {
  if (!value) return 'not recorded';
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return 'not recorded';
  return new Date(at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
