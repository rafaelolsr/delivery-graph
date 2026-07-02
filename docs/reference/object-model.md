# Object Model

## Demand

A raw request or business need.

## Requirement

A testable statement of expected behavior or outcome.

## Gap

An unresolved ambiguity, risk, contradiction, or missing decision.

## Track

A group of related nodes.

## Node

An executable unit of work with dependencies and validation.

## Node sync

Per-tracker back-references from a node into its projections, under `node.sync`.
The object is **open by design**: each adapter owns its own key
(`linear_issue_id`, `ado_task_id`, and any future tracker's key such as
`github_issue_number`), so adding a tracker does not require a core-schema change.
The canonical graph stays the source of truth; these ids only point back into the
projected records.

## Validation contract

The proof required before a node can be considered complete.

## Evidence

Artifacts proving validation passed: command output, CI links, eval results, screenshots, review reports, or tracker comments.

