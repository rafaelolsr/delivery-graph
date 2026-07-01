# Scripts

Dependency-free local tooling for DGE development.

## Validate graph

```bash
node scripts/validate-graph.mjs examples/delivery-graph.example.json
```

## Render status

```bash
node scripts/render-status.mjs examples/delivery-graph.example.json
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
