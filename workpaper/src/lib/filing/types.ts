import { z } from 'zod';

export const FilingScopeSchema = z.enum(['full_return', 'prepared_demo']);
export type FilingScope = z.infer<typeof FilingScopeSchema>;
export const JurisdictionSchema = z.enum(['federal', 'california']);
export type Jurisdiction = z.infer<typeof JurisdictionSchema>;
export const FrozenSnapshotSchema = z.object({
  id: z.string(), workspaceId: z.string(), branchId: z.string(),
  createdAt: z.string(), createdBy: z.string(), engineVersion: z.string(), asOf: z.string(),
  scope: FilingScopeSchema, label: z.string(), eventCutoff: z.number().int().nonnegative(),
  contentHash: z.string(), manifestHash: z.string(),
  manifest: z.object({
    packetHash: z.string(), policyVersion: z.string(), stateHash: z.string(),
    eventIds: z.array(z.string()),
    documentHashes: z.array(z.object({ id: z.string(), sha256: z.string(), pages: z.array(z.number()) })),
    evidenceRefs: z.array(z.string()),
    attachmentHashes: z.array(z.object({ eventId: z.string(), sha256: z.string(), classification: z.literal('restricted') })),
  }),
  summary: z.object({
    title: z.string(), simulationOnly: z.literal(true), fullyRecomputed: z.literal(false),
    engineVersion: z.string(), scope: FilingScopeSchema,
    n1: z.object({ engineBasis: z.number(), engineGain: z.number(), workingBasis: z.number().nullable(), workingGain: z.number().nullable(), evidenceRefs: z.array(z.string()) }),
    adjustments: z.array(z.object({ claimKey: z.string(), field: z.string(), originalValue: z.number().nullable(), effectiveValue: z.number(), workingGain: z.number().optional(), federalEstimate: z.number().nullable(), californiaEstimate: z.number().nullable() })),
    limitations: z.array(z.string()),
  }),
});
export type FrozenSnapshot = z.infer<typeof FrozenSnapshotSchema>;
export const SnapshotPayloadSchema = z.object({ kind: z.literal('snapshot_created'), snapshot: FrozenSnapshotSchema });
export const PackageApprovalSchema = z.object({ kind: z.literal('package_approval_recorded'), snapshotId: z.string(), contentHash: z.string(), level: z.enum(['reviewer','partner','client']), presentedSummaryHash: z.string() });
export const FilingAttemptSchema = z.object({ kind: z.literal('filing_attempt_recorded'), snapshotId: z.string(), contentHash: z.string(), jurisdiction: JurisdictionSchema, status: z.enum(['accepted','rejected']), simulationOnly: z.literal(true), reference: z.string(), reason: z.string(), scope: FilingScopeSchema });
export const BranchCreatedSchema = z.object({ kind: z.literal('branch_created'), parentBranchId: z.string(), parentSnapshotId: z.string(), parentContentHash: z.string(), mode: z.enum(['amendment','successor']), label: z.string() });
export type PackageApproval = z.infer<typeof PackageApprovalSchema> & { actorId: string; eventId: string; recordedAt: string };
export type FilingAttempt = z.infer<typeof FilingAttemptSchema> & { actorId: string; eventId: string; recordedAt: string };
export type FilingReadiness = { ready: boolean; blockers: string[]; partnerRequired: boolean; current: boolean; openNoteCount: number; unresolvedCheckCount: number };
export type FilingState = { workspaceId: string; branchId: string; sequence: number; frozen: boolean; snapshots: FrozenSnapshot[]; approvals: PackageApproval[]; attempts: FilingAttempt[]; readiness: Record<string, FilingReadiness>; jurisdictionStatus: Record<Jurisdiction, 'not_submitted'|'accepted'|'rejected'> };
const BaseCommand = z.object({ workspaceId: z.string(), branchId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), expectedSequence: z.number().int().nonnegative(), idempotencyKey: z.string().min(8).max(200) });
export const FilingCommandSchema = z.discriminatedUnion('type', [
  BaseCommand.extend({ type: z.literal('freeze_package'), scope: FilingScopeSchema }),
  BaseCommand.extend({ type: z.literal('approve_package'), snapshotId: z.string(), level: z.enum(['reviewer','partner','client']), presentedSummaryHash: z.string().min(1) }),
  BaseCommand.extend({ type: z.literal('submit_filing'), snapshotId: z.string(), jurisdiction: JurisdictionSchema, simulatedResult: z.enum(['accepted','rejected']), reason: z.string().min(5).max(2000) }),
  BaseCommand.extend({ type: z.literal('create_amendment'), snapshotId: z.string(), reason: z.string().min(5).max(2000) }),
  BaseCommand.extend({ type: z.literal('create_successor'), snapshotId: z.string(), reason: z.string().min(5).max(2000) }),
]);
export type FilingCommand = z.infer<typeof FilingCommandSchema>;
