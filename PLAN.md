# Evidence-first tax workpaper — six-day build plan

## Summary

Build a workpaper organized around **claims that a reviewer can prove**: each amount connects to its source, calculation, verification, unresolved questions, and approval history. Present those connections as a readable evidence trail; use the graph underneath to identify affected work and reopen approvals when evidence changes.

**Decisions agreed:** six solo working days, depth on the evidence and review workflow, clearly labeled peripheral stubs, and separate persistent demo sandboxes with optional shared access.

**Recommended stack:** Next.js, TypeScript, PostgreSQL and private storage through Supabase, deployed on Vercel.

**Audit result:** 18 confirmed discrepancies and 6 suspected or judgment-dependent findings. These include financial, identity, provenance, and client-answer inconsistencies; they are not a claim about the assignment’s undisclosed count of planted errors.

Grounding: [the supplied JSON packet](workpaper/data/okafor_lindqvist_2025_packet.json) and the original case-study brief. The brief PDF is retained locally and excluded from the public source repository.

## A. Core idea

The central entity should be a **reviewable claim**, broader than a number. Claims include monetary amounts, taxpayer identity, document completeness, elections, and filing readiness. Every claim records what supports it, how it was derived, what remains uncertain, and who accepted it. The interface answers four questions: **Where did this come from? Is it supported? What changed? Can we proceed?**

Keep the proposed provenance graph, with three refinements:

- Separate **printed evidence**, **extracted interpretation**, **engine output**, and **reviewer decisions**. A confident extraction is not verified evidence.
- Separate calculation dependencies from contextual links. Related returns and discussion threads can form cycles; calculation dependencies and approval fingerprints need controlled traversal.
- Treat packet lineage as evidence to inspect, not a complete executable specification. For example, `SchCA540NR.1.D` includes the California addition numerically but omits `SchCA540NR.1.C` from its inputs.

Use a split-panel evidence trail rather than making users navigate a large node diagram.

## B. Data model and behavior

### Immutable source and persistent activity

Store the original packet byte-for-byte with its SHA-256 digest. Build disposable indexes over it; never “clean” the supplied JSON.

All business activity becomes an append-only event. Current state is the packet plus deterministic replay of those events. Sessions and projection caches may be mutable; evidence and business history may not.

| Entity | Purpose |
|---|---|
| Packet | Original bytes, parsed content, checksum, import metadata |
| Workspace | Independent visitor sandbox, membership, fictional firm settings |
| Branch | Working draft, scenario, replay, amendment, or next-year preparation |
| Claim | Version-scoped return line, extracted fact, identity fact, asset, or completeness assertion |
| Evidence and locator | Document page/field, questionnaire answer, message, prior record, agency record, or uploaded attachment |
| Relationship | Calculation input, supporting evidence, contradiction, duplication, supersession, or contextual link |
| Event | Attributed change to claims, workflow, evidence, or policy |
| Check result | Reproducible finding with rule version, inputs, evidence, and status |
| Snapshot | Frozen state, event cutoff, policy version, attachments, and integrity manifest |

Schema sketch:

```ts
type ClaimRef = {
  packetRef: string;       // Preserve the supplied reference verbatim
  engineVersion?: string; // Required for return lines and current assets
  branchId: string;
};

type Event = {
  id: string;
  workspaceId: string;
  branchId: string;
  sequence: number;
  actorId: string;         // Assigned by the server
  recordedAt: string;      // Actual timestamp
  effectiveAt: string;     // Scenario/replay timestamp
  type: EventType;
  targetRefs: ClaimRef[];
  evidenceRefs: string[];
  reason?: string;
  payload: unknown;       // Validated discriminated union
  idempotencyKey: string;
  batchId?: string;
  reversesEventId?: string;
};

type Signoff = {
  scopeRef: ClaimRef;
  level: "preparer" | "reviewer" | "partner";
  fingerprint: string;
  policyVersion: string;
};

type FrozenSnapshot = {
  branchId: string;
  eventSequence: number;
  packetHash: string;
  stateHash: string;
  manifest: unknown;
};
```

### Event contracts

Every event uses the common envelope above.

| Events | Required payload |
|---|---|
| `extraction_corrected`, `adjustment_recorded` | Original/effective value, unit, reason, supporting references; adjustment category and federal/California effect method |
| `verification_recorded` | Verification method, checked value/fingerprint, evidence references, conclusion |
| `evidence_attached`, `relationship_recorded` | Attachment hash/locator or relationship endpoints and type |
| `judgment_recorded`, `election_recorded` | Decision, alternatives, authority or packet reference, unresolved limitations |
| `note_created`, `note_resolved` | Text, visibility, blocking flag; resolution and evidence |
| `question_asked`, `answer_recorded` | Recipient, question, visibility; response and attachments |
| `assignment_changed`, `deadline_changed`, `status_changed` | Previous and new state |
| `signoff_recorded`, `approval_recorded` | Scope, exact reviewed fingerprint, actor and approval level |
| `document_disposition_recorded` | Used, supporting only, duplicate, superseded, irrelevant, pending, or unavailable; explanation |
| `sensitive_view_recorded` | Actor, resource, field categories, purpose and time; never copy sensitive values into the log |
| `filing_event_recorded`, `snapshot_created`, `branch_created` | Jurisdiction, attempt/status, snapshot or parent snapshot |
| `standard_changed`, `time_logged`, `last_seen_recorded` | Policy change, area/minutes, or review cursor |
| `event_reversed` | Original event, compensating change, reason |

