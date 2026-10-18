import Link from "next/link";
import { claimHrefRequired } from "@/lib/navigation/href";
import type { CalcTreeDto } from "@/lib/packet/projections";

export function CalcTree({
  node,
  depth = 0,
  focusKey,
  version,
}: {
  node: CalcTreeDto;
  depth?: number;
  focusKey?: string;
  version: string;
}) {
  const isFocus = node.key === focusKey;
  return (
    <li className={depth === 0 ? "list-none" : undefined}>
      <div
        className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded px-2 py-1 ${
          isFocus ? "bg-accent-soft" : "hover:bg-paper-deep/80"
        }`}
        style={{ marginLeft: depth * 12 }}
      >
        {node.rule === "R-COLLAPSED" || node.key.endsWith("…") ? (
          <span className="font-mono text-sm font-medium text-ink-muted">
            {node.key}
          </span>
        ) : (
          <Link
            href={claimHrefRequired(node.key, version)}
            className="font-mono text-sm font-medium no-underline hover:underline"
          >
            {node.key}
          </Link>
        )}
        <span className="text-sm text-ink-muted">{node.label}</span>
        <span className="font-mono text-sm tabular-nums text-ink">
          {node.valueDisplay}
        </span>
        <span className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-muted">
          {node.rule}
        </span>
        {node.cycle ? (
          <span className="text-[10px] text-warn">cycle truncated</span>
        ) : null}
      </div>
      {node.children.length > 0 ? (
        <ul className="border-l border-line/80 ml-3">
          {node.children.map((child) => (
            <CalcTree
              key={child.key}
              node={child}
              depth={depth + 1}
              focusKey={focusKey}
              version={version}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
