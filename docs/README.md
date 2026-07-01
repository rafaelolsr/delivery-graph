# Docs

Design notes, ADRs, and usage guides live here.

Start with:

- `getting-started.md` — install and run one demand end to end
- `architecture.md`
- `reference/object-model.md`
- `reference/validation.md`

## Adapters

The local store is the shipped baseline; tracker adapters are dry-run projections that generate
reviewable payloads without calling external APIs.

- `adapters/local-store.md` — canonical `delivery-graph/` store (shipped, required)
- `adapters/linear.md` — Linear projection (dry-run implemented)
- `adapters/azure-devops.md` — Azure DevOps projection (dry-run implemented)
- `adapters/github.md` — GitHub Issues projection (**design only, not yet implemented**)
