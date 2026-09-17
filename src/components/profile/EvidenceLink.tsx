import { ExternalLink } from 'lucide-react';

import { linkHost, safeExternalUrl } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * An outbound link built from stored pipeline output.
 *
 * The href is validated to http/https before render — a `javascript:` URL
 * written into a jsonb column would otherwise execute on click — and the
 * destination host is shown, so a reader knows where a link goes before taking
 * it. `noopener noreferrer` because these point at third-party pages.
 *
 * When the URL does not survive validation the label still renders, as plain
 * text: losing the link is better than dropping the provenance entirely.
 */
export function EvidenceLink({
  url,
  label,
  className,
}: {
  url: string | null;
  label: string;
  className?: string;
}) {
  const safe = safeExternalUrl(url);
  const host = linkHost(safe);

  if (!safe) {
    return <span className={cn('text-ink-faint', className)}>{label}</span>;
  }

  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-ink-muted underline-offset-2 transition-colors',
        'hover:text-indigo hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40',
        className,
      )}
    >
      {label}
      {host ? <span className="text-ink-faint">· {host}</span> : null}
      <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
