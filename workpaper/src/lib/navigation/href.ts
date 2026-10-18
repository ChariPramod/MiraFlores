/** Version-preserving navigation helpers. */

export type NavContext = {
  version?: string;
  /** Originating claim for reverse document navigation. */
  fromClaim?: string;
  highlight?: string;
};

export function withQuery(
  path: string,
  params: Record<string, string | undefined | null>,
): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      q.set(key, value);
    }
  }
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

export function claimHref(key: string, version?: string): string {
  return withQuery(`/claim/${encodeURIComponent(key)}`, {
    version: version && version !== "v3" ? version : version === "v3" ? "v3" : version,
  });
}

/** Always include version so round-trips never drop context. */
export function claimHrefRequired(key: string, version: string): string {
  return withQuery(`/claim/${encodeURIComponent(key)}`, { version });
}

export function documentHref(
  documentId: string,
  page: number,
  opts: NavContext = {},
): string {
  return withQuery(`/document/${documentId}/page/${page}`, {
    version: opts.version,
    highlight: opts.highlight,
    fromClaim: opts.fromClaim,
  });
}

export function documentsHref(version?: string): string {
  return withQuery("/documents", { version });
}

export function findingsHref(version?: string): string {
  return withQuery("/findings", { version });
}

export function salesHref(version?: string): string {
  return withQuery("/sales", { version });
}

export function assetsHref(version?: string): string {
  return withQuery("/assets", { version });
}

export function priorYearHref(version?: string): string {
  return withQuery("/prior-year", { version });
}

export function overviewHref(version?: string): string {
  return withQuery("/", { version });
}
