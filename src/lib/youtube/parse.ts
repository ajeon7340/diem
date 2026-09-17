/**
 * Pure input parsing, kept out of `client.ts` because that module is
 * `server-only` and these need to be testable — and reusable on the client if
 * a form ever wants to validate a link before spending a round trip.
 */

/** ISO 8601 durations, including the hours the naive version drops. */
export function parseDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return (
    Number(m[1] ?? 0) * 86_400 +
    Number(m[2] ?? 0) * 3_600 +
    Number(m[3] ?? 0) * 60 +
    Number(m[4] ?? 0)
  );
}

/**
 * Pull a video id out of whatever a creator pasted.
 *
 * They will paste a watch URL, a Shorts URL, a youtu.be link, a URL with a
 * playlist and a timestamp hanging off it, or just the id. Returns null rather
 * than guessing — a wrong id analyses a stranger's video and says nothing
 * about the mistake.
 */
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;

  let url: URL;
  try {
    url = new URL(s.startsWith('http') ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname)) return null;

  if (url.hostname.endsWith('youtu.be')) {
    const id = url.pathname.slice(1).split('/')[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  const v = url.searchParams.get('v');
  if (v && /^[\w-]{11}$/.test(v)) return v;

  const m = /\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(url.pathname);
  return m ? m[1] : null;
}
