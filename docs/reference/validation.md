# Validation Contract

Every executable node must carry a validation contract.

```yaml
validation:
  required:
    - "npm test"
    - "manual review of generated Linear issue"
  evidence_path: delivery-graph/demands/DEM-001/evidence/NODE-001/
```

## Completion gate

A node is not complete until:

1. The required validation has passed.
2. Evidence is saved.
3. Review findings are resolved or explicitly deferred.
4. Tracker state is synchronized.

## Graph validation

`dge validate` enforces two layers:

1. `schemas/delivery-graph.schema.json` for shape, enums, required fields, and unexpected properties.
2. Semantic graph checks for cross references, unresolved blocker gaps, dependency cycles, dependency readiness, and evidence gates.

Use `dge status --save` to persist the current board view under `delivery-graph/reports/status-<timestamp>.md`, or `dge status --out <path>` to write a stable handoff file.

Tracker sync is a projection, not a completion substitute. Use `dge sync linear` or `dge sync ado` to write reviewable dry-run sync maps under `delivery-graph/sync/` while keeping `delivery-graph/graph.json` canonical.

## Evidence manifest

Evidence is stored per node:

```text
delivery-graph/demands/DEM-001/evidence/NODE-001/
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
npx dge evidence playwright NODE-001 --satisfies "user can complete checkout" --url http://localhost:3000 --script tests/e2e/checkout.spec.ts
npx dge done NODE-001
```

`evidence run` stores command output, error output, and exit code as a JSON artifact under the node evidence directory. Successful commands are recorded in `evidence.json`; failed commands are saved as attempt artifacts but do not satisfy the validation contract.

`evidence playwright` is the browser/UX evidence path. It runs a Playwright command directly, passes `DGE_EVIDENCE_URL` and `DGE_EVIDENCE_SCRIPT` to the process when provided, copies configured artifacts with `--artifacts`, and only records evidence when the command exits successfully. If no command is supplied after `--`, it defaults to `npx playwright test [script]`.

Successful completion writes `verification.md`, writes a review report, and marks the node `done`. `verification.md` gives the user-visible proof that each required validation item was satisfied by recorded evidence.
