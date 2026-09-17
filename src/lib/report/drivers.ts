/**
 * What actually moves views inside one creator's own catalogue.
 *
 * WHY THIS IS NOT "look at your top videos".
 *
 * Reading the top of a distribution and generalising is the single error this
 * report has made most often — engagement-ordered comment samples, a 여론
 * corpus assembled by searching for the drama, "never sponsored" from fifty
 * Shorts. It is seductive here too. On the first real catalogue, the top three
 * videos all featured another person, which makes "collabs are the driver"
 * look obvious. Tested across all fifty:
 *
 *     another person in the title   n=12   median 518,540  vs 655,728   0.79x
 *
 * Collabs underperform. The top of the list was survivorship, and a creator
 * acting on the eyeball reading would have made worse videos. A creator acts
 * on this, so being wrong costs them more than it costs a buyer.
 *
 * So every driver here is measured over the whole catalogue, both arms, with a
 * rank test — and a driver that cannot clear its floor prints "not enough
 * posts" instead of a multiple. The same rule `sufficiency.ts` applies to the
 * report at large.
 *
 * SCOPE: one channel, always. Every figure compares a slice of a catalogue to
 * the rest of the same catalogue, so III.E.2 never enters. Nothing here may
 * take a second channel's videos — see `withinOwner` in lib/youtube/scope.
 */

export interface DriverVideo {
  id: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string;
  durationSec: number;
  paidPlacement: boolean;
}

export interface Driver {
  key: string;
  label: string;
  /** Videos with the feature, and without. */
  withN: number;
  withoutN: number;
  withMedian: number;
  withoutMedian: number;
  /** Median ratio. 1.0 is no effect. Null when either arm is too small. */
  ratio: number | null;
  /** Two-sided rank-sum p. Null when not computed. */
  p: number | null;
  verdict: 'raises' | 'lowers' | 'no effect' | 'not enough posts' | 'inconclusive';
  /** Plain-language note, always present. */
  note: string;
}

/**
 * Both arms need this many videos before a median ratio means anything.
 *
 * Eight is not a statistical threshold, it is a floor below which a single
 * viral post moves the median of its arm outright. The rank test decides
 * whether a cleared driver is real; this only decides whether to look.
 */
export const MIN_ARM = 8;

/** Below this the ratio is reported but never called an effect. */
const ALPHA = 0.05;

/**
 * Above this p, a gap in the medians is not worth mentioning at all.
 *
 * Without it the panel said "looks like a drop of 21%" about a split with
 * p=0.910 — a number that is as close to pure noise as the test can report.
 * Describing that as a trend that "more posts would settle" invites the
 * creator to believe it, which is the whole failure this module exists to
 * avoid. A suggestive result and an absent one have to read differently.
 */
const SUGGESTIVE = 0.25;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Abramowitz & Stegun 7.1.26 — enough precision for a p-value we round anyway. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return sign * y;
}

/**
 * Mann-Whitney U, normal approximation with a tie correction.
 *
 * A rank test rather than a t-test because view counts are heavy-tailed by
 * construction: one video at 11.5x the median is normal on YouTube and would
 * dominate any mean-based comparison. Ranks are indifferent to how far the
 * outlier is, only to which side of the split it sits on.
 */
function rankSumP(a: number[], b: number[]): number | null {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) return null;

  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort(
    (x, y) => x.v - y.v,
  );

  // Average ranks over ties, and collect tie group sizes for the variance.
  const ranks = new Array<number>(all.length);
  const tieGroups: number[] = [];
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    if (j > i) tieGroups.push(j - i + 1);
    i = j + 1;
  }

  let r1 = 0;
  for (let i = 0; i < all.length; i++) if (all[i].g === 0) r1 += ranks[i];

  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const n = n1 + n2;
  const tieTerm = tieGroups.reduce((acc, t) => acc + (t ** 3 - t), 0);
  const variance = ((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1)));
  if (variance <= 0) return null;

  const z = (u1 - mu) / Math.sqrt(variance);
  return 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
}

