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

## Workflow

### 1. Load intake artifacts

Read `delivery-graph/graph.json` or the user-provided graph path. Confirm:

- no unresolved blocker gaps
- at least one demand exists
- requirements have acceptance criteria
- requirements have validation methods

### 2. Create tracks

Use tracks to group related nodes. Common tracks:

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

Update `delivery-graph/graph.json`.

## Output

Report:

- graph id
- tracks created
- nodes created
- ready nodes
- blocked nodes
- requirements without nodes, if any
- next command: `/dge-sync` or `/dge-work-node NODE-###`
