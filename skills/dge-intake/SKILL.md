---
name: dge-intake
description: Brainstorm a raw demand into a structured demand record, gap register, requirements, and acceptance criteria for Delivery Graph Engineering.
argument-hint: "[raw demand, issue link, meeting note, or feature idea]"
---

# DGE Intake

Use this skill when starting a new piece of work. It is the brainstorm and gap-exposure step for Delivery Graph Engineering.

## Purpose

Turn a raw demand into testable requirements without designing the implementation. The output feeds `/dge-plan-graph`.

## Core rules

1. Ask one question at a time when clarification is needed.
2. Expose gaps explicitly; do not hide uncertainty in prose.
3. Do not produce work nodes or implementation tracks here.
4. Do not mark the intake ready while blocker gaps are unresolved.
5. Use the canonical DGE IDs: `DEM-###`, `REQ-###`, `GAP-###`.

## Inputs

`#$ARGUMENTS`

If no demand is provided, ask the user what demand, problem, or request they want to shape.

## Preflight: require the DGE CLI

Before writing anything, confirm the `dge` CLI is available:

```bash
dge --help >/dev/null 2>&1 || npx --no-install dge --help >/dev/null 2>&1
```

If neither resolves, **stop** and tell the user to install DGE first — do not proceed:

> DGE CLI not found. Install the plugin (which ships `dge` on the PATH) or run
> `npm install --save-dev github:rafaelolsr/delivery-graph`, then re-run `/dge-intake`.

The `dge` CLI is the **only** writer of `delivery-graph/graph.json`. Never hand-write or
hand-edit `graph.json` — doing so drifts from the engine schema and breaks every other
`dge` command. If the CLI is missing, the correct action is to install it, not to emulate it.

## Workflow

### 1. Capture the raw demand

Record:

- source
- requester, if known
- problem statement
- desired outcome
- urgency
- constraints
- non-goals
- known stakeholders

### 2. Grill the demand

Act like a structured version of `grill-me`. Challenge:

- unclear problem
- vague success criteria
- missing owner
- hidden dependency
- untestable requirement
- scope creep
- contradiction
- validation ambiguity

### 3. Emit gaps

Represent each unresolved issue as:

```yaml
- id: GAP-001
  type: validation
  severity: blocker
  question: "What evidence proves this requirement is complete?"
  blocks: [REQ-001]
  resolution: null
```

### 4. Write requirements

Each requirement must be testable:

```yaml
- id: REQ-001
  demand_id: DEM-001
  statement: "..."
  priority: must
  acceptance:
    - "..."
  validation:
    method: automated-test
    required_evidence:
      - "..."
```

### 5. Save outputs

Author the canonical store **only through the `dge` CLI** (see CLI contract below). The CLI
writes `delivery-graph/graph.json` and the `demands/` and `requirements/` markdown for you:

- `dge add-demand ...` writes `delivery-graph/demands/DEM-###.md` and the graph entry
- `dge add-requirement ...` writes `delivery-graph/requirements/REQ-###.md` and the graph entry
- `dge add-gap ...` / `dge resolve-gap ...` record gaps in the graph

Do not write `graph.json` yourself. The CLI owns its schema.

## Readiness gate

Return `ready_for_graph: true` only when:

1. The problem is clear.
2. The intended outcome is explicit.
3. Non-goals are named.
4. Constraints are known or marked as gaps.
5. Requirements are testable.
6. Acceptance criteria exist.
7. No blocker gaps remain unresolved.

If blocker gaps remain, stop and report them instead of invoking `/dge-plan-graph`.

## CLI contract

The DGE CLI is required (see Preflight) and is the only writer of the canonical store. Use
`dge` if it is on the PATH (the plugin ships it), otherwise `npx dge`:

```bash
dge add-demand ...       # or: npx dge add-demand ...
dge add-requirement ...
dge add-gap ...
dge resolve-gap ...
```

Never edit `graph.json` by hand. If the CLI is unavailable, stop and install it (Preflight).
