import Link from "next/link";
import type { RenderedPage } from "@/lib/documents/renderer";
import { formatConfidence, formatNumber } from "@/lib/format/money";
import {
  claimHrefRequired,
  documentHref,
} from "@/lib/navigation/href";

export function DocumentSheet({
  page,
  version,
  fromClaim,
  showReverseIndex = true,
}: {
  page: RenderedPage;
  version: string;
  fromClaim?: string;
  showReverseIndex?: boolean;
}) {
  if (!page.available) {
    return (
      <div className="rounded border border-warn/40 bg-warn-soft p-6 space-y-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-warn">
          Evidence not available
        </p>
        <h1 className="font-serif text-2xl">{page.title}</h1>
        <p className="text-sm text-warn">{page.unavailableReason}</p>
        <p className="text-xs text-ink-muted font-mono">
          {page.documentId} · as-of {page.asOf.slice(0, 10)}
        </p>
      </div>
    );
  }

  const navOpts = {
    version,
    fromClaim,
    highlight: page.locator?.extractedValueId,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-warn">
            {page.simulatedLabel}
          </p>
          <h1 className="font-serif text-2xl text-ink mt-1">{page.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {page.documentId} · {page.documentType} · {page.issuer} · tax year{" "}
            {page.taxYear} · belongs to {page.owner}
          </p>
          <p className="text-xs text-ink-muted font-mono mt-0.5">
            {page.fileName} · extraction: {page.extractionStatus}
            {page.anchorResolution
              ? ` · anchor: ${page.anchorResolution}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {page.page > 1 ? (
            <Link
              href={documentHref(page.documentId, page.page - 1, navOpts)}
              className="rounded border border-line bg-panel px-3 py-1.5 no-underline hover:bg-paper-deep"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-ink-muted">
            Page {page.page} of {page.pageCount}
          </span>
          {page.page < page.pageCount ? (
            <Link
              href={documentHref(page.documentId, page.page + 1, navOpts)}
              className="rounded border border-line bg-panel px-3 py-1.5 no-underline hover:bg-paper-deep"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>

      {page.anchorResolution === "unresolved" &&
      page.locator?.extractedValueId ? (
        <div className="rounded border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">
          Exact field not located or ambiguous on this page. Showing page{" "}
          {page.page}; this is unresolved — not classified as a discrepancy.
          Packet positions are synthetic and not verified against a real PDF.
        </div>
      ) : null}

      {page.anchorResolution === "resolved_mismatch" ? (
        <div className="rounded border border-mismatch/30 bg-mismatch-soft px-3 py-2 text-sm text-mismatch">
          Printed token disagrees with extraction (genuine discrepancy).
        </div>
      ) : null}

      <article className="doc-sheet rounded-sm p-6 sm:p-8">
        <pre className="font-serif text-[15px] leading-7 whitespace-pre-wrap break-words text-ink">
          {page.segments.map((seg, i) =>
            seg.highlighted ? (
              <mark key={i} className="mark-hit">
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </pre>
      </article>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-line bg-panel p-4">
          <h2 className="font-serif text-lg">Extracted on this page</h2>
          <p className="text-xs text-ink-muted mt-1 mb-3">
            Extracted interpretation beside printed evidence — confidence is not
            verification.
          </p>
          {page.extractedOnPage.length === 0 ? (
            <p className="text-sm text-ink-muted">No extractions on this page.</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-auto">
              {page.extractedOnPage.map((ev) => {
                const active = page.locator?.extractedValueId === ev.id;
                return (
                  <li key={ev.id}>
                    <Link
                      href={documentHref(page.documentId, page.page, {
                        version,
                        fromClaim,
                        highlight: ev.id,
                      })}
                      className={`block rounded border px-3 py-2 no-underline ${
                        active
                          ? "border-accent bg-accent-soft"
                          : "border-line hover:bg-paper-deep"
                      }`}
                    >
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-medium text-ink">{ev.label}</span>
                        <span className="font-mono text-xs text-ink-muted">
                          {ev.id} · {formatConfidence(ev.confidence)}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-sm tabular-nums">
                        {formatNumber(ev.value)}
                        {ev.textAsRead ? (
                          <span className="text-ink-muted">
                            {" "}
                            · read “{ev.textAsRead || "∅"}”
                          </span>
                        ) : (
                          <span className="text-warn"> · blank read</span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {showReverseIndex ? (
          <section className="rounded border border-line bg-panel p-4">
            <h2 className="font-serif text-lg">Used in return</h2>
            <p className="text-xs text-ink-muted mt-1 mb-3">
              Reverse index from evidence → claims (cited sources only).
            </p>
            {page.usedByLines.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No return lines cite this evidence as a source in the loaded
                versions.
              </p>
            ) : (
              <ul className="space-y-1 max-h-72 overflow-auto text-sm">
                {page.usedByLines.map((ref) => {
                  const [ver, key] = ref.includes(":")
                    ? (ref.split(":") as [string, string])
                    : [version, ref];
                  return (
                    <li key={ref}>
                      <Link
                        href={claimHrefRequired(key, ver)}
                        className="font-mono"
                      >
                        {ref}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
