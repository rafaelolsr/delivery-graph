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

