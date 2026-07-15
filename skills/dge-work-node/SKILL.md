---
name: dge-work-node
description: Execute one ready Delivery Graph node while preserving its validation contract and dependency boundaries.
argument-hint: "NODE-### [optional graph path]"
---

# DGE Work Node

Use this skill to implement one ready atomic node.

## Purpose

Execute only the selected node's scope, then produce evidence for `/dge-verify`.

## Core rules

1. Work on exactly one node unless the user explicitly asks for a batch.
2. Do not start a node whose dependencies are not complete.
3. Keep the node's validation contract visible throughout execution.
4. Do not mark the node done; `/dge-verify` owns completion.
5. Update graph status to `in_progress` when work starts and `review` when implementation is ready for verification.
6. This skill is a fixed procedure, not a starting point for extra self-invented
   review, hardening, or validation rounds. If you find yourself about to add a
   step that is not listed under Workflow below, stop — it belongs in a follow-up
   suggestion (step 9) or in `/dge-review` / `/dge-verify`, not here.

## Workflow

1. Read `delivery-graph/graph.json`.
2. Locate the requested node.
3. Check dependencies.
4. Read linked requirements and validation contract.
5. Implement the smallest change that satisfies the node's validation contract —
   nothing else. Do not add refactors, hardening, "while I'm in here" fixes, or
   other DX/contract improvements beyond what the contract requires, even if they
   are cheap or clearly beneficial. If you notice an adjacent improvement
   opportunity, do not implement it — note it as a follow-up suggestion in step 9
   instead.
6. Run each check named in the node's validation contract items, exactly once per
   check. "Focused validation" means only those checks — not the repository's full
   test/build baseline, not a broader sanity sweep, and not a second pass "just to
   be sure." Re-running a check in the same node execution is only valid if you
   changed code in between (e.g. a check failed, you fixed the cause, you run that
   check again); re-running a check that already passed, with no intervening code
   change, is not part of this workflow.
7. Save evidence under `delivery-graph/evidence/NODE-###/`.
8. Update node status to `review`.
9. Report changed files, evidence paths, and remaining validation. If you noticed
   adjacent improvement opportunities while implementing (step 5), list them here
   as suggested follow-ups — do not implement them in this run.

## Stop condition

Once step 7 (evidence saved) and step 8 (status set to `review`) are done, this
skill's work is complete. Do not add another review pass, another validation round,
or additional unrequested changes after this point — even if you think of something
that seems worth checking. Further review of this node's changes happens in
`/dge-review` or `/dge-verify`, invoked separately by the user or by the calling
skill. Report and stop.

## Output

Follow the shared output convention (see `skills/README.md`): lead the final
reply with a bold one-line synthesis (e.g. "NODE-### implemented, evidence
captured, ready for verify"), then the demand's progress indicator (see
`skills/README.md`), then changed files, evidence paths, and remaining
validation, then a `## Next` block: `/dge-verify NODE-###`.

## Evidence format

At minimum, create:

- `delivery-graph/evidence/NODE-###/summary.md`

Include:

- node id
- commands run
- results
- changed files
- links to PR/checks, if available
- known limitations
