# Governed Adaptive Control Plane — M3–M8 proof

**`npm run check` exit 0 · 508/508 tests.** This is the demand-level proof for
Milestones 3–8 of the governed-adaptive-control-plane program. (M1–M2, the OKF
knowledge core, shipped earlier in this branch / PR #35.)

## What became adaptive

| Milestone | Module | Capability |
|-----------|--------|-----------|
| M3 | `src/governance/policy.mjs`, `gates.mjs` | Policy/authority engine + 7 gates (Intent, Spec, Allocation, Mutation, Task-Prove, Demand-Prove, Learning) |
| M4 | `src/governance/capability.mjs`, `org-store.mjs` | Capability profiles (unknown≠zero) + pluggable org-wide store (explicit path, privacy-safe, version-partitioned) |
| M5 | `src/governance/allocation.mjs` | Eligibility filter → risk-aware ranking → soft expectations → cold start |
| M6 | `src/governance/observation.mjs`, `mutation.mjs` | Observation + stall/marginal detection; versioned governed mutations with rollback |
| M7 | `src/governance/report.mjs` | Human governance report answering the 7 mandated questions |
| M8 | `tests/governance/golden-e2e.test.mjs` | Deterministic, offline end-to-end acceptance scenario |

## The golden scenario (deterministic, no paid live models)

`tests/governance/golden-e2e.test.mjs` walks the full lifecycle wiring every real
module together:

1. **Intent gate** passes a medium-risk code-change intent.
2. **Spec gate** admits an implementation task + an independent proof task.
3. **Allocation** picks the economical model (economy/medium-risk, history-based).
4. Execution **stalls** — three attempts, no new evidence.
5. **Observation** classifies STALLED; the governor recommends **switch model**.
6. It re-allocates to the **stronger** eligible model (reliability-first).
7. A discovered dependency requires **splitting** the task; the **mutation gate**
   confirms it is reversible + inside authority → auto-approved.
8. The graph is **versioned** (v0→v1) with a reconstructable transition record.
9. The executor produces evidence; an **independent verifier** Proves the task.
10. **Demand-Prove** confirms the *original Intent* (not merely all-tasks-done).
11. **Result** is emitted; **sanitized** performance history is admitted to the org
    store (raw prompt present in the caller's object is NOT persisted).
12. The **human report** explains the whole sequence.

Three negative acceptance cases also pass: a Result is blocked when the Intent is not
achieved; an unproven result is not admitted to learning; an ineligible cheaper
candidate is never selected.

## What remains human-controlled

- Expanding permissions/authority, modifying Intent, weakening acceptance criteria,
  removing proof, crossing a hard boundary, irreversible external actions — all require
  explicit human approval (a non-human self-expansion is **rejected**, not deferred).
- The governor proposes; a human authorizes anything outside delegated, reversible
  authority. An agent can never grant itself authority.

## Real defects the evidence gates caught (M3–M8)

1. **Reversibility default-deny** (M3): unknown reversibility reached AUTO_OK; hardened
   so reversibility must be affirmatively established.
2. **Nested privacy leak** (M4): forbidden raw content hidden inside an allowlisted key
   (or array) survived a top-level-only scan; fixed with deep scrub/scan.

## Organization-store privacy behavior

Aggregates shared by default; raw prompts/source/secrets/evidence content refused at
any depth. Location configured explicitly (no home-dir default). Partitioned by
org/project/repo/provider/model/version so a newer model version never inherits an
older one's history. Only the Learning gate's output is admitted.

## Reproduce

```bash
npm run check                                   # 508/508, exit 0
node --test tests/governance/golden-e2e.test.mjs
```
