import { z } from "zod";
import { SnapshotPayloadSchema, PackageApprovalSchema, FilingAttemptSchema, BranchCreatedSchema } from "@/lib/filing/types";

export const POLICY_VERSION = "firm-standards-2026.1";

export const ClaimRefSchema = z.object({
  packetRef: z.string().min(1),
  engineVersion: z.string().optional(),
  branchId: z.string().min(1),
});
export type ClaimRef = z.infer<typeof ClaimRefSchema>;

export const EventTypeSchema = z.enum([
  "snapshot_created", "package_approval_recorded", "filing_attempt_recorded", "branch_created",
  "question_created", "answer_recorded", "question_resolved",
  "adjustment_recorded",
  "verification_recorded",
  "note_created",
  "note_resolved",
  "signoff_recorded",
  "document_disposition_recorded",
  "assignment_changed",
  "event_reversed",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const AdjustmentPayloadSchema = z.object({
  kind: z.literal("adjustment_recorded"),
  claimKey: z.string(),
  engineVersion: z.string(),
  field: z.enum(["basis", "proceeds", "gain", "other"]),
  unit: z.literal("money"),
  originalValue: z.union([z.number(), z.null()]),
  effectiveValue: z.number(),
  workingGain: z.number().optional(),
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
  estimatedFederalEffect: z.number().nullable(),
  estimatedCaliforniaEffect: z.number().nullable(),
  effectLimitations: z.array(z.string()).default([]),
  expectedRevision: z.number().int().nonnegative(),
});

export const VerificationPayloadSchema = z.object({
  kind: z.literal("verification_recorded"),
  claimKey: z.string(),
  engineVersion: z.string(),
  method: z.enum([
    "agree_to_printed",
    "agree_to_supplemental",
    "recalculate",
    "other",
  ]),
  conclusion: z.enum(["verified", "rejected", "needs_review"]),
  checkedFingerprint: z.string(),
  expectedRevision: z.number().int().nonnegative(),
});

export const NotePayloadSchema = z.object({
  kind: z.literal("note_created"),
  noteId: z.string(),
  claimKey: z.string().optional(),
  text: z.string().min(1),
  visibility: z.enum(["internal", "client"]),
  blocking: z.boolean().default(false),
});

export const NoteResolvedPayloadSchema = z.object({
  kind: z.literal("note_resolved"),
  noteId: z.string(),
  resolution: z.string().min(1),
});

export const SignoffPayloadSchema = z.object({
  kind: z.literal("signoff_recorded"),
  claimKey: z.string(),
  engineVersion: z.string(),
  level: z.enum(["preparer", "reviewer", "partner"]),
  fingerprint: z.string(),
  policyVersion: z.string(),
  expectedRevision: z.number().int().nonnegative(),
});

export const DispositionPayloadSchema = z.object({
  kind: z.literal("document_disposition_recorded"),
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
  expectedRevision: z.number().int().nonnegative().optional(),
});

export const AssignmentPayloadSchema = z.object({
  kind: z.literal("assignment_changed"),
  scopeKey: z.string(),
  previousAssigneeId: z.string().nullable(),
  assigneeId: z.string(),
  area: z.string().optional(),
});

export const ReversalPayloadSchema = z.object({
  kind: z.literal("event_reversed"),
  originalEventId: z.string(),
  compensatingSummary: z.string(),
});

export const QuestionPayloadSchema = z.object({ kind: z.literal("question_created"), clientId: z.string(), claimKey: z.string().optional(), text: z.string() });
export const AnswerPayloadSchema = z.object({ kind: z.literal("answer_recorded"), questionId: z.string(), text: z.string(), attachment: z.object({ name: z.string(), text: z.string(), classification: z.literal("restricted") }).optional() });
export const QuestionResolvedSchema = z.object({ kind: z.literal("question_resolved"), questionId: z.string(), resolution: z.string() });
export const EventPayloadSchema = z.discriminatedUnion("kind", [
  SnapshotPayloadSchema, PackageApprovalSchema, FilingAttemptSchema, BranchCreatedSchema,
  QuestionPayloadSchema, AnswerPayloadSchema, QuestionResolvedSchema,
  AdjustmentPayloadSchema,
  VerificationPayloadSchema,
  NotePayloadSchema,
  NoteResolvedPayloadSchema,
  SignoffPayloadSchema,
  DispositionPayloadSchema,
  AssignmentPayloadSchema,
  ReversalPayloadSchema,
]);
export type EventPayload = z.infer<typeof EventPayloadSchema>;

export const StoredEventSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  branchId: z.string(),
  sequence: z.number().int().positive(),
  actorId: z.string(),
  recordedAt: z.string(),
  effectiveAt: z.string(),
  type: EventTypeSchema,
  targetRefs: z.array(ClaimRefSchema),
  evidenceRefs: z.array(z.string()),
  reason: z.string().optional(),
  payload: EventPayloadSchema,
  idempotencyKey: z.string(),
  batchId: z.string().optional(),
  reversesEventId: z.string().optional(),
  /** Virtual branch inheritance retains the original actor/event and source branch. */
  inheritedFromBranchId: z.string().optional(),
});
export type StoredEvent = z.infer<typeof StoredEventSchema>;

export type AdjustmentRecord = {
  claimKey: string;
  engineVersion: string;
  field: string;
  originalValue: number | null;
  effectiveValue: number;
  workingGain?: number;
  category: string;
  effectMethod: string;
  estimatedFederalEffect: number | null;
  estimatedCaliforniaEffect: number | null;
  effectLimitations: string[];
  evidenceRefs: string[];
  reason: string;
  actorId: string;
  eventId: string;
  sequence: number;
  revision: number;
  reversed: boolean;
};

export type NoteRecord = {
  noteId: string;
  claimKey?: string;
  text: string;
  visibility: string;
  blocking: boolean;
  actorId: string;
  eventId: string;
  sequence: number;
  resolved: boolean;
  resolution?: string;
};

export type VerificationRecord = {
  claimKey: string;
  engineVersion: string;
  method: string;
  conclusion: string;
  checkedFingerprint: string;
  evidenceRefs: string[];
  actorId: string;
  eventId: string;
  sequence: number;
  revision: number;
  open: boolean;
};

export type SignoffRecord = {
  claimKey: string;
  engineVersion: string;
  level: "preparer" | "reviewer" | "partner";
  fingerprint: string;
  policyVersion: string;
  actorId: string;
  eventId: string;
  sequence: number;
  revision: number;
  status: "active" | "reopened";
  reopenReason?: string;
};

export type DispositionOverride = {
  documentId: string;
  disposition: string;
  explanation: string;
  actorId: string;
  eventId: string;
  sequence: number;
  reversed: boolean;
};

export type AssignmentRecord = {
  scopeKey: string;
  assigneeId: string;
  previousAssigneeId: string | null;
  area?: string;
  actorId: string;
  eventId: string;
  sequence: number;
  reversed: boolean;
};

export type WorkspaceProjection = {
  workspaceId: string;
  branchId: string;
  sequence: number;
  /** Per-claim revision counters for optimistic concurrency. */
  claimRevisions: Record<string, number>;
  documentRevisions: Record<string, number>;
  adjustments: Record<string, AdjustmentRecord>;
  notes: NoteRecord[];
  verifications: Record<string, VerificationRecord>;
  signoffs: Record<string, SignoffRecord>;
  dispositions: Record<string, DispositionOverride>;
  assignments: Record<string, AssignmentRecord>;
  reversedEventIds: string[];
  eventIds: string[];
};
