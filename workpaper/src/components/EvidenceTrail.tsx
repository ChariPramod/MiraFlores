import Link from "next/link";
import { CalcTree } from "@/components/CalcTree";
import { ClaimDecisionPanel } from "@/components/ClaimDecisionPanel";
import { claimHrefRequired } from "@/lib/navigation/href";
import type { CalcTreeDto, ClaimDto } from "@/lib/packet/projections";
import { formatConfidence, formatNumber } from "@/lib/format/money";

export function EvidenceTrail({
  claim,
  tree,
  actorRole,
  answerEvidence = [],
}: {
  claim: ClaimDto;
  tree: CalcTreeDto | null;
  actorRole: string;
  answerEvidence?: Array<{ref:string;label:string}>;
}) {
  const version = claim.version;
  const working = claim.working;
  const hasAdj =
    working &&
    (working.supportedBasisDisplay ||
      working.workingGainDisplay ||
      working.adjustmentReason);

  const taxHintParts: string[] = [];
  if (working?.estimatedFederalEffectDisplay) {
    taxHintParts.push(`Federal ${working.estimatedFederalEffectDisplay}`);
  }
  if (working?.estimatedCaliforniaEffectDisplay) {
    taxHintParts.push(`CA ${working.estimatedCaliforniaEffectDisplay}`);
  }
  if (working?.effectMethod) {
    taxHintParts.push(`method ${working.effectMethod}`);
  }

  const evidenceOptions = [
    ...answerEvidence,
    ...claim.sources.map((s) => ({
      ref: s.ref,
      label: s.label,
    })),
    { ref: "D11", label: "Supplemental basis worksheet" },
    { ref: "ev-0066", label: "D11 N1 adjusted basis 19,100" },
  ].filter(
    (opt, i, arr) => arr.findIndex((x) => x.ref === opt.ref) === i,
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">
          Evidence trail · {claim.version} · {claim.jurisdiction}
        </p>
        <h1 className="font-serif text-3xl text-ink">
          <span className="font-mono text-2xl text-accent">{claim.key}</span>
          <span className="mx-3 text-line">·</span>
          {claim.label}
        </h1>
        <p className="text-sm text-ink-muted max-w-3xl">
          Where did this come from? Engine value, calculation inputs, cited
          sources, and printed fields — extracted confidence is not verification.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Supplied engine value"
          value={claim.engineValueDisplay}
          hint={`${claim.rule}${claim.ruleExplanation ? ` — ${claim.ruleExplanation}` : ""}`}
        />
        <Metric
          label="Reviewed working value"
          value={
            working?.workingGainDisplay ??
            working?.workingValueDisplay ??
            claim.engineValueDisplay
          }
          hint={
            hasAdj
              ? [
                  working.originalBasisDisplay
                    ? `Original broker basis ${working.originalBasisDisplay}`
                    : null,
                  working.supportedBasisDisplay
                    ? `Supported basis ${working.supportedBasisDisplay}`
                    : null,
                  working.adjustmentReason,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Same as engine until an adjustment is recorded"
          }
        />
        <Metric
          label="Estimated tax effect"
          value={
            taxHintParts.length
              ? [
                  working?.estimatedFederalEffectDisplay,
                  working?.estimatedCaliforniaEffectDisplay,
                ]
                  .filter(Boolean)
                  .join(" / ") || "—"
              : "—"
          }
          hint={
            taxHintParts.length
              ? `${taxHintParts.join(" · ")}. Labeled estimate — not a full recompute.`
              : "Labeled estimate from supplied rates after adjustment"
          }
        />
      </div>

      {hasAdj ? (
        <aside className="rounded border border-accent/30 bg-accent-soft/50 px-4 py-3 text-sm space-y-1">
          <p>
            <strong className="font-medium">Working decision:</strong> original
            broker basis{" "}
            <span className="font-mono">
              {working.originalBasisDisplay ?? "—"}
            </span>
            ; supported basis{" "}
            <span className="font-mono">
              {working.supportedBasisDisplay ?? "—"}
            </span>
            ; working gain{" "}
            <span className="font-mono">
              {working.workingGainDisplay ?? working.workingValueDisplay}
            </span>
            . Engine gain remains{" "}
            <span className="font-mono">{claim.engineValueDisplay}</span>.
          </p>
          {working.adjustmentEvidence.length ? (
            <p className="text-xs text-ink-muted">
              Evidence:{" "}
              {working.adjustmentEvidence.map((r) => (
                <span key={r} className="font-mono mr-2">
                  {r}
                </span>
              ))}
            </p>
          ) : null}
          {working.effectLimitations.length ? (
            <ul className="text-xs text-ink-muted list-disc pl-4">
              {working.effectLimitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-ink-muted">
            Downstream claims ({claim.usedIn.map((u) => u.key).join(", ") || "none listed"})
            may be affected economically; the return is not fully recomputed.
          </p>
        </aside>
      ) : null}

      {claim.pathFromCapitalGain && claim.key !== "F1040.7" ? (
        <nav
          aria-label="Path from capital gain"
          className="flex flex-wrap items-center gap-1 text-sm"
        >
          <span className="text-ink-muted mr-1">From F1040.7:</span>
          {claim.pathFromCapitalGain.map((key, i) => (
            <span key={key} className="flex items-center gap-1">
              {i > 0 ? <span className="text-ink-muted">→</span> : null}
              <Link
                href={claimHrefRequired(key, version)}
                className={`font-mono ${key === claim.key ? "font-semibold text-ink no-underline" : ""}`}
              >
                {key}
              </Link>
            </span>
          ))}
        </nav>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded border border-line bg-panel p-4 sm:p-5">
          <h2 className="font-serif text-xl">Calculation</h2>
          <p className="text-xs text-ink-muted mt-1 mb-3">
            Declared inputs only. Incomplete lineage is shown as declared — not
            invented.
          </p>
          {tree ? (
            <ul>
              <CalcTree node={tree} focusKey={claim.key} version={version} />
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No calculation tree.</p>
          )}

          {claim.inputs.length > 0 ? (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="text-xs uppercase tracking-wide text-ink-muted mb-2">
                Direct inputs
              </h3>
              <ul className="space-y-1 text-sm">
                {claim.inputs.map((input) => (
                  <li key={input.key} className="flex justify-between gap-2">
                    <Link
                      href={claimHrefRequired(input.key, version)}
                      className="font-mono"
                    >
                      {input.key}
                    </Link>
                    <span className="text-ink-muted truncate">{input.label}</span>
                    <span className="font-mono tabular-nums">
                      {input.valueDisplay}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="rounded border border-line bg-panel p-4 sm:p-5">
          <h2 className="font-serif text-xl">Cited sources</h2>
          <p className="text-xs text-ink-muted mt-1 mb-3">
            Printed evidence vs extracted interpretation. Future evidence is
            gated by the simulation clock.
          </p>
          {claim.sources.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No direct source citations on this line (carried or computed from
              inputs).
            </p>
          ) : (
            <ul className="space-y-3">
              {claim.sources.map((src) => (
                <li
                  key={src.ref}
                  className="rounded border border-line p-3 space-y-2"
                >
                  {!src.available ? (
                    <p className="text-sm text-warn">{src.label}</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <span className="font-mono text-sm">{src.ref}</span>
                          <span className="text-ink-muted text-sm">
                            {" "}
                            · {src.label}
                          </span>
                        </div>
                        {src.confidence != null ? (
                          <span className="text-xs text-ink-muted">
                            {formatConfidence(src.confidence)} confidence
                          </span>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded bg-paper-deep/80 px-2 py-1.5">
                          <div className="text-[10px] uppercase tracking-wide text-ink-muted">
                            Printed
                          </div>
                          <div className="font-mono mt-0.5">
                            {src.printedSnippet ?? (
                              <span className="text-ink-muted">
                                {src.agreement === "blank_extraction"
                                  ? "(blank / not reported)"
                                  : src.agreement === "unresolved"
                                    ? "exact field not located"
                                    : "—"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          className={`rounded px-2 py-1.5 ${
                            src.agreement === "mismatch"
                              ? "bg-mismatch-soft"
                              : "bg-paper-deep/80"
                          }`}
                        >
                          <div className="text-[10px] uppercase tracking-wide text-ink-muted">
                            Extracted
                          </div>
                          <div className="font-mono mt-0.5">
                            {formatNumber(src.extractedValue)}
                            {src.textAsRead !== null ? (
                              <span className="text-ink-muted text-xs">
                                {" "}
                                (“{src.textAsRead || "∅"}”)
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {src.agreement === "unresolved" ? (
                        <p className="text-xs text-warn">
                          Unresolved/ambiguous anchor — not classified as a
                          discrepancy.
                        </p>
                      ) : null}
                      {src.agreement === "mismatch" ? (
                        <p className="text-xs text-mismatch">
                          Genuine printed vs extracted discrepancy.
                        </p>
                      ) : null}
                      {src.href ? (
                        <Link href={src.href} className="text-sm">
                          Open {src.documentId} page {src.page} →
                        </Link>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {claim.usedIn.length > 0 ? (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="text-xs uppercase tracking-wide text-ink-muted mb-2">
                Used in
              </h3>
              <ul className="space-y-1 text-sm">
                {claim.usedIn.map((u) => (
                  <li key={u.key}>
                    <Link
                      href={claimHrefRequired(u.key, version)}
                      className="font-mono"
                    >
                      {u.key}
                    </Link>
                    <span className="text-ink-muted"> — {u.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      {claim.key === "F1040.7" ? (
        <aside className="rounded border border-accent/30 bg-accent-soft/60 px-4 py-3 text-sm">
          <strong className="font-medium">Walkthrough:</strong> expand
          short-term broker sales via{" "}
          <Link href={claimHrefRequired("SchD.7", version)}>SchD.7</Link> →{" "}
          <Link href={claimHrefRequired("SchD.2", version)}>SchD.2</Link> →{" "}
          <Link href={claimHrefRequired("F8949.B.total", version)}>
            F8949.B.total
          </Link>{" "}
          →{" "}
          <Link href={claimHrefRequired("F8949.B.N1", version)}>
            F8949.B.N1
          </Link>
          , then open the printed basis field on the 1099-B.
        </aside>
      ) : null}

      {claim.key === "F8949.B.N1" ? (
        <aside className="rounded border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          Lot N1 cites blank/zero broker basis. See findings inbox for
          supplemental-basis check (catalog E02) when D11 support is available.
          Preparer can apply supported basis 19,100 (ev-0066) below.
        </aside>
      ) : null}

      {working ? (
        <ClaimDecisionPanel
          actorRole={actorRole}
          claimKey={claim.key}
          version={version}
          working={working}
          evidenceOptions={evidenceOptions}
          n1Preset={claim.key === "F8949.B.N1"}
        />
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded border border-line bg-panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">
        {label}
      </div>
      <div className="font-mono text-2xl tabular-nums mt-1">{value}</div>
      <div className="text-xs text-ink-muted mt-1 line-clamp-2">{hint}</div>
    </div>
  );
}
