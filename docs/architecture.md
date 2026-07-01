# Architecture

Delivery Graph Engineering is organized around one invariant:

> The delivery graph is canonical; trackers and boards are projections.

## Layers

```text
Skills
  -> Graph operations
    -> Canonical store
      -> Adapters
        -> Linear / Azure DevOps / GitHub / local reports
```

## Core engine

The local engine lives in `src/graph-engine.mjs`.

It owns:

- graph file read/write helpers
- graph consistency validation
- dependency cycle detection
- ready-node selection
- node lifecycle transitions
- status summarization

Scripts under `scripts/` call the engine instead of duplicating graph rules.

## Canonical store

The consuming repository owns the runtime graph under:

```text
delivery-graph/
```

This plugin repository owns schemas, skills, adapters, examples, and documentation.

## Adapter contract

Adapters must:

1. Read graph state.
2. Create or update external records.
3. Save sync state.
4. Report conflicts.
5. Never silently replace graph state with tracker state.
