# Linear Adapter

Linear is the recommended first operational projection for DGE.

## Mapping

| DGE | Linear |
| --- | --- |
| Demand | Project / Initiative |
| Requirement | Milestone, parent issue, or label |
| Track | View, label, or cycle |
| Node | Issue |
| Atomic node | Sub-issue |
| Dependency | Blocks / blocked-by relation |
| Validation | Checklist or comment |
| Evidence | Comment, attachment, PR/check link |

## Sync state

Save under:

```text
delivery-graph/sync/linear.json
```

## Current implementation

The MVP Linear adapter is dry-run by design. It creates deterministic Linear issue payloads and writes the sync map without calling the Linear API.

```bash
npm run dge -- sync linear --team-id "<linear-team-id>"
```

The sync map includes:

- planned `create` or `update` action per node
- deterministic dry-run issue ids for unmapped nodes
- Linear issue title and description payload
- labels for DGE, track, type, status, and requirements
- dependency issue ids when dependencies already have real Linear ids

Prior dry-run ids such as `dry-run:NODE-001` are not treated as real Linear issue ids on subsequent syncs.

## Payload title

```text
[NODE-001] Add eval CI command
```

## Payload body

The generated issue description includes:

- graph id and title
- node id
- track id
- requirement ids
- dependency node ids
- mapped Linear dependency issue ids
- validation contract
- evidence path
- `<!-- dge:managed -->` marker
