# Validation Contract

Every executable node must carry a validation contract.

```yaml
validation:
  required:
    - "npm test"
    - "manual review of generated Linear issue"
  evidence_path: delivery-graph/evidence/NODE-001/
```

## Completion gate

A node is not complete until:

1. The required validation has passed.
2. Evidence is saved.
3. Review findings are resolved or explicitly deferred.
4. Tracker state is synchronized.

## Evidence manifest

Evidence is stored per node:

```text
delivery-graph/evidence/NODE-001/
├── evidence.json
├── summary.md
└── artifacts/
```

Example:

```json
{
  "node_id": "NODE-001",
  "items": [
    {
      "id": "EVD-001",
      "kind": "command",
      "summary": "npm test passed",
      "satisfies": "npm test",
      "artifact": null,
      "created_at": "2026-06-30T00:00:00Z"
    }
  ]
}
```

Use:

```bash
npm run dge -- evidence add NODE-001 --satisfies "npm test" --summary "npm test passed"
npm run dge -- verify NODE-001
```
