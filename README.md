# Delivery Graph Engineering

Delivery Graph Engineering (DGE) turns raw demands into validated delivery graphs that agents can execute across harnesses and task trackers.

Instead of treating work as a linear checklist, DGE models delivery as a graph: demands become requirements, requirements become tracks and nodes, nodes carry dependencies and validation contracts, and external tools such as Linear or Azure DevOps stay synchronized as projections.

DGE is a **delivery operating system for coding agents**. It includes the general discipline every serious agentic workflow needs:

- clarify before coding
- plan before execution
- work in isolated units
- validate before completion
- review before merge
- capture learnings

But DGE adds stronger operational requirements:

- tasks become **nodes**
- nodes have **dependencies**
- nodes sync to **Linear or Azure DevOps**
- every node has a **validation contract**
- done requires **evidence**
- status is managed through a **state machine**
- the canonical artifact is **machine-readable**

The result is a workflow that is general enough to become a public methodology, but specific enough to support graph execution, evidence-gated completion, and task-tracker synchronization.

## Core idea

```text
Intake -> Requirements -> Graph -> Sync -> Work Node -> Verify -> Review -> Compound
   ^                                                                        |
   |------------------------------------------------------------------------|
```

The loop compounds because every completed node leaves behind validation evidence, decisions, reusable patterns, and follow-up context for the next demand.

## Quick start

```bash
npm run check
```

This validates the example graph and renders a status report.

## Local engine commands

The MVP includes a dependency-free local graph engine.

```bash
# Validate a graph
npm run validate

# Render graph status
npm run status

# Run engine tests
npm test

# Transition a node in a graph file
npm run transition -- examples/delivery-graph.example.json NODE-001 done
```

The transition command enforces the node state machine, dependency readiness, and validation evidence requirements.

## Skill loop

| Skill | Purpose | Primary output |
| --- | --- | --- |
| `/dge-intake` | Brainstorm the demand, expose gaps, and create testable requirements | `delivery-graph/demands/`, `delivery-graph/requirements/` |
| `/dge-plan-graph` | Break requirements into tracks, nodes, dependencies, and validation contracts | `delivery-graph/graph.json` |
| `/dge-sync` | Create or update tracker records from graph nodes | Linear issues, ADO tasks, `delivery-graph/sync/` |
| `/dge-work-node` | Execute one ready atomic node | Code/docs changes plus node evidence |
| `/dge-verify` | Gate completion on validation evidence | `delivery-graph/evidence/` |
| `/dge-review` | Review implementation, graph state, unresolved risks, and validation coverage | `delivery-graph/reports/` |
| `/dge-compound` | Capture reusable learning for future loops | `delivery-graph/learnings/` |
| `/dge-status` | Render the current graph as a board/status view | terminal report, Linear view, markdown status |

## Workflow diagram

```mermaid
flowchart TD
    A[Raw demand] --> B["/dge-intake"]
    B --> C[Demand record]
    B --> D[Testable requirements]
    B --> E[Gap register]

    D --> F["/dge-plan-graph"]
    E --> F
    F --> G[Delivery graph]
    G --> H[Tracks]
    G --> I[Work nodes]
    G --> J[Validation contracts]

    I --> K["/dge-sync"]
    K --> L[Linear issues]
    K --> M[Azure DevOps tasks]
    K --> N[Sync map]

    I --> O["/dge-work-node"]
    O --> P[Implementation changes]
    O --> Q[Node evidence]

    Q --> R["/dge-verify"]
    J --> R
    R --> S{Validation passed?}
    S -- no --> O
    S -- yes --> T[Node verified]

    T --> U["/dge-review"]
    U --> V{Review passed?}
    V -- no --> O
    V -- yes --> W[Ready to close / merge]

    W --> X["/dge-compound"]
    X --> Y[Reusable learning]
    Y --> B
```

## Canonical store

DGE uses a single canonical store in the consuming repository:

```text
delivery-graph/
├── graph.json                 # Canonical graph: demands, requirements, tracks, nodes, edges
├── demands/                   # Raw demand records and clarified demand summaries
├── requirements/              # Testable requirements and acceptance criteria
├── evidence/                  # Validation evidence, grouped by node id
├── sync/                      # External tracker ids, sync state, conflict notes
├── reports/                   # Status, review, verification, and delivery reports
└── learnings/                 # Compounded reusable knowledge from completed work
```

Linear, Azure DevOps, GitHub Issues, and markdown boards are projections of this store. They can be updated from the graph, but they should not silently replace the graph as the source of truth.

## Deliverable asset locations

| Asset | Saved in | Created by |
| --- | --- | --- |
| Demand record | `delivery-graph/demands/DEM-<id>.md` | `/dge-intake` |
| Requirements | `delivery-graph/requirements/REQ-<id>.md` | `/dge-intake` |
| Gap register | `delivery-graph/graph.json` under `gaps` | `/dge-intake` |
| Canonical graph | `delivery-graph/graph.json` | `/dge-plan-graph` |
| Linear sync map | `delivery-graph/sync/linear.json` | `/dge-sync` |
| ADO sync map | `delivery-graph/sync/ado.json` | `/dge-sync` |
| Node evidence | `delivery-graph/evidence/NODE-<id>/` | `/dge-verify` |
| Review report | `delivery-graph/reports/review-<timestamp>.md` | `/dge-review` |
| Status report | `delivery-graph/reports/status-<timestamp>.md` | `/dge-status` |
| Learning note | `delivery-graph/learnings/<slug>.md` | `/dge-compound` |

## Tracker mapping

| DGE object | Linear projection | Azure DevOps projection |
| --- | --- | --- |
| Demand | Project or Initiative | Feature or Epic |
| Requirement | Milestone, label, or parent issue | User Story / PBI |
| Track | Project view, label, or cycle | Area grouping or parent task set |
| Work node | Issue | Task |
| Atomic node | Sub-issue | Child task |
| Dependency edge | Blocks / blocked-by relation | Related / predecessor link |
| Validation contract | Checklist/comment | Acceptance criteria/checklist |
| Evidence | Comment, attachment, PR/check link | Discussion, attachment, test evidence |

## Node lifecycle

```text
proposed -> ready -> in_progress -> blocked -> review -> verified -> done
```

A node can only move to `done` when:

1. All dependencies are complete.
2. Required validation has passed.
3. Evidence is attached under `delivery-graph/evidence/NODE-<id>/`.
4. Tracker state is synchronized.
5. Review findings are resolved or explicitly deferred.

## Repository layout

This repository will contain the plugin source and shared contracts:

```text
.
├── README.md                  # Project overview and workflow contract
├── assets/                    # Plugin icons, diagrams, and public assets
├── adapters/                  # Linear, ADO, GitHub, and local-store adapters
├── docs/                      # Design notes, ADRs, and usage guides
├── examples/                  # Example delivery graphs and generated outputs
├── manifests/                 # Draft manifests for supported harnesses
├── schemas/                   # Graph schemas and validation contracts
├── scripts/                   # Local validation and status tooling
├── src/                       # Core graph engine and renderers
├── tests/                     # Engine tests
└── skills/                    # Multi-harness skill definitions
```

## MVP scope

The first deliverable should prove one complete loop:

1. `/dge-intake` creates one demand with requirements and gaps.
2. `/dge-plan-graph` creates a graph with tracks, nodes, dependencies, and validation contracts.
3. `/dge-sync` creates Linear issues from ready nodes.
4. `/dge-work-node` executes one node.
5. `/dge-verify` attaches evidence and blocks completion if validation is missing.

After that loop works, add ADO sync, review automation, compounding, and additional harness manifests.
