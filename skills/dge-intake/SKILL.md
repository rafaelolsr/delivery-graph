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

In the consuming repository, write:

- `delivery-graph/demands/DEM-###.md`
- `delivery-graph/requirements/REQ-###.md`
- `delivery-graph/graph.json` with `demands`, `requirements`, and `gaps`

Create directories if needed.

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

When local tooling is available, prefer the DGE CLI over manual JSON edits:

```bash
npm run dge -- add-demand ...
npm run dge -- add-requirement ...
npm run dge -- add-gap ...
npm run dge -- resolve-gap ...
```
