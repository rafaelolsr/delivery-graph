# Architecture

Delivery Graph Engineering is organized around one invariant:

> The delivery graph is canonical; trackers and boards are projections.

## Layers

```text
Skills (incl. the /dge-execute-graph loop over the read-only dge next accessor)
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
- graph authoring operations for demands, requirements, gaps, tracks, and nodes

Scripts under `scripts/` call the engine instead of duplicating graph rules.

The unified CLI lives in `bin/dge.mjs` and is the preferred command surface for skills and humans.

## Linear projection

The first tracker adapter lives in `src/adapters/linear.mjs`.

It creates dry-run Linear issue payloads and writes `delivery-graph/sync/linear.json`. API-backed sync can build on this payload contract without changing the graph model.

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
