# Hosted validation — October 17–18, 2026

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

## Completed filing and amendment walkthrough — October 18

A separate Chrome visitor sandbox completed the following flow against the hosted Supabase-backed application:

- Priya saved the N1 basis correction of 19,100 with D11/ev-0066 and verified its fingerprint. Working gain was 140; engine gain remained 19,240.
- Priya asked an in-app question, Ngozi answered through the narrower client view, and Priya recorded a review resolution. The response did not automatically change the return.
- Marcus received masked dependent identifiers on D06. Read-only replay exposed D71 at July 13 with masking, while the working clock stayed June 23. Version comparison and the supplied HVAC scenario rendered their separate baselines.
- Full-return readiness was assessed and remained blocked. The N1 demonstration package was frozen through event 6, then separately approved by Daniel (reviewer), Helen (partner), and Ngozi (exact-summary client approval).
- Helen recorded simulated federal acceptance and California rejection. The parent branch became frozen, and both immutable attempts remained visible.
- An amendment inherited the preserved N1 decision. A new note saved only in that child at sequence 8. Returning to the parent retained the original package hash, three approvals, and separate jurisdiction outcomes.

Preserved package: `snap_75ddcdeb-e71b-4dcb-98ce-0b1ad43a0898`.
SHA-256: `5f3e0d5a930e115d66a6a7081a2e14d3c7486c6dfe6119eb88c4c879886c04bd`.

## Downloaded package validation

The client and staff evidence HTML files downloaded successfully. Structural validation confirmed the package hash, event cutoff 6, six event IDs, packet hash, manifest hash, and all 72 included document hashes. All 75 local evidence links resolve. The files contain no scripts, forms, or external resources and declare a deny-network content policy. The noncash-contribution and Schedule C receipt topics are included; future D71/D72 are excluded.

These are authorized unmasked downloads made as Helen; the staff copy contains fictional identifiers. This check does not establish masked-export behavior. Exports preserve the package-creation cutoff and therefore exclude subsequent package approvals and filing attempts. The browser automation policy disallowed opening `file:` URLs, so this run verified offline structure and integrity without an offline browser rendering check.

## Remaining hosted acceptance

Shared-invitation behavior across browsers, concurrent production writes, and masked export delivery still need separate hosted checks. Full-return readiness remains blocked by the disclosed prototype scope. No real tax return was transmitted.
