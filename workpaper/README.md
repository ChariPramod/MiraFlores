# MiraFlores Workpaper

Evidence-first tax workpaper for the Okafor–Lindqvist 2025 packet. See root [`PLAN.md`](../PLAN.md) and [`AGENT.md`](../AGENT.md).

## Status

- **Local:** `npm run dev` → http://localhost:3000
- **Public deployment:** https://mira-flores-workpaper.vercel.app. See [hosted validation](submission/HOSTED_VALIDATION.md) for observed results and remaining release checks.
- **Packet packaging:** `data/okafor_lindqvist_2025_packet.json` is a real file (1,943,262 bytes, SHA-256 `ee01f850…`), not a parent-folder symlink.
- **Persistence:** append-only events in Supabase when `SUPABASE_URL` + `SUPABASE_SECRET_KEY` are set (legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported); otherwise durable local `.data/workspaces/` (gitignored). Visitor workspaces stay isolated server-side through signed session cookies.
- **Demo data:** the supplied packet explicitly identifies all people, companies, identifiers, and financial data as fictional.

## Day 1–3 complete

- Immutable packet import (server-only) + SHA-256 inventory checks
- Version-preserving navigation; lot/field printed anchors; availability gate
- Independent checks + findings inbox (E01, E02, E03, E10 + Brightpath pass)
- Document dispositions, sales/asset detail, prior-year swings
- **Day 3:** typed commands, deterministic reducer, N1 basis adjustment (supported 19,100 → working gain 140), labeled tax estimates, notes/verification/sign-offs with dependency fingerprints, compensating undo, disposition overrides, bulk assign + atomic bulk undo

## Supabase setup

