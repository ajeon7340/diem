import { videoUrl } from '@/lib/channel/highlights';
import type { SubjectTag } from '@/lib/channel/composition';

/**
 * The subjects that recur, sized by how many uploads carry each.
 *
 * A BUBBLE, NOT A BAR, BECAUSE THESE DO NOT SUM. Formats are mutually
 * exclusive and stack into a bar that adds to the sample; subjects are
 * overlapping tags — one upload about a phone camera is evidence for both
 * "phone" and "camera" — so a stacked bar or a pie would add to more than the
 * whole and invite a reader to do arithmetic that means nothing.
 *
 * AREA IS THE COUNT, so the radius goes as its square root. Sizing the radius
 * by the count makes a subject with four uploads look four times the one with
 * one, when it covers sixteen times the area.
 *
 * COUNTS INSIDE, NOT PERCENTAGES. "48%" in a circle invites the reader to add
 * the circles up; the count is the figure that is actually true of each one.
 * The denominator is printed once, underneath.
 *
 * THE LAYOUT IS DETERMINISTIC. Same data, same picture, every render and every
 * export — a packing that settles differently each time is not a chart.
 */

/** Rank-ordered slots, in units of the largest radius. Largest sits left. */
const SLOTS = [
  { x: 0.0, y: 0.0 },
  { x: 1.38, y: -0.52 },
  { x: 0.72, y: 1.16 },
  { x: 1.92, y: 0.62 },
  { x: -0.55, y: 1.42 },
  { x: 2.22, y: -0.62 },
];

/** Tints, ordered by rank. Each is paired with its label in the legend. */
const TINTS = [
  { fill: '#eef5c2', dot: '#7a8b1f', text: '#4d5a10' },
  { fill: '#fbe0ea', dot: '#c2315c', text: '#8d1f3f' },
  { fill: '#cfe9f7', dot: '#2274a5', text: '#17516f' },
  { fill: '#fde4cd', dot: '#c57420', text: '#8a4f12' },
  { fill: '#e2ddf7', dot: '#5850e6', text: '#3c36a0' },
  { fill: '#d9efe1', dot: '#1f8a53', text: '#14603a' },
];

export function SubjectBubbles({
  subjects,
  sampled,
}: {
  subjects: SubjectTag[];
  /** Uploads classified, printed once as the denominator. */
  sampled: number;
}) {
  if (subjects.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-ink-muted">
        No word recurs in three or more sampled titles. That is a finding about the sample, not the
        channel.
      </p>
    );
  }

  const top = subjects[0].videoIds.length;
  const R = 54;
  const bubbles = subjects.slice(0, SLOTS.length).map((subject, i) => ({
    subject,
    tint: TINTS[i % TINTS.length],
    r: Math.max(R * Math.sqrt(subject.videoIds.length / top), 16),
    slot: SLOTS[i],
  }));

  // One pass to find the extent, so the viewBox fits whatever was drawn.
  const xs = bubbles.flatMap((b) => [b.slot.x * R - b.r, b.slot.x * R + b.r]);
  const ys = bubbles.flatMap((b) => [b.slot.y * R - b.r, b.slot.y * R + b.r]);
  const minX = Math.min(...xs) - 4;
  const minY = Math.min(...ys) - 4;
  const w = Math.max(...xs) - minX + 4;
  const h = Math.max(...ys) - minY + 4;

  return (
    <figure className="m-0">
      <svg
        viewBox={`${minX} ${minY} ${w} ${h}`}
        className="report-chart h-auto w-full max-w-[240px]"
        style={{ maxHeight: 170 }}
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label={`Recurring subjects across ${sampled} classified uploads: ${subjects
          .map((s) => `${s.term}, ${s.videoIds.length}`)
          .join('; ')}`}
      >
        {bubbles.map(({ subject, tint, r, slot }) => (
          <g key={subject.term}>
            <circle cx={slot.x * R} cy={slot.y * R} r={r} fill={tint.fill} />
            <text
              x={slot.x * R}
              y={slot.y * R}
              textAnchor="middle"
              dominantBaseline="central"
              fill={tint.text}
              style={{ fontSize: Math.max(r * 0.42, 10), fontWeight: 500 }}
            >
              {subject.videoIds.length}
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="mt-3">
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {bubbles.map(({ subject, tint }) => (
            <li key={subject.term}>
              <a
                href={videoUrl(subject.videoIds[0])}
                target="_blank"
                rel="noopener noreferrer"
                className="press flex min-h-8 items-center gap-2 rounded-full border border-line px-3 text-[12px] text-ink hover:border-line-strong"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: tint.dot }}
                />
                <span className="truncate">{subject.term}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Uploads naming each word, out of {sampled} classified. Tags overlap, so they do not add up
          to {sampled}.
        </p>
      </figcaption>
    </figure>
  );
}
