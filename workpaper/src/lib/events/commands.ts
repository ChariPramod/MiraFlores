import { z } from "zod";

export const RecordAdjustmentCommandSchema = z.object({
  type: z.literal("record_adjustment"),
  workspaceId: z.string(),
  branchId: z.string().default("main"),
  claimKey: z.string(),
  engineVersion: z.string(),
  field: z.enum(["basis", "proceeds", "gain", "other"]),
  effectiveValue: z.number(),
  category: z.enum([
    "basis_correction",
    "duplicate_removal",
    "classification",
    "other",
  ]),
  effectMethod: z.enum([
    "stcg",
    "ltcg",
    "interest",
    "schc_profit",
    "ordinary_income",
    "itemized",
    "none",
  ]),
  evidenceRefs: z.array(z.string()).min(1),
  reason: z.string().min(3),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8),
  expectedBranchSequence: z.number().int().nonnegative().optional(),
});

export const RecordVerificationCommandSchema = z.object({
  type: z.literal("record_verification"),
  workspaceId: z.string(),
  branchId: z.string().default("main"),
  claimKey: z.string(),
  engineVersion: z.string(),
  method: z.enum([
    "agree_to_printed",
    "agree_to_supplemental",
    "recalculate",
    "other",
  ]),
  conclusion: z.enum(["verified", "rejected", "needs_review"]),
  evidenceRefs: z.array(z.string()).default([]),
  reason: z.string().optional(),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8),
  expectedBranchSequence: z.number().int().nonnegative().optional(),
});

export const RecordNoteCommandSchema = z.object({
  type: z.literal("record_note"),
  workspaceId: z.string(),
  branchId: z.string().default("main"),
  claimKey: z.string().optional(),
  text: z.string().min(1),
  visibility: z.enum(["internal", "client"]).default("internal"),
  blocking: z.boolean().default(false),
  idempotencyKey: z.string().min(8),
  expectedBranchSequence: z.number().int().nonnegative().optional(),
});

export const RecordSignoffCommandSchema = z.object({
  type: z.literal("record_signoff"),
  workspaceId: z.string(),
  branchId: z.string().default("main"),
  claimKey: z.string(),
  engineVersion: z.string(),
  level: z.enum(["preparer", "reviewer", "partner"]),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8),
  reason: z.string().optional(),
  expectedBranchSequence: z.number().int().nonnegative().optional(),
});

export const RecordDispositionCommandSchema = z.object({
  type: z.literal("record_disposition"),
  workspaceId: z.string(),
  branchId: z.string().default("main"),
  documentId: z.string(),
  disposition: z.enum([
    "used",
    "supporting_only",
    "duplicate",
    "superseded",
    "irrelevant",
    "pending",
    "unavailable",
  ]),
  explanation: z.string().min(1),
  idempotencyKey: z.string().min(8),
  expectedBranchSequence: z.number().int().nonnegative().optional(),
});

export const UndoEventCommandSchema = z.object({
  type: z.literal("undo_event"),
  workspaceId: z.string(),
  branchId: z.string().default("main"),
  eventId: z.string(),
  reason: z.string().min(3),
  idempotencyKey: z.string().min(8),
  expectedBranchSequence: z.number().int().nonnegative().optional(),
});

export const BulkAssignCommandSchema = z.object({
  type: z.literal("bulk_assign"),
  workspaceId: z.string(),
  branchId: z.string().default("main"),
  assigneeId: z.string(),
  scopeKeys: z.array(z.string()).min(1),
  area: z.string().optional(),
  reason: z.string().min(3),
  idempotencyKey: z.string().min(8),
  expectedBranchSequence: z.number().int().nonnegative().optional(),
});

export const BulkUndoCommandSchema = z.object({
  type: z.literal("bulk_undo"),
  workspaceId: z.string(),
  branchId: z.string().default("main"),
  batchId: z.string(),
  reason: z.string().min(3),
  idempotencyKey: z.string().min(8),
  expectedBranchSequence: z.number().int().nonnegative().optional(),
});

const CollaborationBase = z.object({ workspaceId: z.string(), branchId: z.string().default("main"), idempotencyKey: z.string().min(8), expectedBranchSequence: z.number().int().nonnegative().optional() });
export const AskQuestionSchema = CollaborationBase.extend({ type: z.literal("ask_question"), clientId: z.string(), claimKey: z.string().optional(), text: z.string().min(3).max(5000) });
export const AnswerSchema = CollaborationBase.extend({ type: z.literal("record_answer"), questionId: z.string(), text: z.string().min(1).max(10000), attachment: z.object({ name: z.string().min(1).max(180), text: z.string().max(64000) }).optional() });
export const ResolveQuestionSchema = CollaborationBase.extend({ type: z.literal("resolve_question"), questionId: z.string(), resolution: z.string().min(3).max(5000) });
export const ResolveNoteSchema = CollaborationBase.extend({ type: z.literal("resolve_note"), noteId: z.string(), resolution: z.string().min(3).max(5000) });

export const CommandSchema = z.discriminatedUnion("type", [
  AskQuestionSchema, AnswerSchema, ResolveQuestionSchema, ResolveNoteSchema,
  RecordAdjustmentCommandSchema,
  RecordVerificationCommandSchema,
  RecordNoteCommandSchema,
  RecordSignoffCommandSchema,
  RecordDispositionCommandSchema,
  UndoEventCommandSchema,
  BulkAssignCommandSchema,
  BulkUndoCommandSchema,
]);

export type Command = z.infer<typeof CommandSchema>;
