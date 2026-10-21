---
name: dge-work-node
description: Execute one ready Delivery Graph node while preserving its validation contract and dependency boundaries.
argument-hint: "NODE-### [optional graph path]"
---

# DGE Work Node

Use this skill to implement one ready atomic node.

## Purpose

Execute only the selected node's scope, then produce evidence for `/dge-verify`.

## Multi-node offer (run once, before any work)

Before implementing, check whether the demand still has more than one ready node:

```bash
npx dge next --json   # inspect ready_count
```

- If `ready_count <= 1`, skip this section and proceed to the single-node Workflow.
- If `ready_count > 1`, the user is facing a multi-task demand. **Do not silently
  start one node and hand back a "Next" prompt per task.** Offer the fork exactly
  once:

  > This demand has **N ready nodes**. Do you want to:
  > 1. **Follow along** — I implement one node, report, and stop (you drive each).
  > 2. **Run all autonomously** — I execute the whole ready queue end to end,
  >    evidence-gated, stopping only on failure or a genuine judgment call.

  - **Follow along** → continue with the single-node Workflow below (current behavior).
  - **Run all autonomously** → hand off to the `/dge-execute-graph` loop in **quiet
    mode**: one compact completion line per node, re-render `npx dge status` after
    each transition, loud only on failure/ambiguity. Do not re-implement that loop
    here — delegate to it so the evidence and independent-verification gates stay
    identical. Stop offering; the fork is asked at most once per invocation.

This offer is a **procedure** choice (which run mode), not a judgment call, so a
one-time question is allowed. It never decides whether an outcome is acceptable —
both modes keep every evidence and verification gate intact.

## Core rules

1. Work on exactly one node unless the user chooses "run all" in the multi-node
   offer above, or explicitly asks for a batch. In "run all", delegate to
   `/dge-execute-graph` rather than looping here.
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
validation, then a `## Next` block: `/dge-verify NODE-###`. If ready nodes remain
after this one, also offer `/dge-execute-graph` to finish the rest autonomously, so
the user is never forced to re-enter a node id per task.

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
