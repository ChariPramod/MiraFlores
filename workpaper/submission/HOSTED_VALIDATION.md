# Hosted validation — October 17, 2026

Application: https://mira-flores-workpaper.vercel.app

Initial deployed revision checked: `0d9fcd1cf23214f1c3899ffdde891e7f50fe48eb`. GitHub reported Vercel success. A new visitor sandbox was used for the checks below; no existing visitor decisions were edited.

## Observed results

- Overview and N1 evidence render; Collaboration identifies storage as Supabase.
- N1 basis 19,100 saves with D11/ev-0066 support, producing working gain 140 while retaining engine gain 19,240. A full reload retains the decision and event sequence.
- Preparer verification and Daniel's reviewer sign-off persist. Undo restores engine values, invalidates verification, and reopens the approval with a compensating event.
- D28 page 3 resolves the blank-basis anchor and retains the v3 return-to-claim link.
- Findings render E01/E02/E03/E10 plus the Brightpath 260-lot positive control.
- Version comparison reports 89 changed lines for v2→v3.
- D71 is unavailable at the June 23 simulation clock.
- The client persona is redirected away from an internal claim route to permitted collaboration.
- A prepared N1 review package saves to Supabase and displays the correct evidence, values, hash, and outstanding reviewer/partner/client approval gates.

## Issue found and source fix

A fresh session navigating Overview → D06 page 1 returned HTTP 500; initializing the same kind of session through N1 before opening D06 returned HTTP 200. The sensitive-access audit referenced a workspace that did not yet exist.

Sensitive delivery now ensures the signed session's workspace exists before inserting the audit record. Both workspace and audit failures continue to block unmasked delivery. Four new regression tests cover fresh and repeat visits, initialization failure, audit failure, and uncleared redaction. The targeted 19 tests, typecheck, lint, configured production build, and packaging check pass. Vercel reported the fix deployed successfully at revision `2738006f837426e0fada14742017f3b5d5f8bad0`. Fresh Overview → D06 page 1 and fresh direct D06 page 1 then both returned HTTP 200 with the actual rendered document and no error fallback.

## Persistence and isolation after deployment

The existing browser session retained its workspace, N1 basis 19,100, working gain 140, and frozen review package with the identical hash after the fix deployed. An independent fresh session showed the original N1 gain 19,240, no adjustment, and sequence 0. This verifies independent visitor state and survival of this deployment; shared invitations and concurrent hosted writes still need separate checks.

## Remaining hosted acceptance

These checks do not establish shared-invitation behavior across browsers, concurrent production writes, or a completed hosted simulated submission/amendment and offline-export cycle. Full-return readiness remains blocked by the disclosed prototype scope. No real tax return was transmitted.
