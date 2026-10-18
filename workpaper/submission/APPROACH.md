# MiraFlores Workpaper — approach

The prototype treats a tax return as a set of claims that a reviewer must be able to support. Each claim connects the supplied engine result, printed source, extracted interpretation, working adjustment, and attributed review decision. The main demonstration follows capital gain into RSU lot N1: the broker leaves basis blank, a supplemental statement supports $19,100, and the reviewed local arithmetic produces a $140 gain while preserving the engine's $19,240 result.

## Evidence before confidence

The original packet remains byte-for-byte unchanged: 74 documents, 199 pages, 3,012 extracted values, and three return versions. Its SHA-256 is verified at load time. Typed reference resolution and field-specific printed anchors make the source inspectable in both directions. Independent rules detect the EIN transcription error, omitted RSU basis, duplicate interest, and missing sale M18; Brightpath's 260 lots provide a passing control. The broader audit register is disclosed separately from implemented checks.

## Decisions with history

Next.js and TypeScript provide the server-rendered application and command boundary. Validated commands append attributed events; deterministic projections derive current state. Expected revisions reject stale changes, idempotency keys protect retries, and bulk commands commit together. Undo appends compensation and restores the preceding surviving decision. Verification and approvals use material fingerprints so affected approvals reopen after a change.

Supabase PostgreSQL is the intended hosted event store. A local file store supports development; it is prohibited on Vercel. Signed workspace capabilities isolate visitors and permit fixed-persona invitations. Server-side permissions, redaction, and separate sensitive-view audit logs protect delivered data. The role switcher demonstrates authorization behavior; it is not a production identity system.

## Bounded calculations and lifecycle

Supported local arithmetic is recalculated with decimal values. Tax effects are labeled estimates using supplied rates, not a rebuilt tax engine. Version comparison preserves the supplied v1/v2/v3 results. The five supplied scenarios each retain their original v3 baseline; they cannot be combined into a supposedly exact return. Replay is a read-only, date-gated view, separate from the working branch.

The implemented local Day 5 workflow is a simulation. Snapshot-specific reviewer, partner, and client approvals gate the prepared N1 demonstration; frozen attempts and child branches preserve records through rejection or amendment. Full-return readiness stays blocked by unresolved checks and incomplete tax work. Client-summary and staff-evidence HTML exports retain their frozen cutoff, evidence references, integrity manifest, and limitations, and work without external scripts or network resources.

## Submission boundaries

The code and automated tests are assisted by AI; see [AI disclosure](AI_DISCLOSURE.md). Only four error-catalog groups currently have implemented checks. General binary uploads/private object storage, broader tax-domain coverage, and production identity remain incomplete. No real filing or legally effective signature is performed. Public deployment, live Supabase validation, and a final narrated walkthrough remain release tasks. A verified 100-second captioned screenshot tour is included as `WALKTHROUGH.mp4`; it has no narration or live clicks. See [DEPLOYMENT.md](DEPLOYMENT.md).
