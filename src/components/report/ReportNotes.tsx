/**
 * Every standing qualification in this report, in one place, once.
 *
 * WHY THIS EXISTS. Each of these lines was true and each was attached to the
 * thing it qualified — the proxy note under the format table, "not a history"
 * under the chart, "nothing was watched" under the composition, "the flag does
 * not name the sponsor" on every sponsored card. Five correct sentences in five
 * places, repeated on every report, and the combined effect was a page a reader
 * had to wade through to reach a number.
 *
 * THEY ARE NOT DELETED, because each one stops the report asserting something
 * the data cannot support: that a ≤3-minute upload is a Short, that a scatter
 * of current view counts is a growth curve, that a title is a viewing, that
 * views are people, that YouTube's flag identifies an advertiser. Without them
 * the report makes those claims by omission.
 *
 * THEY ARE STATED ONCE AND COLLAPSED. A reader who wants them opens one block;
 * a reader who does not is never made to read them five times. Print opens it,
 * because a PDF has no disclosure to click and these travel with the document.
 */
export function ReportNotes({ derivedAllowed }: { derivedAllowed: boolean }) {
  return (
    <details className="report-notes avoid-break rounded-[var(--r-md)] border border-line bg-surface px-3 py-2">
      <summary className="cursor-pointer text-[12px] font-medium text-ink-muted">
        How to read this
      </summary>
      <ul className="mt-2 space-y-1.5 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-muted">
        <li>
          Everything here is public metadata. No upload was watched and no transcript was read, so a
          label describes how the creator titled an upload, not what happens in it.
        </li>
        <li>
          Public metadata does not identify Shorts. Three minutes or less is a duration proxy and can
          include non-Shorts; an upload reporting no duration is in neither group.
        </li>
        <li>
          View counts were measured on the collection date. The chart is not a history — newer
          uploads have had less time to accumulate — and nothing here shows subscribers.
        </li>
        <li>Views are plays, not people. One person can account for several.</li>
        <li>
          YouTube’s paid-promotion flag marks a video, not an advertiser. It does not name the
          sponsor, and a title naming a product is not evidence it was used or endorsed.
        </li>
        {derivedAllowed ? null : (
          <li>Comment themes are not available on this deployment. Nothing here depends on them.</li>
        )}
      </ul>
    </details>
  );
}
