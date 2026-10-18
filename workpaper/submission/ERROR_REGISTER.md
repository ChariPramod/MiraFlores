# Error register and implementation coverage

Source: root [PLAN.md](../../PLAN.md), sections G and the packet audit. The audit classified 18 discrepancies and six judgment-dependent or suspected items. These are not a claim about the assignment's undisclosed planted-error count. This register does not assert every audit observation has a working automated check.

**Implemented detection:** `src/lib/checks/run.ts` runs printed-field agreement, supplemental-basis matching, duplicate-interest reconciliation, page completeness, and a Brightpath positive control. The display catalog maps these evidence-derived findings to E01, E02, E03, and E10. E02 generates separate lot findings. The N1 adjustment workflow is implemented; a check's presence does not mean that a visitor has resolved it.

## Audit-confirmed discrepancies

| ID | Observation and evidence | Implemented behavior / next decision |
|---|---|---|
| E01 | D62 prints EIN `74-3829156`; `ev-1045` reads `74-3829516` at 0.97 confidence; `F2441.1b` inherits it. | Automated mismatch and evidence links. Identifier correction remains a reviewer action. |
| E02 | N1, N3, N4 use zero basis; D11 supports 19,100 / 19,100 / 9,420 (`ev-0066`, `ev-0068`, `ev-0070`). | Automated matching for all three. N1 basis adjustment, verification, approval, and undo demonstrated. Other lot resolution is not claimed. |
| E03 | The same 1,840 sweep interest appears in D28/D29 and `SchB.1.1`/`.1.2`. | Automated duplicate detection; no silent correction. |
| E04 | D23 pages 2/3 duplicate mileage; unique miles 8,100 versus engine 11,800. | Check backlog; inspect `ev-0315`, `ev-0404`. |
| E05 | Books already include 12,400 Paywell receipts, also added to `SchC.1`. | Check backlog; D15 p3, `ev-0109`, `ev-0110`, `ev-0127`. |
| E06 | Utilities deducted fully despite phone/internet business-use statements. | Check backlog; `call-01`, `ev-0101`, `ev-0095`, `SchC.25`. Reviewer must accept allocation percentages. |
| E07 | Personal Spotify remains in software expense. | Check backlog; `call-01`, `ev-0106`, `SchC.27a.1`. |
| E08 | Swedish interest uses 2024 rate 10.56 instead of supplied 2025 average 9.86. | Check backlog; `ev-0960`, `SchB.1.6`, `ref:fx.SEK.2025_average`. |
| E09 | Payoff interest 2,150 duplicates interest already included in Form 1098. | Check backlog; D55/D56, `ev-1029`, `ev-1032`, `SchA.8a`. |
| E10 | M18, proceeds 250 and basis 310, is absent from extraction and return. | Automated page/summary reconciliation; `doc:D31#page32`. No automatic missing-lot insertion. |
| E11 | California wages 111,300 conflict with paystub/move evidence of 22,469. | Check backlog; D73, `qa-45`, `ev-0047`, `ev-1081`. Confirm residency cutoff before treatment. |
| E12 | Federal estimated payments 13,000 conflict with agency record 12,000. | Check backlog; `F1040.26`, `qa-41`, `agency:/irs_account_transcript_2025/0`. Payment effect, not tax change. |
| E13 | A 3,500 payment designated for 2024 is counted as a 2025 California estimate. | Check backlog; `ev-1075`, `ev-1076`, `F540NR.72`, `agency:/ftb_account`. |
| E14 | Theo's organizer SSN differs from prior return/later card. | Check backlog; `household:theo`, `py:/return_2024/dependents/1`, `ev-1080`. Filing-identity matter; mask values in ordinary views. |
| E15 | Provider name on `F2441.1a` differs from D61. | Check backlog; provider-label consistency, no direct monetary adjustment. |
| E16 | Several California lines omit material calculation dependencies; `SchC.44b` cites odometer evidence for commuting. | Check backlog; `SchCA540NR.1.D`, `.2.D`, `.12.D`, `.17.D`. Do not trust incomplete lineage as executable truth. |
| E17 | `qa-31` denies known IRA basis, contrary to D42/prior Form 8606. | Check backlog; v3 already uses 7,000 basis. Do not apply a second tax correction. |
| E18 | `qa-14`/`qa-15` conflict with securities/crypto sales. | Check backlog; D28/D31/D34/D74. Clarification and completeness, not an independent tax delta. |

## Suspected or judgment-dependent items

None of these six has an implemented independent check or automatic resolution. Later messages must remain unavailable before their replay date.

| ID | Evidence / open question | Treatment boundary |
|---|---|---|
| E19 | Employer-plan eligibility may preclude the 14,400 self-employed health-insurance deduction (`qa-25`, D25, `Sch1.17`). | Confirm eligibility; supplied-rate estimate omits QBI interactions. |
| E20 | HVAC replacement treated as repair (D47, `call-01`, `SchE.14A`). | Supplied `hvac_improvement` scenario is exact only against original v3. |
| E21 | Donated vehicle uses 6,000 estimate rather than 2,900 proceeds (`qa-39`, `ev-1054`, `F8283.A1.vehicle`). | Reviewer must accept the applicable treatment. |
| E22 | Property-tax deduction omits seller credit 6,912 (`ev-1027`, `ev-1036`, `ev-1038`, `SchA.5b`). | Federal SALT threshold crossing prevents relying on a local zero-rate estimate. |
| E23 | C6 zero basis and transfer date may be wrong; later `msg-07` suggests 3,050 cost in March 2021. | Supporting bank evidence remains needed; date-gated judgment, not confirmed cost. |
| E24 | D64 receipt is ambiguous; `ev-1049` reads 1,500 at 0.41 confidence; later `msg-08` supports it. | Unresolved evidence is not a confirmed numeric error. |

## Positive controls and effect method

Brightpath's 260-lot reconciliation is implemented as a passing control. The packet audit also notes that D31's M6 wash sale, M9 basis, and M14 holding-period corrections are already incorporated in v2/v3. These must not become duplicate adjustments.

Where the application displays a tax effect, it applies the selected supplied version's rate to a single adjustment root and labels the result an estimate. Do not sum the audit catalog into a purported recomputed return. Payment reconciliation changes balance due separately from tax; post-move California allocation, SALT thresholds, and business/QBI interactions need distinct review. See PLAN.md for the original audit's numerical estimates and assumptions.

Separate unresolved coverage includes California AMT, excess SEP contribution, partnership outside basis, due diligence, contractor filings, FBAR responsibility, and the prior-year Form 3520 question. Neither a passing control nor a prepared filing demonstration resolves these matters.
