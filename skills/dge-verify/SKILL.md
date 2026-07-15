---
name: dge-verify
description: Independently verify a Delivery Graph node against its validation contract and block completion until evidence and verifier independence exist.
argument-hint: "NODE-### [optional graph path]"
---

# DGE Verify

Use this skill when a node is ready to prove complete.

## Purpose

Gate node completion on validation evidence. Verification is a first-class workflow, not a summary.

## Core rules

1. A node cannot become `done` without evidence.
2. Required validation must match the node's validation contract.
3. Missing evidence is a blocker, not a warning.
4. Do not weaken validation to make a node pass.
5. Verification always runs in a fresh agent context separate from the builder run.
6. Give the verifier only the contract, implementation diff, and evidence — never the builder's reasoning or conclusion.
7. Standard-risk nodes may reuse the builder harness in a fresh run; high-risk nodes require a different harness and fail closed when none is available.
8. A verifier failure returns the node for bounded repair; it never counts as verified.
9. Sync external tracker state after verification when a sync target exists.

## Workflow

1. Read the graph and locate the node.
2. Determine verification risk with the agentic verification policy (`release` is high-risk by default; project policy may promote other nodes or types).
3. Select a verifier: prefer a different harness for standard risk and require one for high risk.
4. Start a fresh verifier run with only the contract, implementation diff, and evidence.
5. Check each required validation item and run missing local checks when possible.
6. On verifier failure, return the node for bounded repair; on verifier infrastructure failure, escalate rather than self-certifying.
7. Mark node `verified` only after the independent verifier passes.
8. Mark node `done` only when review is not required, or after `/dge-review` passes.
9. Write a verification report under the node's demand-scoped evidence directory.

## Output

Follow the shared output convention (see `skills/README.md`): lead the final
reply with a bold one-line synthesis (e.g. "NODE-### verified" or "NODE-### blocked
— missing evidence"), then the demand's progress indicator (see
`skills/README.md`), then the detail:

- node id
- validation status
- passed checks
- missing evidence
- commands run
- updated status

Then a `## Next` block with the next required step.

## CLI contract

When local tooling is available, use:

```bash
npx dge evidence run NODE-001 --satisfies "..." -- <validation-command>
npx dge evidence playwright NODE-001 --satisfies "..." --url http://localhost:3000 --script tests/e2e/app.spec.ts
npx dge done NODE-001
```

Use `npx dge evidence playwright ...` for browser flows, screenshots, traces, and UX checks. Use `npx dge evidence add ...` only for manual approvals or external evidence the agent cannot capture directly.

Use `npx dge verify NODE-001` when you only need to mark evidence verified without closing the node. Do not mark a node `verified` or `done` by editing `graph.json` directly.
