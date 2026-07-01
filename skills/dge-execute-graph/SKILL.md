---
name: dge-execute-graph
description: Drive the ready queue end to end - implement each ready node, gate it on evidence, and stop on the first failure.
argument-hint: "[optional graph path] [--max N] [--max-retries N]"
---

# DGE Execute Graph

Use this skill to autonomously execute a planned delivery graph one ready node at a time.

## Purpose

Walk the dependency-aware ready queue, implement each ready node with `/dge-work-node` discipline, and close it through the evidence-gated `dge done` gate. Completing a node can unblock its dependents, so the queue is re-queried after every node.

## Core rules

1. Execute exactly one node at a time, sequentially. Do not start a second node before the current one is `done` or `blocked`.
2. Never fabricate evidence or weaken a node's validation contract to make `dge done` pass.
3. Retry only **transient** failures; never retry **structural** ones (see "Failure classification"). Retrying a structural failure just loops or pressures you to weaken validation, which rule 2 forbids.
4. Stop on the first node that exhausts its retries or hits a structural failure. Transition it to `blocked` with `npx dge transition NODE-### blocked`, report the reason, and halt the loop.
5. Do not edit `graph.json` directly; move state only through the CLI.
6. After each `done`, re-query `npx dge next` because a completed node may have unblocked others.
7. Respect an optional `--max N` cap on how many nodes to execute per run, and a `--max-retries N` cap on transient retries per node (default 1). Always stop when the queue is dry.

## Failure classification

Classify every `dge done` / `dge evidence run` failure by the CLI error text before deciding whether to retry:

- **Transient (retry-eligible):** `Command failed with exit code N` or `Command failed to start` from `dge evidence run`. These come from the validation command itself — a flaky test, a race, a timing issue, or a real code defect you can fix. Re-attempt: fix the obvious cause or re-run the command, capture fresh evidence, and try `dge done` again, up to `--max-retries` (default 1).
- **Structural (never retry, stop immediately):** `Review blockers prevent done: ...`, `is missing validation evidence: ...`, or `cannot be done; incomplete dependencies: ...`. These require a human decision (resolve a blocker gap, add missing evidence the agent cannot produce, or finish an upstream node). Do not retry; mark the node `blocked` and halt.

A retry means re-doing the work/evidence step, not re-issuing the same failed `dge done` verbatim.

## Workflow

Repeat this loop until `next` is null or the `--max` cap is reached:

1. Run `npx dge next --json`.
   - If `next` is `null`, stop. Report completion using `ready_count`, `done_count`, and `remaining_count`.
   - Otherwise take the returned node id.
2. Announce the node. Apply the `/dge-work-node` rules: read the node, its requirements, and its validation contract; implement the smallest change that satisfies it; write `delivery-graph/evidence/NODE-###/summary.md`.
3. Capture validation evidence:
   - `npx dge evidence run NODE-### --satisfies "<contract item>" -- <validation command>`
   - Use `npx dge evidence playwright NODE-### ...` for browser or UX validation.
4. Close the node with `npx dge done NODE-###`.
   - On success, return to step 1.
   - On a **structural** failure, run `npx dge transition NODE-### blocked`, surface the CLI error and the review report path, and STOP.
   - On a **transient** failure, if the node has retries left (`--max-retries`, default 1): diagnose and fix the cause, re-run step 2-3 to produce fresh evidence, and try `dge done` again. If retries are exhausted, treat it as blocked: `npx dge transition NODE-### blocked`, report the last error, and STOP.

## Output

Report:

- nodes completed this run, in order, noting any that succeeded only after a retry
- the node that blocked, if any, with the exact `dge done` failure reason, whether it was transient or structural, and how many retries were spent
- remaining ready count and remaining not-done count
- recommended next command: `/dge-review`, `/dge-compound`, or re-run this skill after resolving the blocker

## CLI contract

When local tooling is available, use:

```bash
npx dge next --json
npx dge evidence run NODE-### --satisfies "..." -- <validation-command>
npx dge done NODE-###
npx dge transition NODE-### blocked
npx dge status --save
```

`dge next` selects the node; it never implements work. The agent implements each node, and `dge done` is the only path to completion. Do not mark a node `done` or `verified` by editing `graph.json`.
