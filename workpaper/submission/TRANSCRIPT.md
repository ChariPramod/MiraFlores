# Pramod — submission walkthrough transcript

Speaking draft for [LIVE_WALKTHROUGH.mp4](LIVE_WALKTHROUGH.mp4): **994 spoken words**. Read the paragraphs aloud; bracketed cues are directions. The video is silent, assembled from sampled frames of actual browser interactions with idle time edited. It contains no recording of Pramod's voice. Scene times below follow the verified 7:50 edit. Short scenes have shorter spoken passages; practice the transitions before adding a voiceover. The capture used a fresh demonstration workspace at [mira-flores-workpaper.vercel.app](https://mira-flores-workpaper.vercel.app).

## 0:00 — Understanding the problem

[Overview `/`. The household and June 23 simulation date are visible.]

Hi, I'm Pramod. What interested me about this assignment was the question behind the numbers: if I were reviewing this return, could I explain where a value came from, whether I trusted it, and who had accepted it?

I understood the task as making those questions practical. An extracted value can look convincing and still be wrong. A correction can be reasonable and still need review. Once something is filed, its record needs to survive later changes.

I think the assignment tests judgment across that process: understanding unfamiliar data, finding inconsistencies, choosing useful abstractions, and building something people can inspect.

## 0:40 — Data and design

[Show the overview and evidence trail.]

The central entity is a reviewable claim: engine output, evidence, calculation, and decisions, with version context. I preserve the packet's original bytes and check their hash; indexes remain on the server.

The connection with my data-pipeline and tracing experience at DockWise and Pareto Labs is straightforward: follow an output through its inputs, then make that path useful to someone investigating a problem.

## 1:07.6 — Error hunt and positive control

[Findings `/findings` → E01 → D62; return to the Brightpath control.]

For the error hunt, I separated printed evidence from extracted interpretation. This EIN is a useful example: the extraction has ninety-seven percent confidence, but two digits disagree with the printed document. Confidence doesn't establish that the field is correct.

The implemented checks cover four catalog groups: the EIN mismatch, omitted supplemental basis, duplicate interest, and the missing M18 sale. Each finding carries its rule and evidence. Brightpath provides a passing control across two hundred and sixty lots.

The register contains twenty-four audit observations, distinct from automated coverage and issues requiring judgment. That list doesn't mean everything has been detected or resolved in software.

## 1:48.8 — Following N1 to its evidence

[Open N1 → D28 page 3, highlight `ev-0498` → return to the claim → D11, `ev-0066`.]

Let me follow one example through. The broker statement for N1 leaves basis unreported. The engine treats it as zero and reports a gain of nineteen thousand, two hundred and forty dollars.

The supplemental statement supplies nineteen thousand, one hundred dollars of adjusted basis. A blank on one document doesn't prove a zero economic cost.

The document view places the printed field beside the extraction. I can see where the evidence is used and return to the same claim and version. Checking the source becomes part of the workflow, rather than a separate search through documents.

## 2:30.2 — Adjustment and verification

[As Priya, save basis `19100` with `ev-0066`, then click “Mark verified (fingerprint)”. The capture continues into creating the client question.]

I'll record the basis with a reason and evidence, then verify it. The working gain becomes one hundred and forty dollars; the engine result stays visible.

Tax effects are labeled estimates using supplied rates. I haven't rebuilt the tax engine or claimed a completely recalculated return.

## 2:53.1 — Client collaboration and roles

[Create a question as Priya, answer it as Ngozi, then switch to Marcus and open the masked D06 document.]

Here, I ask the client a question and answer it through Ngozi's persona. An answer becomes evidence that staff can review; it doesn't silently change the return.

Marcus can work on the return but receives masked sensitive fields. These permissions are enforced on the server. Preparers cannot approve their own work, and a material effect can require partner approval. Authorized unmasked delivery is logged separately from business decisions.

The switcher makes the authorization behavior visible. It isn't production identity verification. The people and financial records in this case-study packet are fictional.

## 3:42.5 — Versions, replay, and scenarios

[Compare v2→v3. Seek replay from June 23 to July 13; open masked D71. Show the HVAC scenario.]

Version comparison shows changes in the supplied results. Replay asks what evidence was available at a particular time. D71 becomes available at the later milestone, while its sensitive content remains masked for Marcus.

Replay doesn't overwrite the working draft. Each supplied what-if also keeps its original version-three baseline. I don't combine those alternatives or present them as exact results after unrelated working adjustments. Preserving that context prevents a later answer from appearing to support an earlier decision.

## 4:27.3 — Scope and frozen package

[As Priya, resolve the client question. In `/filing`, show “Assess full-return readiness” blocked, then “Freeze N1 demonstration package”.]

After reviewing the client response, I close that conversation and assess readiness. Full-return submission remains blocked because broader tax work is incomplete.

The N1 package demonstrates a bounded lifecycle. Freezing it captures the working values, evidence, and event cutoff. This is the exact package the next people will review.

These decisions are append-only events in Supabase. Undo uses compensation rather than deleting history. Verification and approvals bind to the material state reviewed. The hosted checks also confirmed reload persistence and survival across a deployment; the displayed decision is more than temporary browser state.

## 5:07.4 — Separate approvals

[Daniel: “Record reviewer approval”; Helen: “Record partner approval”; Ngozi: “Approve this exact summary”. Return to Helen.]

Daniel approves as reviewer, Helen as partner, and Ngozi approves the displayed client summary. The approvals attach to the package content. They aren't permanent checkboxes on the engagement.

If the material content changes, that earlier approval doesn't automatically cover the new package. Keeping that boundary explicit matters as much as recording the correction itself.

The client sees the original and working amounts, the included adjustments, and the limitations. Their approval is tied to that displayed summary. It shouldn't be treated as consent to an unspecified future version of the work.

## 5:49.9 — Separate simulated outcomes

[As Helen, record Federal Accepted, then California Rejected. Show both preserved attempts.]

I'll record a simulated federal acceptance and a California rejection. Nothing is transmitted to an agency. The outcomes are separate and remain visible, with their preserved package. The submitted branch is frozen, and the California rejection remains unresolved in this demonstration.

I chose different results to show why a single overall status would be misleading. Federal acceptance doesn’t establish California acceptance. A correction needs its own continuation and review, while the rejected attempt remains part of the record.

## 6:28.0 — Amendment without rewriting history

[Create an amendment, select it, save a review note on the child N1 claim, then return to the main branch.]

I can now create an amendment branch from the preserved package. Here I'm adding a review note in the child, without changing the parent's financial values or history.

Back on the main branch, the original package hash and both jurisdiction outcomes are unchanged. The amendment gives us somewhere to continue work without rewriting what was previously approved and submitted in the simulation.

## 7:05.4 — Frozen exports

[Download the parent client copy and staff evidence HTML. Do not imply an offline browser rendering occurred.]

These authorized staff exports are unmasked. They preserve the earlier freeze cutoff, so later approvals and filing attempts stay in application history. Local links and hashes were checked structurally.

## 7:18.9 — Scope and AI assistance

[Return to Overview.]

I focused on the path from evidence through a reviewed decision to a preserved record. Broader tax coverage, production identity, and general uploads remain unfinished.

I used Codex for analysis, implementation, debugging, documentation, and testing. The application uses deterministic checks. Agent-operated validation is distinct from independent professional tax review.

I wanted a reviewer to inspect the evidence, understand a change, and know exactly which version was approved.
