# Azure DevOps Adapter

Azure DevOps is the enterprise execution projection for DGE.

## Mapping

| DGE | Azure DevOps |
| --- | --- |
| Demand | Feature / Epic |
| Requirement | User Story / PBI |
| Track | Area grouping or parent task set |
| Node | Task |
| Atomic node | Child task |
| Dependency | Related / predecessor link |
| Validation | Acceptance checklist |
| Evidence | Discussion, attachment, test result, or PR link |

## Sync state

Save under:

```text
delivery-graph/sync/ado.json
```

