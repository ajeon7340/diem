import type { VideoEvidence } from '@/lib/ingest/analyze';

/**
 * What a channel publishes, read from the metadata that was retrieved.
 *
 * THE REPORT COULD COUNT AND IT COULD AVERAGE, AND THAT WAS ALL IT DID. Fifty
 * uploads, a median, a range, a scatter plot — every figure about how much was
 * watched and not one about what any of it was. A buyer reading it could not
 * answer the first question they came with, which is what this creator makes.
 *
 * TWO CLASSIFICATIONS, AND THEY ARE DIFFERENT SHAPES:
 *
 *   formats    MUTUALLY EXCLUSIVE. Every comparable upload lands in exactly one
 *              bucket, `unclassified` included, so the counts sum to the sample
 *              and a percentage of it means something.
 *   subjects   OVERLAPPING TAGS. One upload about a phone camera is evidence
 *              for both "phone" and "camera". These do NOT sum to the sample
 *              and are never rendered as a percentage of it.
 *
 * Confusing the two is how a composition chart ends up adding to 140%.
 *
 * THE EVIDENCE LEVEL IS METADATA AND THE LABEL SAYS SO EVERYWHERE IT IS SHOWN.
 * A title containing "리뷰" tells us the creator called it a review. It does not
 * tell us the product was used, that the treatment was balanced, or that
 * anything was demonstrated on camera — those need the video itself, which this
 * product does not watch and does not have a transcript of. Nothing here may be
 * rendered as a claim about what happens inside a video.
 *
 * UNCLASSIFIED IS A REAL BUCKET, printed with its count. Forcing every upload
 * into a confident category is how a classifier with 60% coverage looks like
 * one with 100%.
 *
 * NOT GATED, and for the same reason `requirements.ts` is not: matching terms
 * against text that was retrieved is reading the metadata, not deriving a new
 * metric from it. See the POST_FILTERS note in `youtube/search-contract.ts`,
 * which draws the same line for subscriber ranges. Nothing here is combined
 * across owners and nothing is computed that YouTube did not supply.
 */

export type ContentFormat =
  | 'comparison'
  | 'tutorial'
  | 'longterm'
  | 'interview'
  | 'firstlook'
  | 'review'
  | 'news'
  | 'unclassified';

export const FORMAT_LABEL: Record<ContentFormat, string> = {
  comparison: 'Comparison',
  tutorial: 'Tutorial or how-to',
  longterm: 'Long-term usage',
  interview: 'Interview or Q&A',
  firstlook: 'Unboxing or first look',
  review: 'Review',
  news: 'News or announcement',
  unclassified: 'Unclassified',
};

/**
 * What each label is evidence of, and what it is not.
 *
 * Rendered with the bars. "Review" beside a count of twelve reads as twelve
 * tested products unless something says it is twelve titles.
 */
export const FORMAT_MEANS: Record<ContentFormat, string> = {
  comparison: 'The title sets two or more things against each other.',
  tutorial: 'The title offers instructions. Whether anything is demonstrated is not visible here.',
  longterm: 'The title claims a period of use. The period is the creator’s claim, not a measurement.',
  interview: 'The title names an interview or a question session.',
  firstlook: 'The title describes a first encounter with a product, not a verdict on it.',
  review: 'The creator called it a review. Nothing here shows the product was used or bought.',
  news: 'The title reports an announcement, launch or rumour.',
  unclassified: 'No pattern in the retrieved metadata matched. Not an empty video — an unread one.',
};

/**
 * Ordered: the first match wins, so a "갤럭시 vs 아이폰 비교 리뷰" is a comparison
 * rather than a review. More specific shapes come first, and the broadest
 * label — review — comes last of the real categories.
 *
 * KOREAN AND ENGLISH TOGETHER because one channel uses both in one title and
 * splitting the vocabulary by language would classify half of it. The Korean
 * patterns are written against the noun stem, since particles attach to the end
 * of a word and `써봤습니다` and `써봤다` are the same claim.
 */
const RULES: { format: Exclude<ContentFormat, 'unclassified'>; test: RegExp }[] = [
  {
    format: 'comparison',
    test: /\b(vs\.?|versus)\b|비교|대결|차이점?|어떤\s*게?\s*(더|좋|나)|which\s+(one|is)\s+(is\s+)?better|맞대결/i,
  },
  {
    format: 'tutorial',
    test: /\bhow\s+to\b|\btutorial\b|\bguide\b|\bstep[-\s]by[-\s]step\b|\bsetup\b|\bsetting\s+up\b|튜토리얼|사용\s*법|하는\s*법|설정\s*(법|방법)|강좌|꿀팁|방법$/i,
  },
  {
    format: 'longterm',
    test: /\b(after|\d+)\s*(days?|weeks?|months?|years?)\s+(of\s+)?(use|using|later)\b|\blong[-\s]term\b|사용기|\d+\s*(일|주|개월|달|년)\s*(간\s*)?(써|사용|쓴)|장기\s*사용|써\s*본\s*후기/i,
  },
  { format: 'interview', test: /\binterview\b|\bq\s*&\s*a\b|인터뷰|대담|질문\s*답변|만나\s*봤/i },
  {
    format: 'firstlook',
    test: /\bunboxing\b|\bhands[-\s]on\b|\bfirst\s+(look|impressions?)\b|언박싱|개봉|핸즈\s*온|실물|첫\s*인상|미리\s*써/i,
  },
  { format: 'review', test: /\breview\b|리뷰|후기|평가|체험기|\btested\b|테스트/i },
  {
    format: 'news',
    test: /\b(announced|announcement|launch(ed)?|leak(ed|s)?|rumou?rs?|release[ds]?)\b|출시|공개|발표|루머|유출|소식/i,
  },
];

