---
name: dge-status
description: Render Delivery Graph status as a kanban-style report with ready nodes, blockers, validation gaps, and tracker sync state.
argument-hint: "[optional graph path]"
---

# DGE Status

Use this skill to inspect graph health.

## Purpose

Show the current operational state of a delivery graph without changing it.

## Workflow

1. Read `delivery-graph/graph.json`.
2. Group nodes by status.
3. Identify ready nodes whose dependencies are complete.
4. Identify blocked nodes and unresolved blocker gaps.
5. Identify nodes missing validation evidence.
6. Identify tracker sync drift.
7. Print a concise terminal report.
8. If requested, save to `delivery-graph/reports/status-<timestamp>.md`.

## CLI contract

When local tooling is available, use:

```bash
npx dge status
npx dge status --save
npx dge status --out delivery-graph/reports/status.md
```

The status output must include missing validation evidence.

## Output sections

Follow the shared output convention (see `skills/README.md`): lead with a bold
one-line synthesis of graph health (e.g. "N ready, M blocked, K validation gaps"),
then the sections:

- graph summary
- kanban columns
- ready next nodes
- blockers
- validation gaps
- sync drift

Then a `## Next` block with the recommended next command.
