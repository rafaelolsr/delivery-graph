---
name: dge-verify
description: Verify a Delivery Graph node against its validation contract and block completion until evidence exists.
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
5. Sync external tracker state after verification when a sync target exists.

## Workflow

1. Read the graph.
2. Locate the node.
3. Read the node evidence directory.
4. Check each required validation item.
5. Run missing local checks when possible.
6. Mark node `verified` when validation passes.
7. Mark node `done` only when review is not required, or after `/dge-review` passes.
8. Write a verification report under `delivery-graph/evidence/NODE-###/verification.md`.

## Output

Return:

- node id
- validation status
- passed checks
- missing evidence
- commands run
- updated status
- next required step

## CLI contract

When local tooling is available, use:

```bash
npx dge evidence run NODE-001 --satisfies "..." -- <validation-command>
npx dge evidence playwright NODE-001 --satisfies "..." --url http://localhost:3000 --script tests/e2e/app.spec.ts
npx dge done NODE-001
```

Use `npx dge evidence playwright ...` for browser flows, screenshots, traces, and UX checks. Use `npx dge evidence add ...` only for manual approvals or external evidence the agent cannot capture directly.

Use `npx dge verify NODE-001` when you only need to mark evidence verified without closing the node. Do not mark a node `verified` or `done` by editing `graph.json` directly.
