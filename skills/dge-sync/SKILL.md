---
name: dge-sync
description: Sync Delivery Graph nodes to external task trackers such as Linear, Azure DevOps, or GitHub Issues.
argument-hint: "[linear|ado|github|all] [optional graph path]"
---

# DGE Sync

Use this skill when the graph should create or update tracker records.

## Purpose

Project the canonical delivery graph into external systems. Trackers are projections; the graph remains the source of truth.

## Supported targets

- Linear
- Azure DevOps
- GitHub Issues
- local sync files

## Core rules

1. Never create tracker records for unresolved blocker gaps.
2. Sync only executable nodes unless the user asks to sync demands or requirements.
3. Preserve graph IDs in tracker titles or metadata.
4. Update `delivery-graph/sync/<target>.json` after successful sync.
5. If tracker state conflicts with graph state, report a conflict; do not silently overwrite the graph.

## Mapping

| DGE object | Linear | Azure DevOps |
| --- | --- | --- |
| Demand | Project / Initiative | Feature / Epic |
| Requirement | Milestone, label, or parent issue | User Story / PBI |
| Track | Project view, label, or cycle | Area grouping |
| Work node | Issue | Task |
| Dependency | Blocks relation | Related/predecessor link |
| Validation | Checklist/comment | Acceptance checklist |

## Workflow

1. Read `delivery-graph/graph.json`.
2. Resolve sync target from arguments or config.
3. Identify nodes missing external IDs.
4. Create missing records.
5. Update existing records when title, status, dependency, or validation changed.
6. Save sync map under `delivery-graph/sync/`.
7. Report created, updated, skipped, and conflicted records.

## CLI contract

Use local dry-run adapters first:

```bash
npm run dge -- sync linear --team-id "<linear-team-id>"
npm run dge -- sync ado --org "<ado-org>" --project "<ado-project>" --area "<area-path>" --iteration "<iteration-path>"
```

These write `delivery-graph/sync/linear.json` or `delivery-graph/sync/ado.json` with planned tracker payloads. Treat those files as the reviewable projection before enabling any API-backed sync.

## Safety

If credentials or tracker tools are unavailable, write a dry-run plan instead of failing silently:

- `delivery-graph/sync/<target>.json`
