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

## Skill authoring

Public skills live under `skills/<skill-name>/SKILL.md`.

Use `dge-` prefixes for every public skill:

- `dge-intake`
- `dge-plan-graph`
- `dge-sync`
- `dge-work-node`
- `dge-verify`
- `dge-review`
- `dge-compound`
- `dge-status`

## Runtime artifact locations

The plugin writes user project artifacts under the consuming repository's `delivery-graph/` directory, not inside this plugin repository.
