# Local validation — October 17, 2026

Publication check after adding Supabase secret-key support:

- Normal Vitest suite: **91 passed, 5 HTTP tests skipped**, 18 test files. The four new credential-selection tests pass; HTTP tests were deliberately not rerun against an unverified server configuration.
- TypeScript and ESLint: clean.
- Configured `npm run build` (Turbopack plus packaging verification): passed. A cached local port-permission failure was preserved outside the build cache before rerunning with local process permission.
- No live database or hosted deployment was validated by these checks.

Earlier Day 5 acceptance run, before the four credential-selection tests were added:

- Full Vitest suite with local HTTP checks enabled: **92/92 passed**, 17 test files.
- TypeScript: clean.
- ESLint: clean.
- Next.js production build: success; all new routes included.
- Build tracing: immutable packet included; `.data/` history, audit records and signing key excluded.

Commands (from `workpaper/`):

```sh
WORKPAPER_TEST_URL=http://localhost:3000 npm test
npm run typecheck
npm run lint
npm run build
```

The HTTP tests require a local-file-mode development server and create isolated disposable test workspaces. They were not run against a hosted system. The local execution sandbox initially blocked loopback/build-worker ports; reruns with local process permission succeeded after removing the cached build failure. No source-code workaround disabled the security boundaries.

Browser verification covered N1 adjustment/verification, stale package detection, exact-package reviewer/client/partner approvals, separate federal acceptance and California rejection, frozen-branch status, amendment creation, branch selection, inherited N1 values and branch preservation across persona switching. The existing preview sandbox now contains these explicitly simulated demonstration records. A fresh visitor receives an independent sandbox.

Version/replay checks covered 63/89 computed version changes, historical D71 availability versus June 23 denial, and supplied HVAC scenario effects. Server tests cover future agency/timeline evidence, client route denial, redacted HTML/server payloads, export roles, cross-workspace isolation, hash integrity, offline local reference anchors, concurrent writes, undo restoration, and immutable parent snapshots.

`WALKTHROUGH.mp4`: 100 seconds, H.264, 1600×1000, 24 fps. Encoded file was decoded and representative first/final frames visually inspected. This is a captioned screenshot tour, not live interaction or narration.

Not validated: live Supabase migrations/RPCs, Vercel deployment, shared hosted sessions across redeployments, production identity, or real tax calculation/filing. Full-return readiness remains intentionally blocked; the working lifecycle demonstration is scoped to N1.
