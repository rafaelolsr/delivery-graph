# GitHub Issues Adapter

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

