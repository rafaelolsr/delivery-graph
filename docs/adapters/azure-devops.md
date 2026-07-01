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

## CLI

```bash
npx dge sync ado --org "<ado-org>" --project "<ado-project>" --area "<area-path>" --iteration "<iteration-path>"
```

The current adapter is dry-run only. It writes deterministic Task payloads and JSON Patch fields to `delivery-graph/sync/ado.json` so the projection can be reviewed before enabling API-backed writes.

The default state mapping uses common Task states only: `proposed` and `ready` become `To Do`, active or blocked pre-completion states become `In Progress`, and only terminal `done` becomes `Done`. The original DGE status remains available in tags and metadata.

Existing real task ids can be kept in `node.sync.ado_task_id` or in the sync map. Prior `dry-run:NODE-###` ids are not treated as real Azure DevOps task ids.
