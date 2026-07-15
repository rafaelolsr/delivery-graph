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

## Agentic verification policy

`src/agentic-verification.mjs` turns verifier independence into an engine policy:

- every verifier uses a fresh run with only the contract, diff, and evidence
- standard-risk nodes prefer another harness but may reuse the builder harness in a fresh run
- high-risk nodes require another harness and fail closed when none is available
- only an explicit structured `pass` verdict verifies; failure requests repair and missing verdicts escalate

`dge verification-plan` exposes the risk decision and verifier assignment to conductors without
mutating the graph. Harness adapters can then dispatch that scoped verifier task and retain the
returned plan and verdict as an audit record.

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
4. Never silently replace graph state with tracker state.

**Conflict handling (current status).** Today's Linear and ADO adapters are
**dry-run projections** that operate last-writer-wins: each run records
`last_synced_status` per node in the sync map, but no adapter yet *compares* it
against the live tracker to detect drift — there is no external read to compare
against in dry-run mode. `last_synced_status` is the hook a future real-API
adapter will use to report conflicts (tracker changed since last sync); until
then it is informational. Do not assume drift is detected.
