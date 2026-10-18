"use server";

import { revalidatePath } from "next/cache";
import { CommandSchema, type Command } from "@/lib/events/commands";
import { executeCommand } from "@/lib/events/service";
import { getOrCreateWorkspaceSession } from "@/lib/workspace/session";

export type ActionResult =
  | {
      ok: true;
      sequence: number;
      deduped: boolean;
      message?: string;
      batchId?: string;
      eventIds?: string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      currentSequence?: number;
      currentRevision?: number;
    };

export async function submitCommand(
  raw: unknown,
): Promise<ActionResult> {
  const session = await getOrCreateWorkspaceSession();
  const parsed = CommandSchema.safeParse({
    ...(raw as object),
    workspaceId: session.workspaceId,
    branchId: session.branchId,
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: parsed.error.message,
    };
  }

  // Force cookie workspace — never trust client-supplied workspaceId
  const command = {
    ...parsed.data,
    workspaceId: session.workspaceId,
  } as Command;

  const result = await executeCommand({
    command,
    actorId: session.personaId,
    sessionWorkspaceId: session.workspaceId,
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      currentSequence: result.currentSequence,
      currentRevision: result.currentRevision,
    };
  }

  revalidatePath("/");
  revalidatePath("/claim", "layout");
  revalidatePath("/documents");
  revalidatePath("/findings");

  return {
    ok: true,
    sequence: result.projection.sequence,
    deduped: result.deduped,
    message: result.deduped ? "Idempotent retry — no new events" : undefined,
    batchId: result.events[0]?.batchId,
    eventIds: result.events.map((e) => e.id),
  };
}
