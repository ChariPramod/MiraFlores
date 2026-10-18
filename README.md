# MiraFlores Workpaper

A Next.js and TypeScript prototype for reviewing the supplied Okafor–Lindqvist tax packet. It connects return claims to printed evidence, derives independent findings, preserves attributed adjustments, and demonstrates review and filing records. The supplied packet explicitly identifies its people, companies, identifiers, and financial data as fictional.

The application is in [`workpaper/`](workpaper/). See the [application README](workpaper/README.md) for navigation and implementation details, the [project plan](PLAN.md), and the [approach and limitations](workpaper/submission/APPROACH.md).

## Run locally

```sh
cd workpaper
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

Open [localhost:3000](http://localhost:3000). Without Supabase credentials, development uses an ignored local event store. The default view is v3 as of June 23, 2026; later evidence is available through read-only replay.

## Connect to Vercel

Import `ChariPramod/MiraFlores` into Vercel with these settings:

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Root Directory | `workpaper` |
| Install command | `npm ci` |
| Build command | `npm run build` |

Apply all four SQL files under [`workpaper/supabase/migrations/`](workpaper/supabase/migrations/) in filename order. Configure these server-only environment variables in Vercel:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`; the new secret key takes precedence)
- `WORKSPACE_SESSION_SECRET` — a stable random secret of at least 32 bytes, for example generated with `openssl rand -hex 32`

Use [`workpaper/.env.example`](workpaper/.env.example) as the local template and save actual values only in an ignored `.env.local`. Publishable keys and JWKS URLs are not administrative credentials and are not required by this application. Vercel requires Supabase; the local-file fallback is development-only.

See the [deployment checklist](workpaper/submission/DEPLOYMENT.md) for migrations and hosted verification. A public application URL and live Supabase validation are still pending.

## Prototype scope

The core flow includes evidence navigation, four independent finding groups, N1 basis adjustments, role-based review, client questions, version comparison, supplied scenarios, replay, immutable simulated filing records, and offline exports. Full-return filing remains blocked; the filing demonstration is scoped to N1. Tax effects are labeled estimates, and production identity and real e-filing are not implemented.

The repository excludes local visitor history, credentials, the original assignment PDF, screenshots, and generated videos. The immutable fictional packet is packaged under [`workpaper/data/`](workpaper/data/). Submission notes and the walkthrough script are in [`workpaper/submission/`](workpaper/submission/).
