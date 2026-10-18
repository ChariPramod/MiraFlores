# Project instructions

- Read `PLAN.md` before working. Follow its agreed scope, architecture, six-day milestones, and MUST/SHOULD/STUB/SKIP priorities.
- Build a web-native, evidence-first tax workpaper, not a spreadsheet clone. Prioritize traceability, independent checks, persistent decisions, review, and immutable filing records.
- Keep `okafor_lindqvist_2025_packet.json` unchanged. Printed document content is source evidence; extracted values and engine outputs may be wrong, even at high confidence.
- Preserve packet reference IDs and version context. Cite evidence for findings; distinguish confirmed discrepancies from suspected issues and reviewer judgments. Never convert missing values to zero silently.
- Do not invent tax rules or rebuild the tax engine. Use supplied tax-effect rates for labeled estimates and supplied what-ifs only against their stated baseline.
- Persist business activity as append-only events. Preserve originals, actor, reason, and evidence. Undo uses compensating events; material changes reopen affected sign-offs.
- Enforce roles and sensitive-data access on the server, including search, attachments, exports, and document text. Never send the raw packet to the browser.
- Default to v3 as of June 23, 2026. Gate later evidence through replay; keep visitor sandboxes isolated and filed snapshots immutable.
- Use the planned Next.js/TypeScript application with Supabase PostgreSQL/private storage and Vercel deployment. Keep implementation simple and label simulations and unfinished features honestly.
- Test meaningful behavior: reference resolution, known findings and positive controls, persistence, authorization, concurrent edits, approval invalidation, replay, and filing freeze/amendment.
- Stay within the requested task. Report changes, relevant validation, and remaining limitations concisely. Update `PLAN.md` when an agreed decision changes.
