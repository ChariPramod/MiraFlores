"use client";
import { useHydrated } from "./useHydrated";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { submitCommand } from "@/app/actions/commands";
import type { ClaimWorkingDto } from "@/lib/packet/projections";

type Props = {
  claimKey: string;
  version: string;
  working: ClaimWorkingDto;
  evidenceOptions: Array<{ ref: string; label: string }>;
  /** Pre-fill for N1 supplemental basis workflow */
  n1Preset?: boolean;
  actorRole: string;
};

function newIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function ClaimDecisionPanel({
  claimKey,
  version,
  working,
  evidenceOptions,
  n1Preset = false,
  actorRole,
}: Props) {
  const hydrated = useHydrated();
  const formId = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [basis, setBasis] = useState(n1Preset ? "19100" : "");
  const [reason, setReason] = useState(
    n1Preset
      ? "Apply D11 supplemental RSU basis (ev-0066); broker 1099-B basis was blank/zero."
      : "",
  );
  const [evidence, setEvidence] = useState<string[]>(
    n1Preset
      ? evidenceOptions
          .filter((e) => e.ref === "ev-0066" || e.ref === "D11")
          .map((e) => e.ref)
          .slice(0, 2)
      : [],
  );
  const [noteText, setNoteText] = useState("");
  const [signoffLevel, setSignoffLevel] = useState<
    "preparer" | "reviewer" | "partner"
  >(actorRole === "partner" ? "partner" : actorRole === "reviewer" ? "reviewer" : "preparer");

  function run(raw: unknown) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await submitCommand(raw);
      if (!result.ok) {
        setError(`${result.code}: ${result.message}`);
        return;
      }
      setMessage(
        result.deduped
          ? "Idempotent retry — history unchanged."
          : `Recorded at sequence ${result.sequence}.`,
      );
      router.refresh();
    });
  }

  function toggleEvidence(ref: string) {
    setEvidence((prev) =>
      prev.includes(ref) ? prev.filter((r) => r !== ref) : [...prev, ref],
    );
  }

  return (
    <section className="rounded border border-line bg-panel p-4 sm:p-5 space-y-5">
      <header>
        <h2 className="font-serif text-xl">Decisions</h2>
        <p className="text-xs text-ink-muted mt-1">
          Append-only events. Revision {working.revision} · branch sequence{" "}
          {working.branchSequence}. Stale writes are rejected.
        </p>
      </header>

      {working.partnerApprovalRequired && <p className="rounded border border-warn p-3 text-sm">{working.partnerApprovalSatisfied ? "Partner approval recorded." : "Partner approval required: estimated federal or state effect exceeds $1,000. Reviewer sign-off alone does not satisfy this requirement."}</p>}
      <p className="text-xs text-ink-muted">Sign-offs must match your role. You cannot sign work you prepared or its dependent totals.</p>
      {working.signoffStatus === "reopened" ? (
        <p className="rounded border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
          Sign-off reopened
          {working.signoffReopenReason
            ? `: ${working.signoffReopenReason}`
            : ""}
          .
        </p>
      ) : null}

      {working.notes.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {working.notes.map((n) => (
            <li key={n.noteId} className="rounded bg-paper-deep/70 px-2 py-1.5">
              {n.blocking ? (
                <span className="text-warn text-xs uppercase mr-2">Blocking</span>
              ) : null}
              {n.text}
            </li>
          ))}
        </ul>
      ) : null}

      <form method="post"
        id={`${formId}-adjust`}
        className="space-y-3 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim() || evidence.length === 0) {
            setError("Reason and at least one evidence reference are required.");
            return;
          }
          const value = Number(basis);
          if (!Number.isFinite(value)) {
            setError("Supported basis must be a number.");
            return;
          }
          run({
            type: "record_adjustment",
            claimKey,
            engineVersion: version,
            field: "basis",
            effectiveValue: value,
            category: "basis_correction",
            effectMethod: "stcg",
            evidenceRefs: evidence,
            reason: reason.trim(),
            expectedRevision: working.revision,
            expectedBranchSequence: working.branchSequence,
            idempotencyKey: newIdempotencyKey("adj"),
          });
        }}
      >
        <h3 className="text-sm font-medium">Record basis adjustment</h3>
        <label className="block text-xs text-ink-muted">
          Supported basis
          <input
            className="mt-1 w-full rounded border border-line bg-paper px-2 py-1.5 font-mono text-sm text-ink"
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            inputMode="decimal"
            required
          />
        </label>
        <label className="block text-xs text-ink-muted">
          Reason
          <textarea
            className="mt-1 w-full rounded border border-line bg-paper px-2 py-1.5 text-sm text-ink"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
          />
        </label>
        <fieldset className="space-y-1">
          <legend className="text-xs text-ink-muted">Supporting evidence</legend>
          <div className="flex flex-wrap gap-2">
            {evidenceOptions.map((opt) => (
              <label
                key={opt.ref}
                className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs"
              >
                <input
                  type="checkbox"
                  checked={evidence.includes(opt.ref)}
                  onChange={() => toggleEvidence(opt.ref)}
                />
                <span className="font-mono">{opt.ref}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          disabled={pending || !hydrated}
          className="rounded bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save adjustment"}
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 border-t border-line pt-4">
        <form method="post"
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run({
              type: "record_verification",
              claimKey,
              engineVersion: version,
              method: "agree_to_supplemental",
              conclusion: "verified",
              evidenceRefs: evidence.length ? evidence : ["ev-0066"],
              expectedRevision: working.revision,
              expectedBranchSequence: working.branchSequence,
              idempotencyKey: newIdempotencyKey("ver"),
            });
          }}
        >
          <h3 className="text-sm font-medium">Verification</h3>
          <p className="text-xs text-ink-muted">
            Status: {working.verificationStatus ?? "none"}
          </p>
          <button
            type="submit"
            disabled={pending || !hydrated}
            className="rounded border border-line px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Mark verified (fingerprint)
          </button>
        </form>

        <form method="post"
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run({
              type: "record_signoff",
              claimKey,
              engineVersion: version,
              level: signoffLevel,
              expectedRevision: working.revision,
              expectedBranchSequence: working.branchSequence,
              idempotencyKey: newIdempotencyKey("sig"),
            });
          }}
        >
          <h3 className="text-sm font-medium">Sign-off</h3>
          <p className="text-xs text-ink-muted">
            {working.signoffStatus
              ? `${working.signoffStatus}${working.signoffLevel ? ` · ${working.signoffLevel}` : ""}`
              : "none"}
          </p>
          <select
            className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm"
            value={signoffLevel}
            onChange={(e) =>
              setSignoffLevel(e.target.value as typeof signoffLevel)
            }
          >
            <option disabled={actorRole !== "preparer"} value="preparer">Preparer</option>
            <option disabled={actorRole !== "reviewer"} value="reviewer">Reviewer</option>
            <option disabled={actorRole !== "partner"} value="partner">Partner</option>
          </select>
          <button
            type="submit"
            disabled={pending || !hydrated}
            className="rounded border border-line px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Record sign-off
          </button>
        </form>
      </div>

      <form method="post"
        className="space-y-2 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!noteText.trim()) return;
          run({
            type: "record_note",
            claimKey,
            text: noteText.trim(),
            visibility: "internal",
            blocking: false,
            expectedBranchSequence: working.branchSequence,
            idempotencyKey: newIdempotencyKey("note"),
          });
          setNoteText("");
        }}
      >
        <h3 className="text-sm font-medium">Note</h3>
        <p className="text-xs text-ink-muted">
          Notes do not reopen sign-offs or change working values.
        </p>
        <textarea
          className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm"
          rows={2}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Persistent reviewer note…"
        />
        <button
          type="submit"
          disabled={pending || !hydrated}
          className="rounded border border-line px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Add note
        </button>
      </form>

      {working.adjustmentEventId ? (
        <form method="post"
          className="border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            run({
              type: "undo_event",
              eventId: working.adjustmentEventId,
              reason: "Undo N1 basis correction — restore engine working gain",
              expectedBranchSequence: working.branchSequence,
              idempotencyKey: newIdempotencyKey("undo"),
            });
          }}
        >
          <h3 className="text-sm font-medium">Undo adjustment</h3>
          <p className="text-xs text-ink-muted mb-2">
            Appends a compensating event. History is never deleted.
          </p>
          <button
            type="submit"
            disabled={pending || !hydrated}
            className="rounded border border-warn/50 px-3 py-1.5 text-sm text-warn disabled:opacity-50"
          >
            Undo current adjustment
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="text-sm text-mismatch" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-ink-muted" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
