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

