---
name: dge-compound
description: Capture reusable learning from completed Delivery Graph nodes, tracks, or demands.
argument-hint: "[optional NODE-###, track id, demand id, or brief context]"
---

# DGE Compound

Use this skill after a node, track, or demand is completed.

## Purpose

Convert execution knowledge into reusable learning for future DGE loops.

## Core rules

1. Capture what future agents need, not a diary of everything that happened.
2. Include failed approaches when they prevent repeated mistakes.
3. Link to graph IDs, evidence, tracker records, and PRs.
4. Save learning under `delivery-graph/learnings/`.

## Workflow

1. Read graph scope.
2. Read relevant evidence and review reports.
3. Extract durable patterns, decisions, gotchas, and validation lessons.
4. Write `delivery-graph/learnings/<slug>.md`.
5. Suggest whether the graph schema or skill instructions should change.

## Learning format

Add a small YAML frontmatter block so `dge learnings --about "<topic>"` can match
this learning by tag and related id (the read side of the compound loop that
`/dge-intake` and `/dge-plan-graph` run before scoping new work). The frontmatter
is optional and legacy learnings without it still list — but new learnings should
carry it so future demands actually find them.

```markdown
---
title: <Learning title>
tags: [<topic>, <area>, <keyword>]
related: [NODE-###, DEM-###, REQ-###]
---

# <Learning title>

## Applies when

## Context

## Guidance

## Evidence

## Avoid

## Related graph ids
```

After writing a learning, confirm it surfaces: `dge learnings --about "<a tag>"`
should list it. A learning no future demand can find is not compounding.

