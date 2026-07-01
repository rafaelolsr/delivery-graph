# Schemas

This directory contains the canonical DGE object contracts.

| File | Purpose |
| --- | --- |
| `delivery-graph.schema.json` | JSON Schema for the canonical graph |
| `delivery-graph.example.yaml` | Human-readable YAML example of the graph shape |

The MVP tooling validates JSON because it is dependency-free and maps directly to JSON Schema. YAML support can be added later as a parser adapter without changing the object model.