### References, changes, and approvals

- Resolve every supplied grammar: extracted values, documents, questionnaire/messages/calls, JSON Pointers, assets, household members, parameters, exchange rates, timeline events, and version-scoped line keys.
- Follow prior-year line sources back to `D06`. Resolve narrative and agency placeholders through their structured records.
- Preserve unknown values as unknown. A blank basis must not silently become zero.
- Use decimal arithmetic; retain cents for sale lots and explicit units for ratios, dates, quantities, and money.
- Preserve original relationships. Added or corrected relationships carry their own provenance.
- Fingerprint material claim content, evidence hashes, calculation dependencies, judgments, and relevant policy. Viewing a document or adding an unrelated comment must not invalidate approval.
- Reopen verification and sign-offs when their signed fingerprint changes. Where engine dependencies are incomplete, conservatively invalidate the affected area.
- Allow simultaneous independent notes. Reject stale adjustments and sign-offs with a conflict response; never silently overwrite.
- Commit bulk operations atomically. Undo appends compensating events and cannot erase history or modify a frozen snapshot.

### Calculations and scenarios

Maintain three visibly distinct values: **supplied engine value**, **reviewed working value**, and **estimated tax effect**.

Recalculate supported local arithmetic, such as a lot’s proceeds minus supported basis. Do not rebuild the tax engine or pretend that updated intermediate values constitute a fully recomputed return.

Apply the supplied version-specific tax-effect rates to independent adjustment roots. Count each economic change once. Show payment changes separately from tax changes. Flag threshold crossings, business-adjustment/QBI interactions, and unavailable state-allocation effects.

The five supplied what-ifs remain exact **relative to their supplied v3 baseline**. Do not add them together or present their results as exact after unrelated adjustments.

### Filing and amendments

Freeze each simulated submission attempt. A rejection preserves that attempt and opens a successor draft. Acceptance pins the accepted snapshot separately for federal and California.

An amendment starts a child branch from the filed snapshot. Neither an amendment nor a later evidence upload changes what was filed.

## C. Architecture and stack

| Choice | Decision |
|---|---|
| Application | Next.js App Router, React, TypeScript |
| UI | Tailwind and accessible component primitives; domain-specific lists and detail panels |
| Validation | Zod schemas for imports, commands, and event payloads |
| Persistence | Supabase PostgreSQL; SQL migrations and parameterized queries |
| Attachments | Private Supabase Storage objects with content hashes |
| Deployment | Vercel application plus managed Supabase services |
| Collaboration | Two-second revision polling while active; fetch authorized changes after the last sequence |
| Testing | Vitest for domain behavior; Playwright for complete workflows |