export function classifyFormat(video: VideoEvidence): ContentFormat {
  // The title carries the creator's own framing. The description is read after
  // it, never instead of it: descriptions carry link dumps and boilerplate that
  // repeat on every upload, and matching those would classify a whole channel
  // on one sentence the creator pastes every time.
  for (const { format, test } of RULES) if (test.test(video.title)) return format;
  const description = (video.description ?? '').slice(0, 300);
  if (description) for (const { format, test } of RULES) if (test.test(description)) return format;
  return 'unclassified';
}

/** Particles and plural endings, so 아이폰이 and 아이폰 are one subject. */
const KOREAN_PARTICLE = /(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|부터|까지|보다|처럼|께|한테)$/;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'you', 'are', 'was', 'were', 'but',
  'not', 'all', 'can', 'has', 'have', 'had', 'how', 'why', 'what', 'when', 'who', 'new', 'best',
  'most', 'more', 'than', 'then', 'now', 'about', 'into', 'out', 'off', 'over', 'just', 'like',
  'get', 'got', 'one', 'two', 'its', 'it', 'my', 'me', 'we', 'our', 'they', 'them', 'his', 'her',
  'review', 'reviews', 'vs', 'versus', 'unboxing', 'tutorial', 'guide', 'video', 'part',
  '그리고', '하지만', '그런데', '정말', '진짜', '이게', '그냥', '완전', '너무', '이번', '오늘',
  '리뷰', '후기', '비교', '언박싱', '개봉', '실물', '사용기', '영상', '이유', '대체', '드디어',
]);

/** Tokens worth counting: long enough to mean something, not a stopword. */
function tokens(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[^\p{L}\p{N}]+/u)
        .map((word) => word.trim())
        .filter(Boolean)
        .map((word) => (/[가-힣]/.test(word) ? word.replace(KOREAN_PARTICLE, '') : word.toLowerCase()))
        // Two characters is a word in Korean and an abbreviation in English;
        // three is the floor for Latin script, two for Hangul.
        .filter((word) => (/[가-힣]/.test(word) ? word.length >= 2 : word.length >= 3))
        .filter((word) => !STOPWORDS.has(word))
        // A bare number is a model year or a price, not a subject.
        .filter((word) => !/^\d+$/.test(word)),
    ),
  ];
}

export interface FormatGroup {
  format: ContentFormat;
  label: string;
  means: string;
  videoIds: string[];
}

export interface SubjectTag {
  term: string;
  videoIds: string[];
}

export interface Composition {
  /** Uploads classified. Formats sum to this; subjects do not. */
  sampled: number;
  /** Mutually exclusive. Non-empty groups only, largest first. */
  formats: FormatGroup[];
  /** Overlapping tags. A count here is uploads mentioning the term. */
  subjects: SubjectTag[];
  /** What was read to produce this. Never "watched". */
  basis: string;
  /** True when no format rule matched anything at all. */
  empty: boolean;
}

/**
 * Classify a sample.
 *
 * MIN_SUBJECT is three uploads. A term appearing twice in fifty titles is a
 * coincidence with a label on it, and a "recurring subject" that occurs once is
 * a lie about the word "recurring".
 */
const MIN_SUBJECT = 3;

export function composition(videos: VideoEvidence[], maxSubjects = 6): Composition {
  const byFormat = new Map<ContentFormat, string[]>();
  for (const video of videos) {
    const format = classifyFormat(video);
    byFormat.set(format, [...(byFormat.get(format) ?? []), video.id]);
  }

  const formats: FormatGroup[] = [...byFormat.entries()]
    .map(([format, videoIds]) => ({
      format,
      label: FORMAT_LABEL[format],
      means: FORMAT_MEANS[format],
      videoIds,
    }))
    // Unclassified sorts last whatever its size: it is the residue, not a
    // finding, and a chart led by it reads as the channel's main output.
    .sort((a, b) =>
      a.format === 'unclassified'
        ? 1
        : b.format === 'unclassified'
          ? -1
          : b.videoIds.length - a.videoIds.length,
    );

  const subjectIds = new Map<string, string[]>();
  for (const video of videos) {
    for (const term of tokens(video.title)) {
      subjectIds.set(term, [...(subjectIds.get(term) ?? []), video.id]);
    }
  }
  const subjects: SubjectTag[] = [...subjectIds.entries()]
    .filter(([, ids]) => ids.length >= MIN_SUBJECT)
    .map(([term, videoIds]) => ({ term, videoIds }))
    .sort((a, b) => b.videoIds.length - a.videoIds.length || a.term.localeCompare(b.term))
    .slice(0, maxSubjects);

  const hasDescriptions = videos.some((v) => (v.description ?? '').length > 0);
  return {
    sampled: videos.length,
    formats,
    subjects,
    basis: hasDescriptions
      ? 'Upload titles and descriptions, as retrieved. Nothing was watched.'
      : 'Upload titles, as retrieved. Nothing was watched.',
    empty: formats.every((g) => g.format === 'unclassified'),
  };
}

/** The format a channel publishes most, ignoring the unclassified residue. */
export function dominantFormat(composition: Composition): FormatGroup | null {
  const real = composition.formats.filter((g) => g.format !== 'unclassified');
  return real.length ? real[0] : null;
}
