'use server';
import { revalidatePath } from 'next/cache';
import { getOrCreateWorkspaceSession } from '@/lib/workspace/session';
import { FilingCommandSchema } from '@/lib/filing/types';
import { executeFilingCommand } from '@/lib/filing/service';

export async function submitFilingCommand(raw: unknown) {
  const session = await getOrCreateWorkspaceSession();
  const parsed = FilingCommandSchema.safeParse({ ...(raw as object), workspaceId:session.workspaceId, branchId:session.branchId });
  if (!parsed.success) return { ok:false as const, message:'Invalid filing request. Refresh and try again.' };
  const result = await executeFilingCommand({ command:parsed.data, actorId:session.personaId, sessionWorkspaceId:session.workspaceId, version:session.version, asOf:session.simulationDate });
  if (!result.ok) return { ok:false as const, message:result.message };
  revalidatePath('/', 'layout');
  return { ok:true as const, message:'Saved to the filing record.' };
}
