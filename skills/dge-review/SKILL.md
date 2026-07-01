---
name: dge-review
description: Review Delivery Graph work for implementation quality, graph consistency, validation coverage, and unresolved risks.
argument-hint: "[optional NODE-###, graph path, or review scope]"
---

# DGE Review

Use this skill before closing a node, merging work, or shipping a track.

## Purpose

Review both the implementation and the delivery graph. Code can pass tests while the graph still lies; this skill checks both.

## Review lenses

- requirement coverage
- over-build check: does any node or requirement lack a traceable stated need, or add abstraction/robustness beyond the outcome?
- dependency correctness
- validation completeness
- code or artifact changes
- tracker sync state
- unresolved risks
- deferred findings

## Workflow

1. Read graph and requested scope.
2. Check graph consistency.
3. Check that every completed node has evidence.
4. Check that every requirement is covered by at least one node.
5. Review implementation diff if code changed.
6. Write report to `delivery-graph/reports/review-<timestamp>.md`.
7. Return actionable findings.

## Finding severities

- `blocker`: must fix before node/track closes
- `major`: should fix before merge unless explicitly deferred
- `minor`: safe to defer with rationale
- `note`: informational

## CLI contract

When local tooling is available, use:

```bash
npm run dge -- review
```

The command writes `delivery-graph/reports/review-<timestamp>.md`.
