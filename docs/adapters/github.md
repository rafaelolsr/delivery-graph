# GitHub Issues Adapter

> **Status: planned, not yet implemented.** This document is the design contract. There is no
> `dge sync github` command or `src/adapters/github.mjs` yet — the shipped tracker adapters are
> Linear and Azure DevOps (both dry-run). See [linear.md](linear.md) and [azure-devops.md](azure-devops.md).

GitHub Issues is a lightweight projection for repositories that do not use Linear or Azure DevOps.

## Mapping

| DGE | GitHub |
| --- | --- |
| Demand | Issue with `demand` label or project item |
| Requirement | Checklist section or child issue |
| Track | Label, milestone, or project view |
| Node | Issue |
| Dependency | Linked issue text or project dependency field when available |
| Validation | Checklist item |
| Evidence | Comment, PR link, check link, or artifact link |

## Sync state

Save under:

```text
delivery-graph/sync/github.json
```

