---
name: dge-plan-graph
description: Convert DGE requirements into tracks, dependency nodes, and validation contracts.
argument-hint: "[optional graph path, demand id, or requirements path]"
---

# DGE Plan Graph

Use this skill after `/dge-intake` has produced ready requirements.

## Purpose

Create the executable delivery graph: tracks, nodes, dependency edges, and validation contracts. This skill plans work; it does not implement code.

## Core rules

1. The graph is the source of truth.
2. Every executable node must map to at least one requirement.
3. Every node must include validation before it can be synced or executed.
4. Split large nodes until each node has one clear validation contract.
5. Preserve dependency edges explicitly; do not flatten into a checklist.
6. Prefer the fewest tracks and nodes that cover the `must` requirements; add a track or node only when a requirement or validation contract demands it. `should`/`could` requirements do not need their own track.

## Preflight: require the DGE CLI

Before planning, run the shared preflight (one callable place for every `dge-*`
skill and the `/dge-deliver` conductor). Planning runs after `dge init`, so the
graph must exist and validate:

```bash
dge preflight || npx --no-install dge preflight
```

If it exits non-zero, **stop** and tell the user to install DGE first (the plugin ships `dge`
on the PATH, or `npm install --save-dev github:rafaelolsr/delivery-graph`). The `dge` CLI is
the **only** writer of `delivery-graph/graph.json`; never hand-write or hand-edit it.

## Workflow

### 1. Load intake artifacts

Read `delivery-graph/graph.json` or the user-provided graph path. Confirm:

- no unresolved blocker gaps
- at least one demand exists
- requirements have acceptance criteria
- requirements have validation methods

Also read prior learnings so the plan does not repeat a known mistake:

```bash
dge learnings --about "<keywords from these requirements>" --json   # or: npx dge learnings ...
```

A learning may change how you split nodes or what a validation contract must
assert (e.g. "substring evidence is weak — gate correctness on a live check").
Fold any applicable learning into a node's validation contract.

### 2. Create tracks

Use tracks to group related nodes. Most demands need only `implementation` + `validation`; add others only when a requirement demands them. Common tracks:

- product-contract
- research
- implementation
- integration
- validation
- documentation
- release

### 3. Create nodes

Each node must include:

```yaml
- id: NODE-001
  title: "..."
  type: implementation
  track: TRK-implementation
  requirement_ids: [REQ-001]
  depends_on: []
  status: ready
  validation:
    required:
      - "..."
    evidence_path: delivery-graph/evidence/NODE-001/
  sync:
    linear_issue_id: null
    ado_task_id: null
```

### 4. Validate graph shape

Check:

- no dependency cycles
- no node depends on itself
- every dependency points to an existing node
- every requirement is covered by at least one node
- every node has at least one validation requirement

### 5. Save graph

Create tracks and nodes through the CLI (`dge add-track`, `dge add-node`); it updates
`delivery-graph/graph.json` for you. Do not write `graph.json` yourself.

## Output

Report:

- graph id
- tracks created
- nodes created
- ready nodes
- blocked nodes
- requirements without nodes, if any
- next command: `/dge-sync` or `/dge-work-node NODE-###`

## CLI contract

The DGE CLI is required (see Preflight) and is the only writer of the canonical store. Use
`dge` if it is on the PATH (the plugin ships it), otherwise `npx dge`:

```bash
dge add-track ...        # or: npx dge add-track ...
dge add-node ...
dge status
```

Never edit `graph.json` by hand. If the CLI is unavailable, stop and install it (Preflight).
