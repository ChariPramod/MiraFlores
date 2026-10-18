# Walkthrough delivery guide

Application: [mira-flores-workpaper.vercel.app](https://mira-flores-workpaper.vercel.app). Speaking draft: [TRANSCRIPT.md](TRANSCRIPT.md). Hosted outcomes and limits: [HOSTED_VALIDATION.md](HOSTED_VALIDATION.md).

## Main submission recording

The main click-through uses sampled frames captured during actual interactions with the hosted application in a fresh demonstration workspace. Idle time is edited out. This is an agent-operated browser demonstration, not a continuous native screen recording. It is silent: Pramod's voice and generated narration are both absent. The separate first-person transcript is provided for Pramod to review, personalize, and speak while presenting or recording a voiceover.

The main output is [LIVE_WALKTHROUGH.mp4](LIVE_WALKTHROUGH.mp4), verified at **7 minutes 50 seconds**, 1512×862 pixels, 54,857,940 bytes, and zero audio tracks. Five decoded frames were visually checked for readability. The source manifest is `artifacts/live-capture/manifest.json`, containing 381 frames; all remain in their original order. Twenty-seven long idle gaps were shortened and explicit holds retain actual frames. Capture was sampled at a variable rate; the encoded frame rate does not imply continuous native capture. Do not substitute the older screenshot-tour file for this click-through.

| Start | Scene |
|---|---|
| 0:00 | Introduction |
| 0:40 | Evidence and packet |
| 1:07.6 | Findings and positive control |
| 1:48.8 | N1 printed and supplemental evidence |
| 2:30.2 | Adjustment and verification |
| 2:53.1 | Roles and collaboration |
| 3:42.5 | Versions, replay, and what-ifs |
| 4:27.3 | Readiness and package freeze |
| 5:07.4 | Separate approvals |
| 5:49.9 | Federal/California outcomes |
| 6:28.0 | Amendment and original record |
| 7:05.4 | Frozen exports |
| 7:18.9 | Closing scope and AI disclosure |

The markers can slightly precede the corresponding action. The adjustment and export scenes are short; their transcript passages have been shortened accordingly.

## Scenes actually captured

1. **Problem and data:** Overview, the June 23 simulation clock, and the evidence trail.
2. **Independent checks:** the E01 EIN mismatch in D62 and the Brightpath 260-lot passing control. Implemented catalog coverage remains E01/E02/E03/E10.
3. **N1 evidence:** D28's printed blank basis, D11/`ev-0066`, basis adjustment 19,100, and fingerprinted verification. Working gain becomes 140 while the engine's 19,240 remains visible.
4. **Collaboration and roles:** a question as Priya, response as Ngozi, then Marcus's masked D06 document.
5. **Version and date context:** v2→v3 comparison, June 23 versus July 13 replay with masked D71, and the supplied HVAC scenario against original v3.
6. **Readiness and approvals:** Priya resolves the client conversation; full-return readiness is blocked; the N1 demonstration package is frozen; Daniel, Helen, and Ngozi approve separately as reviewer, partner, and client.
7. **Simulated outcomes:** Helen records federal acceptance and California rejection as separate preserved attempts. No real return is transmitted.
8. **Amendment:** a child branch is created and receives a review note. Returning to the main branch shows the original package hash and both jurisdiction outcomes unchanged. The California rejection remains unresolved.
9. **Exports and closing:** client and staff evidence HTML are downloaded, followed by Overview and the scope/AI-use conclusion.

The capture does **not** demonstrate creation of a blocking review note, undo, two-browser invitation collaboration, or an offline browser rendering of the exported HTML. Some of those behaviors have separate automated or hosted checks; consult the validation record instead of describing them as shown in this recording.

## Preserved package and export meaning

The demonstration package is `snap_75ddcdeb-e71b-4dcb-98ce-0b1ad43a0898`, with content hash `5f3e0d5a930e115d66a6a7081a2e14d3c7486c6dfe6119eb88c4c879886c04bd` and frozen event cutoff **6**. The amendment note belongs to the child branch only.

The downloaded HTML preserves that freeze cutoff. It includes the pre-freeze workpaper evidence and decisions, **not** the later package approvals or filing attempts. Those later records remain in application history. Full-return readiness remains blocked; acceptance in this video concerns the explicitly bounded N1 simulation.

The exports were downloaded as Helen and are authorized **unmasked** copies containing fictional packet identifiers. They are not examples of Marcus's masked export. Structural validation checked packet/manifest integrity, 72 document hashes, 75 local reference links, no external scripts/assets, and exclusion of D71/D72 from the earlier cutoff. Evidence includes `SchA.12`, `SchC.1`, D15, `ev-1054`, and `ev-0066`. Offline browser rendering was not performed, so no caption or narration should claim an offline visual walkthrough succeeded.

## Speaking and sharing

Use the transcript as a speaking draft, not as a claim that Pramod personally operated the recorded browser. Its DockWise/Pareto Labs connection is restricted to the supplied data-pipeline and tracing experience, with no invented project details or metrics. Check the final scene timestamps, practice at a comfortable pace, and add personal narration only after reviewing the claims.

Share the live application link, final click-through video, one-page approach, error register, and AI disclosure. A locally generated video is not an externally hosted video URL; record the real destination only after upload and access verification.

## Older preview artifact

`WALKTHROUGH.mp4` remains a separate 100-second captioned tour made from five local preview screenshots, at 1600×1000 and 24 fps. It has no narration and shows no live interaction. It is a historical preview, not the main hosted click-through. Its renderer is `scripts/render-walkthrough.sh`.
