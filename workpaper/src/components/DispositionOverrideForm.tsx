"use client";
import { useHydrated } from "./useHydrated";

import { useState, useTransition } from "react";
import { submitCommand } from "@/app/actions/commands";

type Props = {
  documentId: string;
  currentDisposition: string;
  branchSequence: number;
};

export function DispositionOverrideForm({
  documentId,
  currentDisposition,
  branchSequence,
}: Props) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [disposition, setDisposition] = useState(currentDisposition);
  const [explanation, setExplanation] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form method="post"
      className="mt-1 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (explanation.trim().length < 1) return;
        setMessage(null);
        startTransition(async () => {
          const result = await submitCommand({
            type: "record_disposition",
            documentId,
            disposition,
            explanation: explanation.trim(),
            expectedBranchSequence: branchSequence,
            idempotencyKey: `disp_${crypto.randomUUID()}`,
          });
          setMessage(
            result.ok
              ? result.deduped
                ? "Deduped"
                : `Saved · seq ${result.sequence}`
              : `${result.code}: ${result.message}`,
          );
        });
      }}
    >
      <select
        className="rounded border border-line bg-paper px-1.5 py-1 text-xs font-mono"
        value={disposition}
        onChange={(e) => setDisposition(e.target.value)}
      >
        {[
          "used",
          "supporting_only",
          "duplicate",
          "superseded",
          "irrelevant",
          "pending",
          "unavailable",
        ].map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <input
        className="min-w-[10rem] flex-1 rounded border border-line bg-paper px-1.5 py-1 text-xs"
        placeholder="Override reason"
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        required
      />
      <button
        type="submit"
        disabled={pending || !hydrated}
        className="rounded border border-line px-2 py-1 text-xs disabled:opacity-50"
      >
        Override
      </button>
      {message ? (
        <span className="text-[11px] text-ink-muted w-full">{message}</span>
      ) : null}
    </form>
  );
}
