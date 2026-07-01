# Scripts

Dependency-free local tooling for DGE development.

## DGE CLI

Prefer the unified CLI for new workflows:

```bash
node bin/dge.mjs init --title "My delivery graph"
node bin/dge.mjs add-demand --title "Demand" --source "user" --outcome "Outcome"
node bin/dge.mjs add-requirement --demand DEM-001 --statement "Requirement" --acceptance "Acceptance" --evidence "Evidence"
node bin/dge.mjs add-track --title "Implementation"
node bin/dge.mjs add-node --title "Node" --type implementation --track TRK-implementation --requirements REQ-001 --validation "npm test"
node bin/dge.mjs evidence run NODE-001 --satisfies "npm test" -- npm test
node bin/dge.mjs evidence playwright NODE-001 --satisfies "browser proof" --url http://localhost:3000 --script tests/e2e/app.spec.ts
node bin/dge.mjs done NODE-001
node bin/dge.mjs sync linear --team-id "<linear-team-id>"
node bin/dge.mjs sync ado --org "<ado-org>" --project "<ado-project>" --area "<area-path>" --iteration "<iteration-path>"
node bin/dge.mjs status --save
```

## Validate graph

```bash
node scripts/validate-graph.mjs examples/delivery-graph.example.json
```

## Render status

```bash
node scripts/render-status.mjs examples/delivery-graph.example.json --save
node scripts/render-status.mjs examples/delivery-graph.example.json --out delivery-graph/reports/status.md
```

## Transition node

```bash
node scripts/transition-node.mjs examples/delivery-graph.example.json NODE-001 done
```

The transition command writes the updated graph back to disk and rejects invalid lifecycle moves.

## Package shortcut

```bash
npm run check
```
