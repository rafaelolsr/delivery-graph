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
├── verification.md
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
npx dge evidence run NODE-001 --satisfies "npm test" -- npm test
npx dge verify NODE-001
```

`evidence run` stores command output, error output, and exit code as a JSON artifact under the node evidence directory. Successful commands are recorded in `evidence.json`; failed commands are saved as attempt artifacts but do not satisfy the validation contract.

Successful verification writes `verification.md`, which gives the user-visible proof that each required validation item was satisfied by recorded evidence.
