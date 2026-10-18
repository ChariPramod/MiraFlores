# Seven-minute live walkthrough script

This is a recording script, not a recorded demonstration. Start at the actual application URL; the local preview is `http://localhost:3000`. Replace it with the verified public URL before recording the submitted walkthrough.

A separate 100-second captioned video is available from actual UI screenshots. It has no narration or live interaction and is labeled as a screenshot preview. `submission/WALKTHROUGH.mp4` was rendered with `./scripts/render-walkthrough.sh`; its encoding, decoded duration and representative frames have been checked. The script below remains the plan for the longer narrated live demonstration.

## Prepare before recording

Use a dedicated demonstration workspace. Keep at least one separate browser for a fixed-persona invitation; an unrelated fresh browser should retain its own workspace. Do not show invitation codes or full sensitive identifiers in the recording. Label any previously completed decisions as demonstration preparation. Do not imply that they were performed by real staff or a client.

For the later filing scene, use a visibly labeled **prepared N1 lifecycle demonstration**. It requires the actual 19,100 basis adjustment supported by `ev-0066`, a current verification, all review notes resolved, and the separate reviewer/partner/client approvals of the exact frozen package. Full-return readiness remains blocked by unresolved checks and incomplete tax work.

## Recording sequence

| Time | Navigation and action | What to explain |
|---|---|---|
| 0:00–0:35 | Open `/`. Point to household, v3, June 23 simulation date, and workspace identity. | The organizing unit is a claim with evidence and review history. The supplied packet is immutable; today's computer date does not unlock future evidence. |
| 0:35–1:15 | Open `/findings`; select E01 and follow its source to D62. | Printed `74-3829156` differs from extracted `74-3829516` despite 97% confidence. The finding is derived from evidence. Briefly contrast Brightpath's passing 260-lot control. |
| 1:15–2:10 | Open `/claim/F1040.7?version=v3`, follow N1, then D28 page 3's `ev-0498` highlight. Return using “Back to claim”; inspect D11 supplemental basis. | Broker basis is blank; extracted/engine zero is not printed proof of zero basis. D11 supports 19,100. Version and originating claim stay attached to navigation. |
| 2:10–3:10 | On `/claim/F8949.B.N1?version=v3`, save basis 19,100 with reason and `ev-0066`. Record verification. Show working gain 140, original engine gain 19,240, and labeled tax-effect estimate. Use `/collaboration` to change to Daniel for review; return to the claim. Demonstrate a material change/undo reopening approval. | Append-only history preserves the source and every decision. Undo restores the preceding surviving value. A view or unrelated note does not certify evidence or recompute the whole return. |
| 3:10–4:00 | On `/collaboration`, switch to Marcus (`st-04`), inspect masked evidence, then use a prepared question/client answer in the client persona. Return to the claim's answer-evidence selector. | Permissions apply on the server. Clients answer only addressed questions; attachments remain restricted. Separate browser polling shows shared decisions only after joining the intended workspace. The role switcher is a demo identity mechanism. |
| 4:00–4:50 | Open `/versions?from=v1&to=v2`, then v2→v3. Open `/replay?at=tl-17`, seek to `tl-22`, and open D71 through its replay evidence link. Briefly show `/scenarios?scenario=hvac_improvement`. | Versions show supplied changes; old adjustments are not silently reapplied. Replay is read-only. D71 is the later Social Security card, while the corrected K-1 belongs to the earlier v3 evidence. Each supplied scenario is tied to original v3 and excludes current working adjustments. |
| 4:50–6:20 | Open `/filing`. Show an open review note blocking submission and the full-return coverage blocker. Resolve the note in the prepared N1 demo; freeze the package, inspect approval requirements, and show exact-package reviewer/partner/client approval. Simulate acceptance separately for federal/California as desired. Create an amendment branch; compare original snapshot hashes and download its client/notice exports. | A prepared N1 demonstration is not full-return approval. Agency results are simulated. Each attempt is frozen; amendment changes occur in a child branch. Open the notice export offline and follow its noncash-gift and Schedule C receipts links. Evidence and decisions are pinned to the original cutoff. |
| 6:20–7:00 | Return to `/` and briefly show the submission documents. | State what is complete and what remains: four implemented check groups, broader audit backlog, no full tax recompute, limited text attachments, demonstration identity/e-file. Explain AI assistance and actual validation. Give the verified public URL only if deployment succeeded. |

## Navigation notes

- Use the persistent header links for Overview, Findings, Documents, Sales, Assets, Prior year, Collaboration, Versions, Replay, Scenarios, and Filing as available in the build. “Back to claim” is the fastest way to retain context after opening a document.
- Change persona in **Collaboration**, then navigate back to the relevant screen. The baseline preparer cannot sign their own work. Helen supplies partner approval where required.
- Replay evidence remains under `/replay/evidence?at=<milestone>&ref=<reference>&page=<page>`; ordinary document routes continue to enforce the working date.
- The filing screen supplies snapshot-specific download links: `/api/exports/<snapshotId>?kind=client&branch=<branchId>` or `kind=notice`. Clients receive only the summary; staff notice exports include authorized evidence and the frozen manifest.
- Pause if a save fails or an approval is stale. Show the actual state, reload if appropriate, and avoid narrating a successful transition that did not occur.

After recording, open the video and verify its sound, readable text, length, and public-link access. Save its actual URL in [DEPLOYMENT.md](DEPLOYMENT.md); no upload or external message is part of this script.

## Generated preview video

`WALKTHROUGH.mp4` is a verified 100-second H.264 captioned tour built from five actual local preview screenshots (1600×1000, 24 fps). It has no narration and is not a recording of live clicks. It covers overview, N1 evidence and working values, findings, isolated replay, and the N1 filing simulation. The longer live script above remains available for a personal narrated recording. Regenerate with `scripts/render-walkthrough.sh`; macOS may require permission for the local video encoder.