Use one server-side data-access layer. Authenticate the session and authorize the selected persona on every read, mutation, attachment fetch, and export. UI restrictions alone are insufficient, as described in the [Next.js authorization guidance](https://nextjs.org/docs/app/guides/authentication).

Keep the database and packet inaccessible to browser clients directly. Use the managed connection pool appropriate for serverless requests, and private object access for evidence. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres), [storage access controls](https://supabase.com/docs/guides/storage/security/access-control).

**Demo access:** a visitor receives a persistent workspace and an opaque, secure session cookie. A high-entropy invitation link joins another browser to that workspace. The role switcher changes the server-held demo persona and is explicitly labeled as demonstration impersonation.

**Concurrency:** transactionally append events, enforce idempotency, and compare the target’s revision before applying edits. Polling provides actual shared state without adding a WebSocket subsystem.

**Alternatives rejected:**

- **FastAPI plus React:** reasonable for a Python-heavy product, but adds a second application boundary and duplicated interface work without a required Python inference service.
- **Next.js plus SQLite on a VPS:** compact deployment, but puts persistent-volume management, backups, and server operations on the solo builder.

No runtime LLM is required for correctness. An optional issue explainer may draft evidence-linked explanations, but it cannot verify facts, calculate tax, resolve findings, or approve work.

## D. Screens and primary flows

| Screen | Primary user | Contents and behavior |
|---|---|---|
| Return overview | Preparer, reviewer, partner | Federal/California summary, prior-year comparison, swing flags, area readiness, blockers, assignments, latest changes |
| Evidence trail | Preparer, reviewer | Selected claim → calculation → inputs → highlighted printed field; extracted and printed values side by side; reverse “used in” navigation |
| Checks and review inbox | Preparer, reviewer | Independent checks, engine diagnostics, questions, blocking notes, severity, owner, evidence, resolution |
| Document library | Preparer | All available documents, extraction status, page completeness, supersession/duplicates, usage and explicit disposition |
| Area workspace | Preparer, reviewer | Sales, assets, books-to-tax, rentals, K-1s/basis, retirement, foreign items, deductions, payments, state allocation |
| Change and scenario view | Preparer, partner | Original versus working amount, reason, references, estimated tax effects, affected approvals, version comparison and supplied what-ifs |
| Client portal | Client | Questions, responses, requested evidence, understandable summary, approval of a specific snapshot, authorization simulation |
| Filing and records | Reviewer, partner, quality reviewer | Extension, readiness gates, submission attempts, rejection correction, acceptance, client copy, amendment branches, notice package |
| Firm controls | Administrator | Standards, permissions, engagement status, budget display, sensitive-access log; editing/time entry according to tier |

Persistent controls: role switcher, branch/version selector, simulation date, search, and save/synchronization status.

**Large detail:** show exceptions first, then grouped summaries with expandable records. Support all 260 Brightpath lots, other brokerage sales, 12 crypto dispositions, and nine assets. Use virtualized lists where helpful; avoid spreadsheet-style arbitrary cell editing.

**Adjustment flow:** open a finding → inspect evidence → propose correction → inspect impact and affected approvals → save with reason → reviewer sees the change and reopened sign-off.

## E. Requirements coverage matrix

**MUST:** working in the submitted prototype. **SHOULD:** implement only after MUST acceptance passes. **STUB:** visible sample behavior with an explicit limitation. **SKIP:** disclosed as omitted.

The selected prioritization leaves some capabilities incomplete relative to the official brief’s “everything must work” language. The submission must state that accurately.

| Requirement | Implementation | Tier |
|---|---|---|
| Trace numbers to exact source; trace documents to use or non-use | Evidence trail, reverse index, document dispositions | MUST |
| Record verification method | Fingerprinted verification events | MUST |
| Link across return, prior years, related returns | Typed links; external related returns represented as references | MUST |
| Attach files, messages, notes as evidence | Private attachments and linked communication events | MUST |
| Show calculation construction | Rule explanation, supported arithmetic, visible gaps in engine lineage | MUST |
| Reconcile figures independently | Checks engine with reproducible evidence | MUST |
| Handle hundreds of transactions and assets | Grouped, exception-first detail views | MUST |
| Books to taxable income | Reconciliation bridge with supported adjustments | MUST |
| State split | Federal/California comparison, residency and source evidence | MUST |
| Preserve original, actor, reason, tax effect | Immutable baseline and adjustment ledger | MUST |
| Live changes and “since last looked” | Revision polling and per-person review cursors | MUST |
| Version comparison | v1/v2/v3 values and evidence changes | MUST |
| What-ifs | Five supplied alternatives against their original baseline | MUST |
| Bulk actions with undo | Bulk assignment/disposition and compensating events | MUST |
| Prior-year swings | Firm threshold: over 10% **and** over $1,000; explicit handling of zero baseline | MUST |
| Judgments, elections, due diligence, penalties | Structured decision records and blocking checklist | MUST |
| Document, area, and outside-filing completeness | Separate completeness registers and dispositions | MUST |
| Client/colleague questions become evidence | In-app threads linked to claims | MUST |
| Blocking review notes | Server-enforced readiness gates | MUST |
| Sign-offs reopen after changes | Material dependency fingerprints | MUST |
| Enforced roles and simultaneous users | Server authorization and shared workspace sessions | MUST |
| Assignments, deadlines, notifications | Persisted assignments and in-app notifications | MUST |
| Client approval | Approval pinned to the presented snapshot | MUST |
| Legally effective e-signature service | Labeled authorization simulation | STUB |
| Extension and filing workflow | Supplied extension data and simulated submission state machine | MUST |
| Actual e-file transmission | Scripted agency outcomes; no integration | STUB |
| Rejections and client copy | Preserved attempts, correction workflow, downloadable copy | MUST |
| Freeze at filing; amend on top | Immutable snapshots and amendment branches | MUST |
| Self-contained notice response record | Offline evidence package for the two examination topics | MUST |
| Carry forward with history | New-year branch with inherited records and unresolved items | SHOULD |
| Next-year planning | Supplied planning references with linked proposed actions | SHOULD |
| Firm-wide standards | Seeded policy enforced throughout workspace | MUST |
| Administrator edits to standards | Versioned policy editor | SHOULD |
| Sensitive-data protection and view logs | Server redaction and audited unmasking | MUST |
| Time versus budget | Seeded 22-hour area budget; actual time-entry workflow if time permits | SHOULD |
| Firm status and search | Current engagement status and authorized search | MUST |
| Return summary, computation, area summaries, document index | Overview and area workspaces | MUST |
| Asset method/life/bonus, federal/CA/AMT, disposal and recapture | Nine-asset history and disposition views; absent CA AMT explicit | MUST |
| Sales, books-to-tax, rentals/passive losses, K-1 lines | Specialized area records | MUST |
| Retirement/foreign, deductions/credit limits, payments, state split | Specialized area records | MUST |
| Carryovers, basis by year, prior preparer versus our changes | Historical evidence plus adjustment ledger | MUST |
| Automated retention destruction and full firm portfolio operations | Policy displayed; operational implementation omitted | SKIP |

## F. Independent checks and findings

Checks return `pass`, `fail`, `needs_review`, or `not_applicable`, with input references and a reproducible explanation. A diagnostic is an input to review, not proof that an independent check ran.

### Rules

| Check | Inputs and condition | Findings |
|---|---|---|
| Printed-field agreement | Compare the correct document/page/field with extraction; retain blanks and ambiguity | E01, E02, E24 |
| Identity and label consistency | Compare household/provider identity with source and prior records | E14, E15 |
| Duplicate economic item | Match issuer, account, year, transaction identity and supporting text; flag double recognition | E03–E05, E09 |
| Supplemental basis matching | Match security, acquisition/sale dates and quantity; flag missing support or unsupported zero basis | E02, E23 |
| Page and transaction completeness | Reconcile printed lots, extracted lots and return lots; classify every page | E10 |
| Source-treatment consistency | Compare working allocations/classifications with client evidence and documents | E06, E07, E11, E19–E22 |
| Currency/year consistency | Match currency and conversion purpose to supplied year-specific rate | E08 |
| Payment reconciliation | Match jurisdiction, tax year, date and amount; reconcile against the appropriate agency snapshot | E12, E13 |
| Lineage completeness | Verify references resolve, versions match, and declared computation dependencies explain the value | E16 |
| Client-answer contradictions | Compare answers with documents and history; request clarification without overwriting the answer | E17, E18 |
| Arithmetic and continuity | Foot lots, summaries, book bridges, assets, carryovers and basis rollforwards using independent routines | Positive controls and regression detection |
| Temporal and supersession checks | Prevent future evidence, superseded documents or old-version decisions being silently treated as current | Historical/replay controls |
| Filing readiness | Required steps complete, no open blocking notes, current approvals and correct authorization snapshot | Workflow gate |
| Outside-filing completeness | Identify FBAR, contractor forms, prior Form 3520 question and related-state-return dispositions | Open-item register |

Do not implement a generic “sum all inputs” evaluator: `R-SUM` also describes subtraction, and some dependencies are omitted. Use an explicit calculation registry for supported operations and identify incomplete explanations.

### Confirmed discrepancies

Effects below are isolated v3 estimates, rounded to dollars. Negative means lower tax; payment rows refer to balance due. Do not sum these into a purported corrected return.

| ID | Finding and evidence | Estimated federal / California effect |
|---|---|---|
| E01 | Childcare EIN transposed: `D62` prints `74-3829156`; `ev-1045` reads `74-3829516` at 0.97 confidence; propagated to `F2441.1b` | $0 / $0; identifier correction |
| E02 | RSU lots N1, N3 and N4 use zero basis despite `D11` supplying $19,100, $19,100 and $9,420. `ev-0498`, `ev-0516`, `ev-0525`; `ev-0066`, `ev-0068`, `ev-0070`; `F8949.B.N1`, `.B.N3`, `.E.N4` | Federal −$15,536 using ST/LT rates. CA −$2,445 for the two pre-move lots; post-move N4 effect not quantified |
| E03 | Same $1,840 sweep interest counted from `D28` and `D29`: `ev-0492`, `ev-0538`, `SchB.1.1`, `SchB.1.2` | −$640 / −$127; interest rates |
| E04 | Duplicate mileage page counted: `D23` pages 2 and 3; `ev-0315`, `ev-0404`. Unique miles 8,100, engine 11,800. Expense overstated $2,590 | +$919 / +$80; Schedule C profit rates |
| E05 | $12,400 Paywell receipts added to books although already included: `D15` page 3, `ev-0109`, `ev-0110`, `ev-0127`, `SchC.1` | −$4,402 / −$384; Schedule C profit rates |
| E06 | Utilities deducted at 100% despite 70% phone and 50% internet business-use statements: `call-01`, `ev-0101`, `ev-0095`, `SchC.25` | Candidate $1,308 expense reduction: +$464 / +$41; percentages require reviewer acceptance |
| E07 | Personal Spotify remains in software expense: `call-01`, `ev-0106`, `SchC.27a.1` | +$77 / +$7 on $216 profit increase |
| E08 | Swedish interest uses 2024 FX rate 10.56 instead of supplied 2025 average 9.86: `ev-0960`, `SchB.1.6`, `ref:fx.SEK.2025_average`. Rounded interest $1,747 → $1,871 | +$43 / +$9; interest rates |
| E09 | $2,150 payoff interest duplicated although already included in Form 1098: `D55`, `D56`, `ev-1029`, `ev-1032`, `SchA.8a` | +$559 / +$103; itemized rates |
| E10 | M18 omitted from extraction and return: `doc:D31#page32`, $250 proceeds, $310 basis. The $250 summary/detail gap identifies the missing page | −$21 federal; post-move California effect not quantified |
| E11 | California wage source conflicts with move/paystub evidence: `ev-0047` $111,300 versus `ev-1081` $22,469; `D73`, `qa-45`, `SchCA540NR.1.E` | Candidate −$88,831 CA-source adjustment: $0 / −$5,685; confirm residency cutoff before accepting |
| E12 | Federal estimates $13,000 versus agency $12,000: `F1040.26`, `qa-41`, `agency:/irs_account_transcript_2025/0` | Federal balance due +$1,000; tax unchanged |
| E13 | $3,500 designated for 2024 counted as 2025 CA estimate: `ev-1075`, `ev-1076`, `F540NR.72`, `agency:/ftb_account` | CA balance due +$3,500; do not remove the payment from its separate paid-year evidence |
| E14 | Theo’s organizer SSN differs from prior return and later card: `household:theo`, `py:/return_2024/dependents/1`, `ev-1080` | $0 / $0; filing identity blocker |
| E15 | `F2441.1a` labels the provider “Bright Oak Preschool”; `D61` says “Bright Oak Kids Club” | $0 / $0; display/identity consistency |
| E16 | Incomplete provenance in `SchCA540NR.1.D`, `.2.D`, `.12.D`, `.17.D`: addition/subtraction dependencies missing. `SchC.44b` also points to an odometer reading rather than a commuting assertion | No separate monetary effect; trace and invalidation defect |
| E17 | `qa-31` says no known prior IRA basis, contradicted by `D42` and `py:/return_2024/lines/F8606.14` | $0 correction to current engine: v3 already uses $7,000 basis correctly |
| E18 | `qa-14` and `qa-15` conflict with brokerage sales and crypto dispositions in `D28`, `D31`, `D34`, `D74` | No standalone tax adjustment; clarification and completeness issue |

For post-move sales, do not apply a rate that assumes residency-day proration as if it were an exact item-specific California effect.

### Suspected or judgment-dependent findings

| ID | Finding and evidence | Conditional effect |
|---|---|---|
| E19 | $14,400 self-employed health-insurance deduction conflicts with stated employer-plan eligibility: `qa-25`, `D25`, `Sch1.17` | If removed: +$4,464 federal / +$605 CA using adjustment rates; QBI interaction excluded |
| E20 | Full HVAC replacement treated as repair: `D47`, `call-01`, `SchE.14A` | Supplied `hvac_improvement` scenario: +$3,633 federal / +$896 CA against unadjusted v3 |
| E21 | Vehicle gift claimed at donor’s $6,000 estimate rather than $2,900 sale proceeds: `qa-39`, `ev-1054`, `F8283.A1.vehicle` | If deduction reduced $3,100: +$806 / +$149; reviewer must approve treatment |
| E22 | Home property-tax deduction ignores $6,912 seller credit: `ev-1027`, `ev-1036`, `ev-1038`, `SchA.5b` | CA rate estimate +$332. Federal effect cannot be trusted from the local zero SALT rate because the adjustment crosses the cap |
| E23 | Crypto C6 uses zero basis and transfer date. Later `msg-07` suggests $3,050 cost in March 2021: `ev-0918`, `ev-0919`, `F8949.H.C6` | If cost and holding period accepted: approximately −$1,312 federal / −$195 CA; supporting bank evidence still needed |
| E24 | `D64` receipt amount is ambiguous and verification incomplete; `ev-1049` is $1,500 at 0.41 confidence. Later `msg-08` supports that amount | $0 if $1,500 accepted; this is unresolved evidence, not a confirmed numeric error |

Each finding record must include status, affected versions, earliest evidence availability, evidence references, check ID, proposed correction, effect method, limitations, and resolution history.

### Positive controls and separate open items

Do not report these as current engine errors:

- All 260 Brightpath lots reconcile to their printed summaries.
- All 294 brokerage/crypto lot calculations in v3 agree with their cited extracted inputs; that does not prove those inputs are correct.
- All 106 prior-return line/source comparisons agree.
- The duplicate W-2 `D10` is correctly counted once.
- D31’s M6 wash adjustment, M9 basis, and M14 holding-period correction are incorporated in v2/v3.
- The S-corporation beginning basis changes from $8,200 to $2,300 after `D40`; v3 reflects the reconstructed history.
- Current IRA taxable conversion is $26 with prior basis included.
- Asset accumulated depreciation agrees with prior records and current additions.

Track separately: California AMT not computed; SEP contribution exceeding the current deduction by $2,786; partnership outside basis unknown; unfinished due diligence; contractor filings; FBAR responsibility; and the unresolved prior-year Form 3520 question.

## G. Simulated documents

Render the **printed content**, never a reconstruction from extracted values.

- Preserve document title, issuer, owner, tax year, page number, and original text.
- Build deterministic field anchors using document type, field label, lot identifier, and occurrence.
- Highlight the printed source and place the extracted interpretation beside it. E01 must visibly show the differing EINs.
- For missing extraction, highlight the printed transaction directly, such as M18 on page 32.
- If a field cannot be anchored reliably, show the page and an explicit “exact field not located” state. Do not fabricate precision.
- Label all pages as simulated source documents.

Define a renderer boundary:

```ts
type EvidenceLocator = {
  documentId: string;
  page: number;
  fieldKey?: string;
  textAnchor?: { start: number; end: number };
  rectangle?: { x0: number; y0: number; x1: number; y1: number };
};

interface DocumentRenderer {
  renderPage(documentId: string, page: number): unknown;
  highlight(locator: EvidenceLocator): unknown;
}
```

The initial implementation uses text anchors. A PDF renderer can later use the same document/page identities and measured coordinates. Synthetic packet positions must never be described as coordinates verified against a real PDF.

## H. Roles and permissions

| Persona | Allowed behavior |
|---|---|
| `st-01` preparer | Inspect evidence, propose adjustments, verify, ask questions, prepare areas |
| `st-04` preparer without clearance | Same preparation workflow, with sensitive fields redacted |
| `st-02` reviewer | Review, create/resolve review notes, sign eligible work, manage readiness |
| `st-03` partner | Partner approval, material judgment acceptance, simulated filing authorization |
| `st-05` administrator | Standards, assignments, budgets and access logs; no tax approval by administrative role alone |
| `st-06` quality reviewer | Review historical snapshots and add separate quality-review findings once active |
| `cu-01`, `cu-02` clients | Their questions, uploads, client-visible summaries and snapshot approval |

Enforce the firm’s separation-of-duties rule: nobody reviews or signs work they prepared. An adjustment exceeding $1,000 federal **or** state effect requires partner sign-off.

Sensitive-data controls apply to document text, search, notes, events, attachments, exports, and browser responses—not only masked labels. Unknown uploaded files default to restricted access until classified. Every authorized unmasked view is logged.

Clear cached client data on role changes. Enforce actor activation dates against the simulation clock. The public role switcher demonstrates authorization behavior; it does not constitute production identity verification.

## I. Timeline replay

Default to v3 as of **June 23, 2026**, regardless of the computer’s current date. Keep replay in a separate branch so it cannot overwrite a reviewer’s working draft.

| Milestone | Expected reaction |
|---|---|
| v1 and initial review | Show missing Ridgeline K-1, incomplete historical S-corporation basis, existing discrepancies |
| D31 corrected statement; v2 | Supersede D30, show three changed lot treatments and 63 changed line values; reopen affected review |
| March client call and D73 | Surface personal expense allocations, HVAC judgment, and wage-source conflict |
| April extension | Show supplied v2 estimate and $36,000 federal payment; preserve the estimate’s original basis |
| D43, D40, D37/D38; v3 | Reconcile new evidence, repaired basis and late K-1; show 89 changed line values |
| `msg-07`, `msg-08` | Add crypto and receipt follow-up evidence without retroactively making it available in v3 |
| Client approval | Pin approval and authorization simulation to the presented snapshot |
| Rejection and D71 | Preserve rejected attempt; surface Theo’s identity discrepancy; create correction draft |
| Federal/California acceptance | Pin separate accepted statuses and frozen record |
| Payment/refund | Resolve scripted amounts from the simulated filed snapshot; preserve agency placeholders as such |
| 2027 quality review/next year | Open historical record; enable quality reviewer and optional carry-forward |
| 2028 Letter 566 | Assemble noncash-charity and Schedule C receipts evidence into an offline package |

Replay must be idempotent. Seeking backward changes the replay branch/view, not the immutable event history.

Keep engine-version comparison read-only. When considering earlier adjustments against a new version, show overlap conflicts and require explicit reapplication.

## J. Six-day build schedule and acceptance tests

Assume approximately eight focused hours per day. Deploy on Day 1.

| Day | Work | Demoable acceptance |
|---|---|---|
| **1 — Packet and trace** | Immutable importer, typed reference resolver, server-only packet access, basic workspace, simulated document renderer, overview shell | Open `F1040.7`, follow to N1 and its printed basis field, and navigate back from the document. Reload from the public URL |
| **2 — Checks and completeness** | Independent checks, findings inbox, document dispositions, reverse usage, sales/asset detail, prior-year comparison | Catch EIN mismatch, omitted basis, duplicate interest and missing M18; show Brightpath passing |
| **3 — Persistent decisions** | Event reducer, adjustments, estimated impacts, verification, notes, sign-off fingerprints, bulk assignment and undo | Adjust N1 with evidence, preserve original, reopen approval, undo without deleting history |
| **4 — People and permissions** | Persona enforcement, complete redaction, client questions/answers, assignments, in-app notifications, shared workspace polling | Two browsers see changes; client cannot edit return; uncleared preparer receives no sensitive payload; self-review rejected |
| **5 — Filing and records** | Version comparison, replay, supplied what-ifs, readiness gate, frozen attempts, amendment branch, client/notice export | Open note blocks filing; accepted snapshot remains unchanged after amendment; exported notice package works offline |
| **6 — Submission quality** | End-to-end validation, accessibility/layout fixes, seeded walkthrough, one-page write-up, error register, AI disclosure, recording | Public-link walkthrough succeeds from a fresh browser with no local setup |

### Required test scenarios

- Import exactly 74 documents, 199 pages, 3,012 extracted values and the three supplied versions without changing source bytes.
- Resolve every supported reference kind; detect missing references and calculation cycles.
- Validate the exact confirmed discrepancies above and positive controls.
- Show original, printed, and working values correctly after correction.
- Prove source, relationship, judgment and policy changes invalidate relevant sign-offs; view logs do not.
- Reject stale edits; deduplicate retried commands; apply and undo a bulk operation atomically.
- Verify unauthorized reads, writes, searches, exports and file requests fail server-side.
- Search returned HTML/JSON for sensitive values while using `st-04`.
- Reload and redeploy without losing events, attachments or snapshots.
- Verify separate sandboxes remain isolated and invited browsers share only their intended workspace.
- Prevent future evidence from appearing in earlier replay stages.
- Preserve rejected and accepted snapshots through correction and amendment.
- Require fresh client approval after material changes to the approved package.
- Mark what-if results as tied to original v3; prevent unsupported exact recomputation claims.
- Open exported evidence offline and verify all included references resolve.
- Exercise long sales lists, document navigation and keyboard focus without rendering every page at once.

## K. Risks and cut lines

| Risk | Mitigation |
|---|---|
| Scope exceeds six solo days | Finish the trace → finding → adjustment → review → freeze loop before peripheral features |
| Incomplete lineage and unavailable engine recomputation | Preserve supplied values, add attributed dependencies, show estimated effects and unresolved calculation limits |
| Sensitive information or future evidence leaks through secondary views | Centralized server projections and authorization; test search, exports, attachments and replay—not just screens |

**Cut order:**

1. Optional AI explanations and visual graph exploration.
2. Editable firm standards, time entry, and additional firm dashboards.
3. New-year branch creation and interactive planning.
4. Presence indicators, elaborate notifications and presentation polish.

Keep persistence, reference integrity, evidence highlighting, independent checks, role enforcement, approval invalidation and immutable filing records.

Use labeled simulations for external signature and e-file services. Keep actual outbound communication out of scope.

Operationally, show save failures clearly, retain idempotent retry behavior, and log request IDs and command failures without sensitive payloads. Keep a database export and the seed packet available for restoring the demo.

## L. Submission and video outline

Deliver:

1. Public application URL.
2. One-page core idea and data-model explanation.
3. Error register with confirmed/suspected status, evidence, effect method and resolution.
4. Five-to-eight-minute video link.
5. AI-use disclosure explaining assistance with analysis, implementation and testing, and what was independently verified.

Target a seven-minute recording:

| Time | Story |
|---|---|
| 0:00–0:40 | Introduce the household, intended reviewer, and claim/evidence model |
| 0:40–1:30 | Catch the 97%-confidence EIN error; contrast extracted text with printed evidence |
| 1:30–2:40 | Trace capital gain to N1, expose missing RSU basis, and show reverse document usage |
| 2:40–3:40 | Record an adjustment with reason and estimated effect; show sign-off reopening |
| 3:40–4:30 | Switch roles, demonstrate masked access, and answer a client question that becomes evidence |
| 4:30–5:20 | Compare versions; show corrected documents and the late K-1 |
| 5:20–6:20 | Demonstrate filing gate, frozen snapshot, amendment branch and notice evidence export |
| 6:20–7:00 | Explain persistence, concurrency, engine limitations, scope cuts and AI usage |

Use an explicitly labeled prepared walkthrough workspace for later lifecycle scenes. Any preloaded decisions must be marked as demonstration fixtures, with supporting references; never present them as actions performed by real users.

## Appendix: verified packet inventory

### Structure and versions

- Packet size: **1,943,262 bytes**.
- **74 documents**, **199 pages**, **50 document types**.
- Extraction: **68 extracted**, **2 partial** (`D30`, `D31`), **4 not extracted** (`D07`, `D69`, `D70`, `D72`).
- **3,012 extracted values**.
- Confidence: **2,663 ≥0.99**, **17 from 0.95 to <0.99**, **330 from 0.90 to <0.95**, **2 below 0.90**.
- Low-confidence values: `ev-0919` crypto basis at **0.60**; `ev-1049` parish receipt at **0.41**.
- **45 questionnaire answers**, **10 messages**, **1 call note**, **29 timeline events**.
- Current return: **627 lines**, **nine assets**, **seven warning diagnostics**, **four informational diagnostics**.

| Version | Computed | Documents used | Lines | Declared/verified value changes | Federal tax | CA tax |
|---|---|---:|---:|---:|---:|---:|
| v1 | March 4, 2026 | 64 | 625 | Initial | $77,200 | $17,845 |
| v2 | March 19, 2026 | 65 | 625 | 63 / 63 | $77,470 | $17,999 |
| v3 | June 23, 2026 | 71 | 627 | 89 / 89 | $81,962 | $18,874 |

These are supplied engine outputs, not certified corrected totals.

### Documents by type

Repeated types: `1099-NEC` **5**; `1099-composite` and `1098` **4 each**; `identity_document`, `W-2`, `1099-INT`, `donation_receipt` **3 each**; `invoice`, `K-1-1120S`, `5498`, `dependent_care_statement`, `payment_confirmation`, `irs_notice` **2 each**.

The following 37 types occur once:

```text
engagement_letter, consent_7216, irs_ip_pin_notice, prior_year_return,
prior_workpaper, stock_plan_supplement, 3921, 3922,
books_profit_loss, books_transaction_detail, 1099-K, mileage_log,
client_note, insurance_statement, retirement_contribution, books_report,
1099-DA, transaction_export, foreign_bank_statement, K-1-1065,
K-1-state-supplement, 1099-R, 1099-SA, 5498-SA, rental_owner_statement,
property_tax_bill, rental_ledger, closing_statement_seller, 1099-S,
closing_statement_buyer, payoff_statement, property_tax_receipt,
1098-T, letter, 1098-C, irs_transcript, paystub
```

### Extracted values per document

```text
D01:3    D02:1    D03:1    D04:2    D05:2    D06:107  D07:0
D08:19   D09:17   D10:17   D11:9    D12:5    D13:6    D14:20
D15:6    D16:3    D17:3    D18:3    D19:3    D20:3    D21:14
D22:5    D23:335  D24:3    D25:1    D26:2    D27:2    D28:49
D29:1    D30:159  D31:159  D32:1    D33:1    D34:49   D35:52
D36:4    D37:7    D38:4    D39:8    D40:4    D41:4    D42:2
D43:2    D44:2    D45:1    D46:6    D47:2    D48:2    D49:2
D50:4    D51:9    D52:1    D53:1    D54:4    D55:3    D56:2
D57:4    D58:1    D59:3    D60:1    D61:2    D62:2    D63:2
D64:1    D65:4    D66:2    D67:6    D68:18   D69:0    D70:0
D71:1    D72:0    D73:2    D74:1826
```

### Open questions and chosen defaults

- **Deadline:** six working days is the planning assumption; no employer submission deadline was supplied.
- **Scope:** prioritize the agreed deep core and disclose remaining stubs.
- **Tax judgments:** use packet evidence and supplied scenarios; preserve unresolved treatment questions for reviewer decision without inventing law.
- **Simulation time:** current state is June 23, 2026; later packet records unlock through replay.
- **Hosting:** assume Vercel and Supabase accounts can be configured at implementation time; no paid-plan dependency is assumed.
- **File locations:** the actual packet and PDF are at the workspace root, not the `data/` and `docs/` paths mentioned in the pasted instructions.
- **Planning artifacts:** this plan is saved as root `PLAN.md`; the detailed findings are included in Section F and can also be saved as supporting `findings/errors.md` during implementation.

## Implementation checkpoint — October 17, 2026

The Day 4 authorization/collaboration layer and Day 5 core lifecycle are implemented locally in `workpaper/`:

- Signed workspace/persona/branch sessions; server permissions, redaction, audit logs, shared polling, client questions and restricted text attachments.
- Supplied-version comparisons, five baseline-bound what-ifs, and isolated timeline/evidence replay. Replay never changes the June 23 working session.
- Immutable review packages with evidence hashes, exact-summary approval, reviewer/partner separation, open-note and stale-content gates, simulated federal/California outcomes, successor drafts and amendments.
- Self-contained client/evidence HTML exports with frozen cutoffs, role checks, redaction and local reference anchors.
- Submission approach, coverage/error register, AI disclosure, walkthrough script and deployment instructions are saved under `workpaper/submission/`.

**Scope distinction:** the actionable submission demonstration covers the supported N1 basis correction. Full-return readiness remains blocked. E04–E09 and E11–E24, deeper specialist-area work, general binary uploads, verified production accounts and other disclosed completeness requirements remain unfinished. Existing four catalog groups and the Brightpath positive control are independently computed; no unresolved finding is silently marked fixed by the lifecycle demo.

**Hosting:** public deployment and live Supabase migration validation require configured projects. Local file persistence is development-only. Apply migrations 001–004 and use the documented environment configuration before hosting; never package `.data/` runtime records or secrets.
