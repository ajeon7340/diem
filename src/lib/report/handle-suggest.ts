import { isReservedHandle } from '@/lib/reserved-handles';

/**
 * Turn a YouTube identity into a candidate adfit handle.
 *
 * The handle is the profile's permanent URL, and asking someone to invent one
 * before they have typed anything else is the highest-friction field in the
 * form for the lowest reason — they already told us who they are by pasting
 * their channel.
 *
 * `creators.handle` is ASCII by CHECK constraint: 3-30 characters of
 * [a-z0-9_.], not starting or ending with a dot. So the derivation can fail,
 * and it must fail RATHER THAN GUESS. @가재맨 has no ASCII form; romanising it
 * would be a transliteration nobody asked for, permanently embedded in their
 * URL, and wrong often enough to matter (가재맨 is "gajaeman" only if you
 * assume Revised Romanisation and no stylisation). When nothing safe can be
 * derived the field is left empty and the creator chooses, which is exactly
 * what the old form did for everybody.
 */
export function suggestHandle(source: {
  youtubeHandle?: string | null;
  title?: string | null;
}): string | null {
  for (const raw of [source.youtubeHandle, source.title]) {
    const candidate = slug(raw);
    if (candidate) return candidate;
  }
  return null;
}

function slug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ascii = raw
    .replace(/^@+/, '')
    .toLowerCase()
    // Strip accents rather than dropping the letter: "Café" -> "cafe" is a
    // reasonable handle, "caf" is not.
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_.]+/g, '')
    .replace(/^[.]+|[.]+$/g, '');

  if (ascii.length < 3 || ascii.length > 30) return null;
  if (!/^[a-z0-9_][a-z0-9_.]*[a-z0-9_]$/.test(ascii)) return null;
  if (isReservedHandle(ascii)) return null;
  return ascii;
}

/**
 * The next candidate when one is taken: `name`, `name2`, `name3`…
 *
 * Numbered rather than randomised so a second attempt is predictable, and
 * capped at the same 30 characters the constraint allows — appending a digit
 * to a 30-character handle produces one the database rejects, which would
 * surface as "that handle is taken" forever.
 */
export function nextHandle(base: string, attempt: number): string {
  const suffix = String(attempt);
  return base.slice(0, 30 - suffix.length) + suffix;
}
