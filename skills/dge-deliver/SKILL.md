---
name: dge-deliver
description: Drive a raw demand all the way to done from a single command - intake, plan, and evidence-gated execution - stopping only at two judgment gates and on genuine failure or ambiguity.
argument-hint: "[raw demand, issue link, feature idea, or an in-progress DEM-### to resume]"
---

# DGE Deliver

The **intent-driven** entry point to Delivery Graph Engineering. The user supplies
**intent and judgment**; the conductor owns **procedure**. After this single command,
the user never types another `dge-*` skill name to reach `done`.

This skill does not replace the nine `dge-*` skills — it **sequences** them and carries
context across phases. The individual skills remain available for power users.

## The posture (why this skill exists)

Every delivery tool — and DGE until now — is a command palette: the user remembers
what to run next, the skill names, and the order. `/dge-deliver` removes that burden.
The design rule, held throughout:

> **Automate every decision about _which skill runs_. Automate _zero_ decisions about
> _whether the outcome is acceptable_.**

So the conductor auto-advances between phases (procedure) but **stops at exactly two
judgment gates** and surfaces genuine failure/ambiguity (judgment). It never asks
"shall I run the next skill?".

## Core rules

1. **One entry verb.** After `/dge-deliver`, the user is never asked to invoke another
   `dge-*` skill. The conductor runs intake → brief → plan → graph → execute → summary.
2. **Two judgment gates, and only two.** Gate 1 = the Demand Brief (after intake).
   Gate 2 = the Graph Brief with the dependency tree + per-node change/validation summary
   (after planning); `--mermaid` adds the DAG diagram for large graphs in a rendering surface.
   Gate 2 is **always required** — never auto-skip it.
3. **The user owns the gates.** The conductor never self-approves a gate. The only way
   past a gate is explicit user approval.
4. **CLI is the only writer.** Every graph change — including gate edits — goes through
   the `dge` CLI. Never hand-edit `graph.json` or a brief's markdown.
5. **The evidence gate is sacred.** Execution never weakens a validation contract or
   fabricates evidence to keep the loop flowing. `done` requires real evidence, always.
6. **Silent on success, loud on failure/ambiguity.** During execution, clean nodes flow
   without narration; only failure (stop) and ambiguity (pause-once) surface.

## Preflight

Run the shared preflight before anything else (intake runs before `dge init`, so skip
the graph check on a brand-new demand):

```bash
dge preflight --no-graph || npx --no-install dge preflight --no-graph
```

If it exits non-zero, **stop** and tell the user to install the DGE CLI first:

> **DGE CLI not found.** The `dge` CLI is a separate npm package from the `/dge-*`
> slash commands — the plugin marketplace ships the skills, not the binary. Install
> it in this project, then re-run:
> ```bash
> npm install --save-dev github:rafaelolsr/delivery-graph
> ```

## Resume detection

If `#$ARGUMENTS` names an existing `DEM-###`, or the store already holds an in-progress
demand with an approved graph, **resume from the ready queue** instead of restarting:

```bash
dge next --json   # returns the queue head; done nodes stay done
```

If a graph exists and has ready/incomplete nodes, skip intake/plan and both gates
(already approved) and jump straight to **Phase 4 (execute)**. Announce that you are
resuming, not restarting.

## Workflow

### Phase 1 — Intake (human contact)

Run the `/dge-intake` discipline: grill the demand one question at a time, survey prior
art and learnings, expose gaps, and write testable requirements through the CLI. This is
the only conversational phase; it ends when the intake readiness gate passes with no
blocker gaps.

### Phase 2 — Gate 1: the Demand Brief

Render and present the Demand Brief:

```bash
dge brief demand DEM-### 
```

Show it to the user as the "here is what we will build and why" summary: the problem,
the outcome, non-goals, the requirements (with priorities), and your recommendation.
Then **stop and ask for approval or edits**.

- **Edits are conversational.** The user says what to change in plain language
  ("drop REQ-x", "make REQ-y a should", "split that requirement"). You translate each
  into the matching `dge` CLI mutation, then **re-render the brief**. Loop until approved.
- **Blocker gaps block approval.** If an edit reintroduces a blocker gap (an orphaned
  requirement, an unresolved GAP), the gate cannot be approved until it is resolved.
- **Abandon is clean.** If the user abandons, stop; the graph is preserved and resumable.

Do not proceed until the user explicitly approves.

### Phase 3 — Plan, then Gate 2: the Graph Brief

On Gate 1 approval, **auto-advance** into the `/dge-plan-graph` discipline (no user
command): create tracks, nodes, dependency edges, and validation contracts through the
CLI, carrying the intake context forward (a validation ambiguity surfaced in Phase 1
should shape how you split nodes and write contracts).

Then render and present the Graph Brief:

```bash
dge brief graph DEM-### 
```

Show it as the "here is exactly what will be built and changed" graph: an indented
dependency tree where each node carries its type, the requirements it serves, and its
validation contract inline, plus the ready-queue order. The tree renders in every surface
(terminal, CLI, harness chat); add `--mermaid` only for a large multi-edge graph in a
rendering surface where a diagram beats indentation. Then **stop and ask for approval or
edits** (same conversational edit → CLI → re-render loop as Gate 1; blocker gaps still
block approval; abandon is still clean).

**Gate 2 is always required.** Never begin execution without explicit approval here.

### Phase 4 — Execute (silent orchestrator)

On Gate 2 approval, **auto-advance** into the `/dge-execute-graph` loop in quiet mode.
Drive the ready queue end to end, one node at a time, evidence-gated:

- **Clean nodes flow silently** — emit only a compact completion line per node, then
  **re-render the live status board** (`dge status`) so the user always sees current
  `graph.json` state (the board is a projection, not a separate log).
- **Failure stops the loop, loudly** — surface the exact `dge done` error and the review
  report path (stop-on-failure). Do not retry structural failures.
- **Ambiguity pauses once, asks once** — on a genuine fork the conductor must not resolve
  (result-ambiguity: pass/fail is a judgment call; fix-ambiguity: more than one change
  would satisfy the contract; or a missing/non-executable contract or unresolved blocker
  GAP), pause, ask **one** question, apply the answer, and resume. See `/dge-execute-graph`
  "Failure classification".

Never fabricate evidence or weaken a contract to keep the loop flowing.

### Phase 5 — Summary

When the queue is dry, emit the final summary: nodes completed in order, evidence
captured per node, any retries or ambiguity pauses, and remaining/blocked counts.
Recommend `/dge-review` and `/dge-compound` as the natural next steps.

## Output

- The two gate artifacts (Demand Brief, Graph Brief), each approved by the user.
- Implemented nodes with evidence, closed through the evidence-gated `dge done`.
- A final summary of all work done.

## CLI contract

```bash
dge preflight [--no-graph]              # shared preamble
dge brief demand DEM-###                # Gate 1 artifact
dge brief graph DEM-### [--mermaid]     # Gate 2 artifact
dge next --json                         # queue head (resume + execution)
dge status                              # live board projection during execution
dge evidence run NODE-### --satisfies "..." -- <cmd>
dge evidence add  NODE-### --satisfies "..." --summary "..." --result pass|fail|ambiguous
dge done NODE-###                       # the only path to completion
```

The conductor sequences these; the user issues none of them by hand.