1. Create a Supabase project.
2. Apply all four files in `supabase/migrations/` in filename order: `001_workspaces_events`, `002_access_audit`, `003_atomic_append`, and `004_frozen_filing_branches` (SQL editor or CLI). See the [full migration filenames](submission/DEPLOYMENT.md#prepare-hosted-persistence).
3. Copy `.env.example` → `.env.local` and set `SUPABASE_URL` + `SUPABASE_SECRET_KEY`. The legacy `SUPABASE_SERVICE_ROLE_KEY` works as a fallback; the new secret key takes precedence. Keep both credentials server-only. RLS is enabled with no browser/anonymous policies.
4. Set a stable random `WORKSPACE_SESSION_SECRET` of at least 32 bytes for hosted use, then restart `npm run dev`. Publishable keys and JWKS URLs are not required by this application.

Without Supabase credentials the file store satisfies Day 3 acceptance locally (reload/restart retain decisions).

## Vercel setup

Import `ChariPramod/MiraFlores`, select **Next.js**, and set **Root Directory** to `workpaper`. Use `npm ci` for installation and `npm run build` for the build command. Configure `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or the legacy service-role key), and `WORKSPACE_SESSION_SECRET` as server-only Vercel environment variables. Apply all four migrations before opening the hosted application. Follow the [deployment and verification checklist](submission/DEPLOYMENT.md); a successful build alone does not validate live persistence.

## Run

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # if needed
cd workpaper
npm install
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

### Day 3 walkthrough

1. Open `/claim/F8949.B.N1?version=v3`.
2. Record basis adjustment 19100 with reason + `ev-0066` / `D11`.
3. Confirm original basis 0, engine gain 19,240, supported 19,100, working gain 140, labeled federal/CA effects.
4. Switch to Daniel (reviewer) to record sign-off; switch back to Priya before adjusting or undoing. Confirm approval reopens.
5. Undo — working values restore; event history remains.
6. Reload / restart — decision retained for this workspace cookie only.

## Remaining work

Broader checks beyond E01/E02/E03/E10, deeper books-to-tax/rental/K-1 work,
full-return recomputation, production identity, private binary uploads, and the
remaining hosted acceptance checks remain open. The implemented filing lifecycle is deliberately an N1
demonstration; full-return submission remains blocked.

## Day 4: people and permissions

Open `/collaboration` for the demo persona selector, questions and answers,
review-note resolution, assignments, notifications, and sharing. The owner
sandbox can switch active personas; invited sessions are locked to one persona.
This is a demonstration of authorization, not verified production identity.
Clients see only questions addressed to them and their responses. Administrators
manage assignments and inspect the most recent 100 unmasked-view audit records;
they cannot approve tax work. The quality reviewer is unavailable before 2027.

- Permissions are checked in the command service as well as route boundaries.
- Original preparer and authors of adjustments/verification cannot sign their own
  work or dependent totals. Large tax effects retain a partner approval requirement.
- Server DTOs mask SSNs, bank/account numbers and IP PINs for uncleared staff.
  Unmasked deliveries are logged separately; audit failures prevent delivery.
- Questions, responses and resolutions persist as events. Responses are selectable
  evidence on their claim, with no automatic change to the return.
- Upload support is deliberately limited to UTF-8 `.txt` evidence up to 64 KB.
  Uploaded content remains restricted to the submitting client and cleared staff.
  General binary uploads, classification/release and private object storage remain
  backlog items; there is no public attachment download endpoint.
- Invitations last one hour, carry one fixed persona, and are entered as codes.
  They are bearer capabilities: only give the code to the intended collaborator.
  Invitations currently expire together with the joined session; revocation and
  production accounts are not implemented.
- Foreground pages poll every five seconds. Clients receive only their visible
  conversation revision, not internal event counts. Session changes force a full
  navigation to discard old React/router state.

### Persistence and migration

Apply Supabase migrations `001`, `002`, `003`, and `004` in order. They add the separate
access log, enforce immutable history, and serialize compare-and-append inside
PostgreSQL. The server uses the service role; browser/anon access has no policies.
The RPC must be deployed before running this application against Supabase.
Live Supabase migrations and RPC behavior remain unvalidated.

Set `WORKSPACE_SESSION_SECRET` to a persistent random secret of at least 32 bytes
on Vercel. Locally an ignored `.data/session-secret` is created. Keep that file
alongside `.data/workspaces` and `.data/audit` when backing up local development.
Build packaging verification rejects any trace that includes `.data/`, while requiring the immutable packet. `.vercelignore` also excludes runtime data and screenshots.
Vercel refuses local-file fallback: Supabase and the signing secret are required.
Local compare-and-append uses a workspace directory lock; a crash can leave a
`.json.lock` directory. Inspect it only after stopping all local server processes
before removing that stale lock. The local store is for development, not hosting.

Earlier unsigned `wp_workspace` / `wp_persona` cookies are not trusted. Existing
Day 3 workspace JSON files are retained unchanged, but the browser starts a new
signed sandbox. Retained history needs an explicit, trusted migration if desired;
no automatic adoption by a client-supplied legacy workspace ID is permitted.

### Verification

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
With a **local-file-mode development server** running, also run:

```sh
WORKPAPER_TEST_URL=http://localhost:3000 npm test -- src/tests/http-day4.test.ts
```

The opt-in HTTP suite creates and cleans its own test workspaces. It checks raw
HTML/embedded server payloads, direct client-route denial, private conversation
visibility, and shared versus isolated polling sessions. Do not run it against
a hosted or Supabase-backed workspace.

## Day 5: compare, replay, and preserve records

- `/versions` compares supplied engine versions (63 changed lines v1→v2; 89 v2→v3).
- `/scenarios` shows five supplied alternatives against original v3. They are independent alternatives, not combinable adjustments or a fresh tax calculation.
- `/replay` seeks supplied milestones in a read-only view. `/replay/evidence` gates the selected evidence at that view's clock. The June 23 working session remains unchanged.
- `/filing` creates hash-bound review packages, exact-summary client approval, separate reviewer/partner approval, simulated federal and California results, and successor/amendment branches.
- Prepare N1 as Priya: basis 19,100 with `ev-0066` then **Mark verified**. Freeze an N1 demonstration package. Review as Daniel, approve as Helen, approve the displayed summary as Ngozi, then return to Helen to simulate submission. Open notes block submission. Full-return readiness is explicitly unavailable.
- A submission freezes that branch, including rejection. A rejected attempt can open a successor draft; acceptance can open an amendment. Use the Filing branch selector to enter the child. Parent snapshots remain unchanged. The signed session branch follows persona switching and invitations.
- Download client copy or staff offline evidence from a frozen package. HTML is self-contained, with local evidence anchors and immutable hashes; it requires no live app or CDN. Unknown/restricted attachments remain hidden from uncleared viewers. Future agency/timeline records cannot enter an earlier package.

## Submission materials

See `submission/APPROACH.md`, `ERROR_REGISTER.md`, `AI_DISCLOSURE.md`,
`WALKTHROUGH.md`, and `DEPLOYMENT.md`. They distinguish implemented behavior
from remaining requirements. The live URL and bounded hosted checks are recorded in `submission/HOSTED_VALIDATION.md`.

A local `submission/WALKTHROUGH.mp4` was generated as a 100-second captioned tour of actual preview screenshots. Generated videos and screenshots are excluded from this repository. `submission/WALKTHROUGH.md` provides the longer live recording script.
