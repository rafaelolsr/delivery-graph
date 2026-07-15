# Agent Instructions

This repository contains the Delivery Graph Engineering multi-harness plugin.

## Working agreement

- Keep the canonical runtime store machine-readable. The MVP canonical file is `delivery-graph/graph.json` in the consuming repository.
- Treat Linear, Azure DevOps, GitHub Issues, and markdown boards as projections of the graph.
- Do not add tracker-specific behavior directly inside skill prose when it belongs in an adapter contract.
- Every executable node must have a validation contract and evidence path.
- Prefer small, explicit schemas over broad, loosely typed documents.

## Validation

Run:

```bash
npm run check
```

This validates the example graph and renders a status report.

The check also runs the Node test suite for the graph engine.

Use the unified CLI for local graph authoring:

```bash
npm run dge -- status
```

Do not mark a node done without evidence. Use:

```bash
npm run dge -- evidence run NODE-001 --satisfies "..." -- <validation-command>
npm run dge -- evidence playwright NODE-001 --satisfies "..." --url http://localhost:3000 --script tests/e2e/app.spec.ts
npm run dge -- done NODE-001
```

## Skill authoring

Public skills live under `skills/<skill-name>/SKILL.md`.

Use `dge-` prefixes for every public skill:

- `dge-design`
- `dge-plan-graph`
- `dge-sync`
- `dge-work-node`
- `dge-verify`
- `dge-review`
- `dge-compound`
- `dge-status`
- `dge-execute-graph`

## Runtime artifact locations

The plugin writes user project artifacts under the consuming repository's `delivery-graph/` directory, not inside this plugin repository.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