const COLLAB = /@\w+|bestie|friend|sister|with my|unnie|ft\.|feat\./i;
const BRAND = /#\w*partner|#ad\b|#sponsor|#gifted|#paid/i;
const QUESTION = /\?|how |why |what |which /i;
const EMOJI = /[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\u2190-\u21FF\u2B00-\u2BFF]/;

interface Candidate {
  key: string;
  label: string;
  test: (v: DriverVideo) => boolean;
}

const CANDIDATES: Candidate[] = [
  { key: 'collab', label: 'Another person in the title', test: (v) => COLLAB.test(v.title) },
  { key: 'brand', label: 'Brand or paid tag in the title', test: (v) => BRAND.test(v.title) },
  { key: 'paid', label: 'Declared paid placement', test: (v) => v.paidPlacement },
  { key: 'longform', label: 'Long-form (over 3 minutes)', test: (v) => v.durationSec > 180 },
  { key: 'question', label: 'Question or how/why in the title', test: (v) => QUESTION.test(v.title) },
  { key: 'emoji', label: 'Emoji in the title', test: (v) => EMOJI.test(v.title) },
  { key: 'weekend', label: 'Posted at the weekend', test: (v) => [0, 6].includes(new Date(v.publishedAt).getUTCDay()) },
  { key: 'longtitle', label: 'Title over 40 characters', test: (v) => v.title.length > 40 },
];

export function analyseDrivers(videos: DriverVideo[]): Driver[] {
  return CANDIDATES.map((c): Driver => {
    const yes = videos.filter(c.test);
    const no = videos.filter((v) => !c.test(v));
    const withN = yes.length;
    const withoutN = no.length;
    const withMedian = median(yes.map((v) => v.views));
    const withoutMedian = median(no.map((v) => v.views));

    const base: Omit<Driver, 'ratio' | 'p' | 'verdict' | 'note'> = {
      key: c.key,
      label: c.label,
      withN,
      withoutN,
      withMedian,
      withoutMedian,
    };

    if (withN < MIN_ARM || withoutN < MIN_ARM) {
      return {
        ...base,
        ratio: null,
        p: null,
        verdict: 'not enough posts',
        note:
          withN === 0
            ? 'No posts with this feature yet.'
            : `Only ${Math.min(withN, withoutN)} post${Math.min(withN, withoutN) === 1 ? '' : 's'} on the smaller side — too few for a median to mean anything.`,
      };
    }

    const ratio = withoutMedian > 0 ? withMedian / withoutMedian : null;
    const p = rankSumP(
      yes.map((v) => v.views),
      no.map((v) => v.views),
    );
    const pct = ratio === null ? 0 : Math.round(Math.abs(ratio - 1) * 100);

    if (p === null || p > ALPHA) {
      return {
        ...base,
        ratio,
        p,
        verdict:
          ratio !== null && pct >= 15 && p !== null && p <= SUGGESTIVE
            ? 'inconclusive'
            : 'no effect',
        note:
          ratio !== null && pct >= 15 && p !== null && p <= SUGGESTIVE
            ? `Looks like a ${ratio > 1 ? 'lift' : 'drop'} of ${pct}%, but the spread is wide enough that it could be chance. More posts would settle it.`
            : 'These posts perform like the rest of the channel.',
      };
    }

    return {
      ...base,
      ratio,
      p,
      verdict: ratio !== null && ratio > 1 ? 'raises' : 'lowers',
      note:
        ratio !== null && ratio > 1
          ? `Median views run ${pct}% higher on these.`
          : `Median views run ${pct}% lower on these.`,
    };
  }).sort((a, b) => {
    // Real effects first, then the things that could not be read.
    const rank = (d: Driver) =>
      d.verdict === 'raises' || d.verdict === 'lowers' ? 0 : d.verdict === 'inconclusive' ? 1 : 2;
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return Math.abs((b.ratio ?? 1) - 1) - Math.abs((a.ratio ?? 1) - 1);
  });
}
