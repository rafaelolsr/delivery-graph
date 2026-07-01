# Getting Started

## 1. Intake a demand

```text
/dge-intake add a validation gate for advisor eval regressions
```

## 2. Plan the graph

```text
/dge-plan-graph
```

## 3. Sync nodes

```text
/dge-sync linear
```

## 4. Work one node

```text
/dge-work-node NODE-001
```

## 5. Verify

```text
/dge-verify NODE-001
```

## 6. Review and compound

```text
/dge-review
/dge-compound NODE-001
```

## Local engine check

Before integrating a tracker, verify the local graph engine:

```bash
npm run check
```

This runs graph validation, renders status, and executes the engine tests.

## Local authoring workflow

The public skills define the agent workflow. The local CLI provides the machine contract those skills can use.

```bash
npm run dge -- init --title "My first DGE graph"
npm run dge -- add-demand --title "Improve delivery" --source "user" --outcome "Validated graph nodes"
npm run dge -- add-requirement --demand DEM-001 --statement "A requirement exists" --acceptance "Requirement is in graph" --evidence "Graph validation passes"
npm run dge -- add-track --title "Implementation"
npm run dge -- add-node --title "Create the first node" --type implementation --track TRK-implementation --requirements REQ-001 --validation "npm run check"
npm run dge -- status
```

The default graph path is `delivery-graph/graph.json`.

## Linear dry-run sync

```bash
npm run dge -- sync linear --team-id "<linear-team-id>"
```

This writes `delivery-graph/sync/linear.json` with planned issue payloads. It does not call the Linear API yet.
