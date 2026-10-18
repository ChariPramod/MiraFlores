import { getOrCreateWorkspaceSession } from "@/lib/workspace/session";
import { deliver } from "@/lib/security/delivery";
import { ExportError, loadSnapshotExport, renderSnapshotExport } from "@/lib/filing/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ snapshotId: string }> }) {
  const session = await getOrCreateWorkspaceSession();
  const { snapshotId } = await context.params;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "client";
  if (kind !== "client" && kind !== "notice") return new Response("Unknown export kind", { status: 400 });
  try {
    const dto = await loadSnapshotExport({ session, snapshotId, branchId: url.searchParams.get("branch") ?? session.branchId, kind });
    // Logging must succeed before any unmasked content leaves the server.
    const delivered = await deliver(session, `export:${kind}:${snapshotId}`, dto);
    const filename = `workpaper-${kind}-${snapshotId.replace(/[^a-zA-Z0-9_-]/g, "")}.html`;
    return new Response(renderSnapshotExport(delivered), { headers: {
      "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    } });
  } catch (error) {
    if (error instanceof ExportError) return new Response(error.message, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    return new Response("Export unavailable; integrity and audit checks must succeed.", { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
