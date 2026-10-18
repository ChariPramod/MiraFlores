# Deployment and release record

**Current external status:** no public application URL or verified live Supabase environment has been recorded. The source repository is intended for import into Vercel as `ChariPramod/MiraFlores`. These instructions describe release requirements; they are not evidence that deployment succeeded. A 100-second captioned screenshot tour was generated locally as `WALKTHROUGH.mp4`; encoding, decoding and representative frames have been verified. Generated videos are excluded from the source repository. It is separate from the planned five-to-eight-minute narrated live walkthrough.

**Implemented locally:** version comparison, read-only replay, baseline-bound scenarios, prepared N1 filing gates, immutable simulated attempts, successor/amendment branches, and role-filtered offline HTML exports. Full-return filing remains blocked. Local automated validation is not a substitute for the hosted checks below.

## Prepare hosted persistence

Use a dedicated demonstration Supabase project. Apply every repository migration in filename order:

1. `supabase/migrations/20261018_001_workspaces_events.sql`
2. `supabase/migrations/20261018_002_access_audit.sql`
3. `supabase/migrations/20261018_003_atomic_append.sql`
4. `supabase/migrations/20261018_004_frozen_filing_branches.sql`

The migrations establish workspaces, branches, append-only events, a separate sensitive-access audit, atomic append operations, and frozen filing/branch operations. RLS is enabled without browser/anonymous access policies; server code uses the service-role credential. Do not grant browser clients access to the event tables or privileged functions to make a failing deployment work.

Copy `.env.example` to a local ignored `.env.local` for development. Configure the same server-only variables on the hosting project:

| Variable | Requirement |
|---|---|
| `SUPABASE_URL` | URL of the dedicated Supabase project. |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret key; never a `NEXT_PUBLIC_` variable. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional legacy fallback when `SUPABASE_SECRET_KEY` is absent. |
| `WORKSPACE_SESSION_SECRET` | Stable cryptographically random secret of at least 32 bytes. Keep it across restarts/deploys; rotation invalidates session/invitation signatures. |

For example, `openssl rand -hex 32` generates a suitable session-secret value. The new secret key takes precedence when both key variables are set. A publishable key cannot replace the administrative key; the application does not need a publishable key or JWKS URL. Keep credentials in the environment configuration, never in source, screenshots, or the video. General private binary/object storage uploads are not implemented; the current attachment flow accepts restricted UTF-8 text within persisted events.

## Prepare the application release

Import `ChariPramod/MiraFlores` into Vercel. Select the **Next.js** framework preset, set **Root Directory** to **`workpaper`**, and use `npm ci` as the install command. The build command is `npm run build`; it includes packet/runtime-data trace verification. Keep `data/okafor_lindqvist_2025_packet.json` as a real packaged file. Add the server-only environment variables above to the environments you intend to deploy.

Run from `workpaper/`:

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

The expected packet SHA-256 is `ee01f8508bd2fd9854754b82fd9c4a055bdc55e2778a132002a25381c412ad19`. Build traces must include this packet and exclude `.data/`, session-secret files, and development history. Do not copy local visitor history into the release artifact.

The `.data/workspaces/` fallback is **development only**. Vercel execution requires Supabase and a stable session secret; local files are not hosted persistence. A passing local-file test does not validate PostgreSQL RPC permissions, row constraints, database transaction behavior, or redeploy persistence.

## Validate a configured deployment

Complete these checks on a private preview before distributing the public link:

- A fresh browser opens Overview with its own signed workspace. Another fresh browser receives a different workspace; an explicit fixed-persona invitation joins the intended workspace.
- Record an N1 adjustment, reload, and redeploy. The decision and history remain in Supabase. Verify audit rows are written for authorized unmasked deliveries.
- Test concurrent changes and retry the same command: no lost update, duplicate event, or partially committed bulk operation.
- As the uncleared preparer, inspect returned HTML/JSON and exports for sensitive values. As client/admin, verify direct restricted routes and commands are denied.
- Freeze a prepared N1 package, obtain separate reviewer/partner/client approvals, simulate a filing outcome, and create an amendment/successor. The original snapshot/attempt remains unchanged.
- Download client and notice exports, disconnect the network, and open both. Local reference links resolve; notice evidence covers noncash gifts and Schedule C receipts. No later event or future document appears in the original package.
- Use replay to confirm D71/D72 and later communications unlock only at their milestones. Supplied scenarios continue to label their original-v3 baseline.

The optional `WORKPAPER_TEST_URL=http://localhost:3000 npm test -- src/tests/http-day4.test.ts` suite is for a **local-file development server only**; it creates and cleans test workspaces. Do not point it at the hosted or Supabase-backed environment.

## Record release evidence

Before submission, replace the pending entries with actual outcomes:

| Evidence | Status |
|---|---|
| Public application URL | Pending |
| Deployed source revision | Pending |
| Supabase migrations and live RPC validation | Pending |
| Fresh-browser / shared-workspace / redeploy check | Pending |
| Offline export check on the deployed build | Pending |
| Short captioned screenshot-preview video | Generated locally: `WALKTHROUGH.mp4` · 100 seconds; not committed |
| Five-to-eight-minute recording URL | Pending |

Link [APPROACH.md](APPROACH.md), [ERROR_REGISTER.md](ERROR_REGISTER.md), and [AI_DISCLOSURE.md](AI_DISCLOSURE.md) with the application and recording. Keep the implemented-versus-backlog distinction in the final submission.

The captioned screenshot preview is retained locally at `submission/WALKTHROUGH.mp4`; it is not a narrated live-action recording. Vercel import/environment setup, remote migration execution, and the hosted smoke test remain pending.
