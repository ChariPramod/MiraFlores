"use client";
import { useHydrated } from "./useHydrated";

import { useState, useTransition } from "react";
import { submitCommand } from "@/app/actions/commands";

type Props = {
  version: string;
  branchSequence: number;
  staffOptions: Array<{ id: string; label: string }>;
  scopeOptions: Array<{ key: string; label: string }>;
  lastBatchId: string | null;
};

function newKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function BulkAssignPanel({
  version,
  branchSequence,
  staffOptions,
  scopeOptions,
  lastBatchId,
}: Props) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [assigneeId, setAssigneeId] = useState(staffOptions[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>(
    scopeOptions.slice(0, 2).map((s) => s.key),
  );
  const [reason, setReason] = useState("Bulk area assignment for review queue");
  const [batchId, setBatchId] = useState(lastBatchId);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  return (
    <section className="rounded border border-line bg-panel p-4 sm:p-5 space-y-4">
      <header>
        <h2 className="font-serif text-xl">Bulk assignment</h2>
        <p className="text-xs text-ink-muted mt-1">
          Atomic multi-event commit for {version}. Undo reverses the whole batch
          with compensating events.
        </p>
      </header>

      <label className="block text-xs text-ink-muted">
        Assignee
        <select
          className="mt-1 w-full rounded border border-line bg-paper px-2 py-1.5 text-sm"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
        >
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-1">
        <legend className="text-xs text-ink-muted">Scopes</legend>
        <div className="flex flex-wrap gap-2">
          {scopeOptions.map((s) => (
            <label
              key={s.key}
              className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={selected.includes(s.key)}
                onChange={() => toggle(s.key)}
              />
              <span className="font-mono">{s.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-xs text-ink-muted">
        Reason
        <input
          className="mt-1 w-full rounded border border-line bg-paper px-2 py-1.5 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || selected.length === 0}
          className="rounded bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-50"
          onClick={() => {
            setError(null);
            setMessage(null);
            startTransition(async () => {
              const result = await submitCommand({
                type: "bulk_assign",
                assigneeId,
                scopeKeys: selected,
                area: "capital_gains",
                reason,
                expectedBranchSequence: branchSequence,
                idempotencyKey: newKey("bulk"),
              });
              if (!result.ok) {
                setError(`${result.code}: ${result.message}`);
                return;
              }
              if (result.batchId) setBatchId(result.batchId);
              setMessage(`Assigned at sequence ${result.sequence}.`);
            });
          }}
        >
          Assign selected
        </button>

        {batchId ? (
          <button
            type="button"
            disabled={pending || !hydrated}
            className="rounded border border-warn/50 px-3 py-1.5 text-sm text-warn disabled:opacity-50"
            onClick={() => {
              setError(null);
              setMessage(null);
              startTransition(async () => {
                const result = await submitCommand({
                  type: "bulk_undo",
                  batchId,
                  reason: "Atomic bulk undo of assignment batch",
                  expectedBranchSequence: branchSequence,
                  idempotencyKey: newKey("bulkundo"),
                });
                if (!result.ok) {
                  setError(`${result.code}: ${result.message}`);
                  return;
                }
                setBatchId(null);
                setMessage(`Bulk undo at sequence ${result.sequence}.`);
              });
            }}
          >
            Undo last batch
          </button>
        ) : null}
      </div>

      {batchId ? (
        <p className="text-xs text-ink-muted font-mono">Last batch: {batchId}</p>
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
