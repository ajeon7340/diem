import type { ChannelReportView } from './report';
import { performance } from './report';
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
 */

const DAY = 86_400_000;

export interface Observation {
  /** One sentence, in the past tense, about what was collected. */
  text: string;
  /** Video ids the sentence rests on. Rendered as links. */
  supporting: string[];
}

export interface RepresentativeVideo {
  video: VideoEvidence;
  /** Why this one is in the report. Printed beside it. */
  reason: string;
  /** True when another video in the sample carries the same title. */
  titleRepeats: boolean;
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
  const long = report.videos.filter((v) => v.format === 'long');
  const short = report.videos.filter((v) => v.format === 'short');
  const unknown = report.videos.filter((v) => v.format === 'unknown');

  const window = report.start && report.end
    ? ` published between ${shortDate(report.start)} and ${shortDate(report.end)}`
    : '';
  lines.push(
    `${report.videos.length} upload${report.videos.length === 1 ? '' : 's'}${window} were read on ${shortDate(report.fetchedAt)}.`,
  );

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
      `${unknown.length} upload${unknown.length === 1 ? ' has' : 's have'} no duration in the public metadata and sit outside the format comparison.`,
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
 * Up to three observations, each pointing at the videos behind it.
 *
 * Ordered by how much a buyer can act on them. Every one is a statement about
 * the SAMPLE — never about the creator, the audience, or what will happen next.
 */
/**
 * Measured against the COLLECTION time, not against now.
 *
 * The view counts in the sample were read when the collection ran, so an age
 * band computed against the current clock would drift further from the figures
 * it describes every day the report sits unopened.
 */
export function observations(report: ChannelReportView): Observation[] {
  const out: Observation[] = [];
  if (report.videos.length === 0) return out;
  const at = Date.parse(report.fetchedAt);

  // 1. What the channel mostly publishes.
  const long = report.videos.filter((v) => v.format === 'long');
  const short = report.videos.filter((v) => v.format === 'short');
  if (long.length && short.length) {
    const dominant = long.length >= short.length ? long : short;
    const label = dominant === long ? 'long-form' : 'short (≤3 min)';
    out.push({
      text: `${dominant.length} of ${report.videos.length} sampled uploads are ${label}. Both formats appear in the period, so a brief can ask for either.`,
      supporting: dominant.slice(0, 3).map((v) => v.id),
    });
  } else if (long.length || short.length) {
    const only = long.length ? long : short;
    const label = long.length ? 'long-form' : 'short (≤3 min, a duration proxy)';
    out.push({
      text: `Every sampled upload is ${label}. Nothing in this sample shows the other format being used.`,
      supporting: only.slice(0, 3).map((v) => v.id),
    });
  }

  // 2. Spread, which is what a median alone hides.
  const p = performance(report.videos, at);
  if (p.n >= 3 && p.median !== null && p.max !== null && p.min !== null && p.median > 0) {
    const multiple = p.max / Math.max(p.median, 1);
    if (multiple >= 3) {
      const best = [...report.videos]
        .filter((v) => v.views !== null)
        .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
      out.push({
        text: `Views in the sample range from ${compact(p.min)} to ${compact(p.max)} against a median of ${compact(p.median)} — the top upload is about ${multiple.toFixed(1)}× the median, so one video carries much of the reach.`,
        supporting: best ? [best.id] : [],
      });
    } else {
      out.push({
        text: `Views sit in a narrow band, ${compact(p.min)} to ${compact(p.max)} against a median of ${compact(p.median)}, across the ${p.n} uploads reporting a count.`,
        supporting: report.videos.slice(0, 2).map((v) => v.id),
      });
    }
  }

  // 3. Cadence, as a lower bound when the collection was capped.
  const weeks = Math.max(report.windowDays / 7, 1);
  const rate = report.videos.length / weeks;
  out.push({
    text: report.truncated
      ? `At least ${rate.toFixed(1)} uploads a week in this period. Collection was capped, so the real rate may be higher.`
      : `About ${rate.toFixed(1)} uploads a week across the ${report.windowDays}-day period.`,
    supporting: [],
  });

  return out.slice(0, 3);
}

/**
 * Up to three things to settle before contacting anybody.
 *
 * Built from what this report CANNOT answer, so they change as the evidence
 * changes. The permanent commercial questions — fee, rights, exclusivity —
 * stay in the report as a fixed list; these are the ones specific to what was
 * collected here.
 */
export function openQuestions(report: ChannelReportView): string[] {
  const out: string[] = [];

  if (report.promotions.some((p) => p.disclosure === 'explicit')) {
    out.push(
      'Which brands were behind the disclosed paid promotions? YouTube’s flag marks the video, not the advertiser.',
    );
  }
  if (report.unreadable > 0) {
    out.push(
      `Comments could not be read on ${report.unreadable} sampled upload${report.unreadable === 1 ? '' : 's'}. Ask whether comments are usually open, and what response they normally see.`,
    );
  }
  if (report.truncated) {
    out.push('Collection was capped for this period. Ask what else was published in it.');
  }
  if (report.videos.some((v) => v.format === 'unknown')) {
    out.push('Some uploads report no duration publicly. Confirm which were Shorts if the format matters to the brief.');
  }
  // The gated profile's own questions come last and only when it ran.
  for (const question of report.contentProfile?.questions ?? []) out.push(question);

  if (out.length === 0) {
    out.push('Confirm the creator has used the product themselves, and what they can substantiate about it.');
  }
  return out.slice(0, 3);
}

/**
 * Three to five videos, each with a stated reason for being chosen.
 *
 * THE SELECTION RULE IS PRINTED because otherwise "representative" is a claim
 * nobody can check. Picked from what was collected, on figures YouTube
 * supplied: the most-viewed, the most recent, the one nearest the median, and
 * any carrying the paid-promotion flag.
 *
 * A VIEW COUNT THAT WAS NOT REPORTED IS NOT ZERO, so those videos are never
 * chosen as "most viewed" and never sort to the bottom as though they failed.
 *
 * TWO UPLOADS CAN SHARE A TITLE. A re-upload, a series, a part two named the
 * same — they are different videos with different ids, and collapsing them as
 * duplicates would hide one. They are kept and flagged so a reader is not
 * confused by seeing the title twice.
 */
export function representativeVideos(report: ChannelReportView, limit = 5): RepresentativeVideo[] {
  const videos = report.videos;
  if (videos.length === 0) return [];

  const titleCounts = new Map<string, number>();
  for (const video of videos) {
    const key = video.title.trim().toLowerCase();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  const withViews = videos.filter((v) => v.views !== null);
  const picked = new Map<string, string>();

  const take = (video: VideoEvidence | undefined, reason: string) => {
    if (!video || picked.has(video.id)) return;
    picked.set(video.id, reason);
  };

  const disclosedIds = new Set(
    report.promotions.filter((p) => p.disclosure === 'explicit').map((p) => p.postId),
  );
  for (const video of videos) {
    if (picked.size >= limit) break;
    if (disclosedIds.has(video.id)) take(video, 'Carries YouTube’s paid-promotion flag');
  }

  const byViews = [...withViews].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  take(byViews[0], 'Most viewed upload in the sample');

  const byDate = [...videos].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  take(byDate[0], 'Most recent upload in the sample');

  // Collection time again, for the reason given on `observations`.
  const p = performance(videos, Date.parse(report.fetchedAt));
  if (p.median !== null && withViews.length >= 3) {
    const nearest = [...withViews].sort(
      (a, b) => Math.abs((a.views ?? 0) - p.median!) - Math.abs((b.views ?? 0) - p.median!),
    )[0];
    take(nearest, 'Closest to the sample median, so it shows a typical upload');
  }

  // Fill to the floor of three with the next most recent, so a short report is
  // still readable — labelled honestly rather than dressed as a selection.
  for (const video of byDate) {
    if (picked.size >= Math.min(limit, Math.max(3, picked.size))) break;
    take(video, 'Included to show more of the sample');
  }

  return [...picked.entries()]
    .map(([id, reason]) => {
      const video = videos.find((v) => v.id === id)!;
      return {
        video,
        reason,
        titleRepeats: (titleCounts.get(video.title.trim().toLowerCase()) ?? 0) > 1,
      };
    })
    .sort((a, b) => Date.parse(b.video.publishedAt) - Date.parse(a.video.publishedAt))
    .slice(0, limit);
}

/** Disclosed sponsorships, capped, with the flag kept apart from the brand. */
export function disclosedPromotions(report: ChannelReportView, limit = 3): Promotion[] {
  return report.promotions.filter((p) => p.disclosure === 'explicit').slice(0, limit);
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
