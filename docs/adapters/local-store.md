# Local Store Adapter

The local store is the required baseline adapter.

## Responsibilities

- Read `delivery-graph/graph.json`.
- Write demand, requirement, evidence, report, and learning files.
- Validate dependency edges.
- Render status reports.
- Preserve graph identity across sync targets.

## Runtime structure

```text
delivery-graph/
├── graph.json
├── demands/
├── requirements/
├── evidence/
├── sync/
├── reports/
└── learnings/
```

