# MiraFlores Workpaper — approach

[Live prototype](https://mira-flores-workpaper.vercel.app) · [Validation record](HOSTED_VALIDATION.md) · [Error register](ERROR_REGISTER.md)

I organized the prototype around reviewable claims so a reviewer can explain a return value and inspect decisions that changed it. Each claim connects engine results, calculations, printed evidence, extracted interpretations, and review history. Navigation preserves evidence links and return version.

The main example is RSU lot N1. Its broker statement leaves basis unreported, but the engine uses zero and reports a $19,240 gain. A supplemental statement supports $19,100 basis. Recording that support produces a $140 working gain while retaining the original result. Printed evidence, extracted values, working decisions, and estimated tax effects remain visibly separate.

## Data and implementation

The original packet is unchanged: 74 documents, 199 pages, 3,012 extractions, and three return versions. A SHA-256 check protects its bytes. Server-side indexes resolve references and locate printed fields; the raw packet never goes to the browser. Next.js and TypeScript handle validated server commands and decimal arithmetic.

Supabase PostgreSQL stores append-only events. Current state combines those events with the immutable packet. Expected revisions reject stale changes, idempotency keys protect retries, and bulk operations commit atomically. Undo adds compensation and restores the previous surviving decision. Material fingerprints bind verification and approvals to what was reviewed, so relevant changes reopen them.

Signed workspace sessions isolate visitors and support fixed-persona invitations. Server authorization, sensitive-field redaction, and separate access logs govern delivered content. The persona selector demonstrates role behavior; it does not provide production identity verification.

## Evidence and review scope

Independent checks implement four catalog groups: EIN transcription mismatch, omitted supplemental RSU basis, duplicate interest, and missing sale M18. Brightpath's 260 lots provide a passing control. The broader register separates 18 audit-confirmed discrepancies from six suspected or judgment-dependent items. Those audit observations are not all automated checks or completed resolutions.

Local arithmetic is recalculated where supported. Tax effects use supplied rates and remain labeled estimates; the application does not rebuild the tax engine. Each supplied what-if retains its original v3 baseline. Version comparison preserves supplied results, and read-only replay gates evidence by its availability date without overwriting the working draft.

## Filing, deployment, and limitations

The prepared N1 lifecycle requires review, partner, and exact-summary client approval. Open review notes block submission. Simulated attempts preserve a snapshot and freeze the branch; successors and amendments inherit the frozen record without changing the parent. Self-contained client and staff HTML exports retain evidence references, hashes, and the freeze cutoff; later approvals and attempts remain in application history. Full-return readiness remains blocked by unfinished tax work.

The application is live on Vercel with Supabase. Hosted checks cover persistence, sign-off/undo, visitor isolation, separate package approvals, simulated federal acceptance and California rejection, an amendment with a child-only note, and an unchanged parent snapshot. Export hashes and local-link closure were structurally validated; offline browser rendering was not performed. See the validation record for remaining limits.

Broader tax checks, rental/partnership depth, production identity, and general binary uploads remain incomplete. No real filing or legally effective signature occurs. [AI_DISCLOSURE.md](AI_DISCLOSURE.md) explains AI assistance and the limits of the validation evidence.
