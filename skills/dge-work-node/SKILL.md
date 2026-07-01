---
name: dge-work-node
description: Execute one ready Delivery Graph node while preserving its validation contract and dependency boundaries.
argument-hint: "NODE-### [optional graph path]"
---

# DGE Work Node

Use this skill to implement one ready atomic node.

## Purpose

Execute only the selected node's scope, then produce evidence for `/dge-verify`.

## Core rules

1. Work on exactly one node unless the user explicitly asks for a batch.
2. Do not start a node whose dependencies are not complete.
3. Keep the node's validation contract visible throughout execution.
4. Do not mark the node done; `/dge-verify` owns completion.
5. Update graph status to `in_progress` when work starts and `review` when implementation is ready for verification.

## Workflow

1. Read `delivery-graph/graph.json`.
2. Locate the requested node.
3. Check dependencies.
4. Read linked requirements and validation contract.
5. Implement the smallest change that satisfies the node.
6. Run focused validation where available.
7. Save evidence under `delivery-graph/evidence/NODE-###/`.
8. Update node status to `review`.
9. Report changed files, evidence paths, and remaining validation.

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
