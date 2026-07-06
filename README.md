<p align="center">
  <img src="assets/banner.png" alt="Delivery Graph — the neutral ground where any agent's work is proven, not trusted" width="100%">
</p>

<h1 align="center">Delivery Graph Engineering</h1>

<p align="center">
  <strong>The neutral ground where any agent's work is proven, not trusted.</strong>
</p>

---

## What is DGE?

Whatever coding agent you use — Claude Code, Copilot CLI, Kimi — it works against **one
evidence-gated delivery graph**, and `done` is **enforced by the engine, not claimed by the
agent**. A node cannot reach `done` until its validation evidence exists on disk. The tool
decides completion; the agent doesn't get to say "it's done" and be believed.

That gate is the same regardless of which agent produced the work — which is what makes DGE
**neutral ground**: an objective arbiter every agent's output must pass.

DGE also brings the discipline every serious agentic workflow needs — clarify before coding,
plan before execution, work in isolated units, validate before completion, review before merge,
capture learnings — and models delivery as a **graph** rather than a linear checklist. But the
discipline is table stakes; the enforced, evidence-gated, agent-neutral `done` is the point.

## Why it's different

Every coding agent today trusts *itself* to declare work complete — and agents are documented to
over-report "done." In DGE, completion is a **state-machine invariant**: `verified` can only be
minted by running `dge verify` against real evidence, and `done` requires `verified`. There is no
path — not even a "quiet" or automated one — that reaches `done` without proof.

- **Harness-agnostic.** The `dge` CLI is a plain binary and `graph.json` is a plain file, so
  Claude Code, Copilot CLI, and others read and write the *same* delivery graph. DGE rides on top
  of harnesses; it is not itself a harness.
- **Done means proven.** Evidence-gated completion is enforced in the engine, not left to the
  agent, the user, or CI.
- **Persistent, machine-readable graph.** Demands → requirements → tracks → nodes with real
  dependency edges and validation contracts, versioned in `graph.json` — the source of truth
  harnesses treat as ephemeral.
- **Compounds across demands.** Completed work leaves behind evidence and learnings that the next
  intake reads, so the toolset gets smarter with each demand.

> **Built for what no single harness can do.** Because the ground is neutral and completion is
> objective, DGE is designed toward *different agents building and verifying each other's work
> against one source of truth*. That parallel, cross-agent validation is on the
> [roadmap](ROADMAP.md) — the substrate exists today; concurrency-safe storage and a cross-agent
> verify role are what make it fully real.

## 60-second quickstart

Add DGE to any repo and drive one node from demand to evidence-gated `done`. Runs **fully
locally** — no Linear, Azure DevOps, or credentials required.

```bash
# 1. Install the CLI (npm) + the /dge-* slash commands
npm install --save-dev github:rafaelolsr/delivery-graph
npx dge install-skills                 # auto-detects .claude/ or .github/

# 2. Create the canonical graph store
npx dge init --title "My delivery graph"

# 3. Author one demand -> requirement -> track -> node
npx dge add-demand --title "Safer releases" --source "user" --outcome "Every completed node has proof"
npx dge add-requirement --demand DEM-001 --statement "Nodes require validation evidence" --acceptance "Verify fails without evidence" --evidence "Evidence manifest"
npx dge add-track --title "Validation"
npx dge add-node --title "Add evidence gate" --type test --track TRK-validation --requirements REQ-001 --validation "npm test"

# 4. Capture proof and close the node (fails without passing evidence)
npx dge evidence run NODE-001 --satisfies "npm test" -- npm test
npx dge done NODE-001
npx dge status --save
```

Then reload skills in Claude Code (restart the session or `/reload-plugins`). New here? The
[getting-started walkthrough](docs/getting-started.md) explains each step.

> **Prefer no npm at all** (or blocked by a corporate registry)? The **marketplace ships both
> surfaces** — the `/dge-*` skills **and** the `dge` CLI — over git, so there's no npm step to
> authenticate against. Install it, then run `dge init` and the commands above as `dge …` instead
> of `npx dge …`. See [Install options](#install-options).

> **Two surfaces, one plugin.** DGE has the **`dge` CLI** (evidence gates, `init`, `status`,
> `next`, `done`, …) and the **`/dge-*` skills** (the slash commands, which *call* the CLI). The
> CLI is a pure-Node binary with **zero external dependencies**, so it runs straight from a git
> checkout — no `npm install`, no registry. Install **both at once** via the marketplace, or the
> CLI as an npm package.

## How it works

Two loops compound the work.

```text
                                           /dge-execute-graph  (drives the inner loop, on dge next)
                                           |---------------------------------|
                                           v                                 v
Intake -> Requirements -> Graph -> Sync -> Work Node -> Verify -> Review -> done
   ^                                                                          |
   |------------------------------ Compound ----------------------------------|
```

- **Inner loop** — `/dge-execute-graph`, built on the read-only `dge next` accessor — drives
  `Work Node -> Verify -> Review -> done` one ready node at a time, re-querying `dge next` after
  each node so completing one can unblock the next.
- **Outer loop** compounds across demands: every completed node leaves behind validation evidence,
  decisions, reusable patterns, and follow-up context that the next intake reads.

**One-command delivery.** `/dge-deliver` is the conductor: it takes a raw intent through two
judgment gates (Demand Brief, Graph Brief), then runs silent, evidence-gated execution to a
summary — sequential, one node at a time. Use it when you want intent-to-done without driving
each skill by hand.

<details>
<summary><strong>Full workflow diagram</strong></summary>

The manual skill-by-skill flow; `/dge-execute-graph` (built on `dge next`) automates the inner
Work Node → Verify → Review → done cycle inside it.

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

    I --> EG["/dge-execute-graph (harness loop)"]
    EG --> NX["dge next: pick ready node"]
    NX --> O["/dge-work-node"]
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
    V -- yes --> W["Ready to close / dge done"]

    W -. re-query next node .-> NX

    W --> X["/dge-compound"]
    X --> Y[Reusable learning]
    Y --> B
```

</details>

## The skills

| Skill | Purpose | Primary output |
| --- | --- | --- |
| `/dge-intake` | Brainstorm the demand, expose gaps, and create testable requirements | `demands/DEM-<id>/`, `demands/DEM-<id>/requirements/` |
| `/dge-plan-graph` | Break requirements into tracks, nodes, dependencies, validation contracts | `graph.json` |
| `/dge-sync` | Create or update tracker records from graph nodes | Linear issues, ADO tasks, `sync/` |
| `/dge-work-node` | Execute one ready atomic node | Code/docs changes plus node evidence |
| `/dge-verify` | Gate completion on validation evidence | `demands/DEM-<id>/evidence/NODE-<id>/` |
| `/dge-review` | Review implementation, graph state, risks, validation coverage | `reports/` |
| `/dge-compound` | Capture reusable learning for future loops | `learnings/` |
| `/dge-status` | Render the current graph as a board/status view | terminal report, Linear view, markdown |
| `/dge-execute-graph` | Drive the ready queue end to end, evidence-gated, stop-on-failure | code changes, node evidence, updated `graph.json` |
| `/dge-deliver` | Conductor: raw intent → two gates → silent execution → summary | end-to-end delivery |

## Install options

<details open>
<summary><strong>Marketplace install (recommended) — ships both surfaces, no npm</strong></summary>

The marketplace ships the `/dge-*` skills **and** the `dge` CLI (via the plugin's `bin/`, which
the harness puts on your PATH) **globally across all your Claude Code / Copilot CLI projects**. It
clones over git and needs **no `npm install`** — the CLI has zero external dependencies — so it
sidesteps the corporate-npm `E401` problem entirely. You still run `dge init` once in each project
that owns a store.

**Claude Code:**

```text
/plugin marketplace add rafaelolsr/delivery-graph
/plugin install delivery-graph@dge-tools
/reload-plugins
```

Then create the store in each project that owns one:

```bash
dge init --title "My delivery graph"
```

**GitHub Copilot CLI** (the standalone `copilot`, installed via `npm install -g @github/copilot`) —
manage plugins with the `/plugin` slash command **inside the `copilot` prompt** (note the leading
`/`; without it the text is sent to the model as a normal prompt). Open the plugin UI with
`/plugin` and add `rafaelolsr/delivery-graph` from the marketplace UI (inline
`/plugin marketplace add rafaelolsr/delivery-graph` also works if your version supports it).

Both harnesses read the same `.claude-plugin/plugin.json` at the repo root, auto-scan the
top-level `skills/` directory, and put `bin/dge` on PATH. Skills appear namespaced (e.g.
`/delivery-graph:dge-intake`). With the marketplace handling both surfaces, you only need
`dge init` — skip both the npm install and `dge install-skills`.

</details>

<details>
<summary><strong>Alternative: install the CLI as an npm package — one self-contained project</strong></summary>

CLI, skills, and store, all wired into one repo:

```bash
# 1. the CLI (npm)
npm install --save-dev github:rafaelolsr/delivery-graph

# 2. the /dge-* skills into your harness (.claude/ or .github/)
npx dge install-skills --harness claude --symlink

# 3. the canonical graph store
npx dge init --title "My delivery graph"
```

Then reload skills in Claude Code (restart the session or `/reload-plugins`). Pass
`--harness claude|copilot` to choose explicitly, drop `--symlink` to copy instead, or `--force`
to overwrite.

</details>

<details>
<summary><strong>Local DGE development</strong></summary>

For working on DGE itself:

```bash
npm run check
```

This validates the example graph against the JSON Schema and semantic graph rules, renders a
status report, and runs the tests.

</details>

<details>
<summary><strong>Troubleshooting: <code>npm error code E401 Unable to authenticate</code> on a corporate machine</strong></summary>

DGE is a **public MIT repo fetched over git** (`github:rafaelolsr/delivery-graph`) — it is not on
the npm registry and needs no credentials. An `E401` here is **your environment, not this
package**: a corporate `~/.npmrc` (`%USERPROFILE%\.npmrc` on Windows) with `always-auth=true`
and/or a stale registry token forces npm to authenticate *every* request, including this public git
fetch.

> **The cleanest fix is to skip npm entirely:** the
> [marketplace install](#install-options) ships the CLI and skills over git, so there is no npm
> request to authenticate. Use the npm options below only if you specifically want the CLI as a
> project dependency.

Try these in order — each is a single command or project-local file; **none require editing the
corporate global config**:

**1. Point at the public registry for the install** — this is the fix that has worked on a
locked-down corporate Windows machine. Installing globally (`-g`) puts `dge` on your PATH directly,
so you don't need `npx` or a project first:

```bash
npm install -g github:rafaelolsr/delivery-graph --registry=https://registry.npmjs.org/
# then verify:
dge preflight --no-graph
```

Prefer a project-local dev dependency instead? The same override works with `--save-dev` (then use
`npx dge ...`):

```bash
npm install --save-dev github:rafaelolsr/delivery-graph --registry=https://registry.npmjs.org/
```

If it still fails, add `--always-auth=false` to the command — that overrides a corporate
`always-auth=true` for this one install.

**2. Skip npm's registry path entirely — clone + local install** (for when even
`registry.npmjs.org` is unreachable through the corporate proxy; delivers **both** the CLI and, via
`npx dge install-skills`, the skills):

```bash
git clone https://github.com/rafaelolsr/delivery-graph.git
cd delivery-graph && npm install --ignore-scripts
# then, from YOUR project (this path assumes the clone sits beside it):
npm install --save-dev "file:../delivery-graph"
```

**3. Use npm's git resolver** instead of the GitHub-shorthand tarball fetch that some proxies gate:

```bash
npm install --save-dev git+https://github.com/rafaelolsr/delivery-graph.git
```

**4. Inspect what config is forcing auth** (on Windows use `findstr`, not `grep`):

```bash
npm config get always-auth       # true here is the culprit
npm config get registry          # a corporate mirror, not registry.npmjs.org
npm config list -l | findstr auth
```

If `always-auth=true` comes from your user config, override it **per project** — without touching
the corporate global config — by adding an `.npmrc` next to your `package.json` containing
`always-auth=false`.

Once the CLI is installed, add the skills and create the store from your project directory
(`install-skills` auto-detects the harness only when a `.claude/` or `.github/` folder already
exists there, so pass `--harness` explicitly after a global `-g` install):

```bash
dge install-skills --harness claude   # or: --harness copilot
dge init --title "My delivery graph"
```

**Can't run npm at all?** Use the [marketplace install](#install-options) — it ships the `/dge-*`
skills **and** the `dge` CLI over git, with no npm step. Then just `dge init` in each project that
owns a store.

</details>

## CLI reference

By default, `dge` reads and writes `delivery-graph/graph.json`. Pass `--graph <path>` to target
another graph file.

<details>
<summary><strong>Authoring & inspection commands</strong></summary>

```bash
# Create the canonical graph
npx dge init --title "Advisor eval regression gate"

# Intake outputs
npx dge add-demand --title "Safer eval gates" --source "user" --outcome "Block quality regressions before merge"
npx dge add-requirement --demand DEM-001 --statement "PRs fail when eval quality drops" --acceptance "CI fails below threshold" --evidence "CI check output"
npx dge add-gap --type validation --severity blocker --question "What threshold blocks a PR?" --blocks REQ-001
npx dge resolve-gap GAP-001 --resolution "Use the current baseline threshold"

# Plan-graph outputs
npx dge add-track --title "Validation"
npx dge add-node --title "Add eval CI command" --type implementation --track TRK-validation --requirements REQ-001 --validation "npm test"

# Inspect and move work
npx dge status
npx dge status --save
npx dge status --out delivery-graph/reports/status.md
npx dge next
npx dge next --json
npx dge transition NODE-001 in_progress

# Capture evidence
npx dge evidence run NODE-001 --satisfies "npm test" -- npm test
npx dge evidence playwright NODE-001 --satisfies "checkout works" --url http://localhost:3000 --script tests/e2e/checkout.spec.ts

# Validate the whole graph (JSON Schema + semantic checks)
npx dge validate

# Rebuild the folder tree from graph.json / show / retire a demand
npx dge regenerate
npx dge show DEM-001
npx dge remove-demand DEM-001
```

`dge validate` runs both the published JSON Schema and the semantic graph checks: cross
references, unresolved blocker gaps, dependency cycles, dependency readiness, and validation
evidence rules.

</details>

<details>
<summary><strong>Tracker sync (dry-run only)</strong></summary>

```bash
npx dge sync linear --team-id "<linear-team-id>"
npx dge sync ado --org "<ado-org>" --project "<ado-project>" --area "<area-path>" --iteration "<iteration-path>"
```

Tracker sync is **dry-run only** today: it writes a reviewable payload under `delivery-graph/sync/`
(`linear.json`, `ado.json`) and never calls an external API. Both adapters create deterministic
tracker payloads and sync state without requiring credentials.

</details>

<details>
<summary><strong>Autonomous execution loop</strong></summary>

When a plan produces many nodes, you do not have to drive each one by hand. DGE separates the loop
into two layers:

- **`dge next`** is a read-only queue accessor. It returns the next ready node — one whose status
  is `ready` and whose dependencies are all `done` — in graph order, or `null` when none are ready.
  It never implements work.
- **`/dge-execute-graph`** is the skill that drives the loop through your harness's agent: it calls
  `dge next`, implements the node with `/dge-work-node` discipline, captures evidence, and closes it
  through the evidence-gated `dge done`. Completing a node can unblock its dependents, so the queue
  is re-queried after every node.

```bash
npx dge next --json
# => { "next": { "id": "NODE-001", ... }, "ready_count": 1, "done_count": 0, "remaining_count": 3, ... }
```

The loop is deliberately constrained:

- **Sequential, one node at a time.** The canonical graph is a single JSON file with no locking, so
  nodes execute in series.
- **Evidence-gated.** A node only reaches `done` when its validation evidence exists and review has
  no blockers. The loop never fabricates evidence or weakens a validation contract to force a pass.
- **Failure-aware retry.** Transient failures (a validation command that exits non-zero — a flaky
  test, a race, a fixable defect) are retried up to `--max-retries` (default 1). Structural failures
  (a review blocker, genuinely missing evidence, or an incomplete dependency) require a human
  decision, so the loop marks the node `blocked` and stops.
- **Stop-on-failure.** The first node that exhausts its retries or hits a structural failure halts
  the run so you can resolve it and re-run.

Run it from your harness:

```text
/dge-execute-graph
/dge-execute-graph --max 5 --max-retries 2
```

</details>

<details>
<summary><strong>Downstream battle test (proving DGE from a consuming repo)</strong></summary>

DGE should be proven from a real consuming repository, not by creating all runtime artifacts inside
this tool repository. Install DGE as a dev dependency in a separate project and use it to manage one
real delivery demand end to end. The battle test should prove:

- `/dge-intake` turns raw asks into explicit demands, testable requirements, and blocker gaps.
- `/dge-plan-graph` converts requirements into tracks, nodes, dependencies, and validation contracts.
- `/dge-work-node` keeps implementation scoped to one ready node.
- `/dge-verify` blocks completion until evidence exists and writes user-visible proof under
  `delivery-graph/demands/DEM-<id>/evidence/NODE-<id>/verification.md`.
- `/dge-review` produces a durable review report under `delivery-graph/reports/`.

```bash
cd /path/to/consuming-project
npm install --save-dev github:rafaelolsr/delivery-graph
npx dge install-skills
npx dge init --title "Project delivery graph"
npx dge add-demand --title "..." --source "user" --outcome "..."
npx dge add-requirement --demand DEM-001 --statement "..." --acceptance "..." --evidence "..."
npx dge add-track --title "Validation"
npx dge add-node --title "..." --type implementation --track TRK-validation --requirements REQ-001 --validation "..."
npx dge evidence run NODE-001 --satisfies "..." -- <validation-command>
npx dge done NODE-001
npx dge status --save
```

Any friction found in that downstream run becomes DGE backlog. This keeps the plugin repository
focused on the harness while real project work validates the methodology.

</details>

## Reference

### The canonical store

DGE uses a single canonical store in the consuming repository. It's **demand-centric**: a node
belongs to exactly one demand, so its requirements and evidence live under that demand's folder. The
folder tree is a materialized projection of `graph.json` — `dge regenerate` rebuilds it, `dge show
DEM-###` renders one demand's tree, and `dge remove-demand DEM-###` retires a demand (folder + graph
records) in one step.

```text
delivery-graph/
├── graph.json                 # Canonical graph: demands, requirements, tracks, nodes, edges (source of truth)
├── demands/                   # Everything a demand generates lives under demands/DEM-<id>/
│   └── DEM-<id>/
│       ├── DEM-<id>.md        # Raw demand record and clarified demand summary
│       ├── requirements/      # Testable requirements and acceptance criteria (REQ-<id>.md)
│       └── evidence/          # Validation evidence, scoped per node (NODE-<id>/)
│           └── NODE-<id>/      # evidence.json, summary.md, verification.md
├── sync/                      # External tracker ids, sync state, conflict notes
├── reports/                   # Status, review, verification, and delivery reports
└── learnings/                 # Compounded reusable knowledge from completed work
```

Linear, Azure DevOps, GitHub Issues, and markdown boards are **projections** of this store. They can
be updated from the graph, but they should not silently replace the graph as the source of truth.

### Node lifecycle

```text
proposed -> ready -> in_progress -> blocked -> review -> verified -> done
```

A node can only move to `done` when:

1. All dependencies are complete.
2. Required validation has passed.
3. Evidence is attached under `delivery-graph/demands/DEM-<id>/evidence/NODE-<id>/`.
4. Tracker state is synchronized.
5. Review findings are resolved or explicitly deferred.

### Where deliverables land

| Asset | Saved in | Created by |
| --- | --- | --- |
| Demand record | `demands/DEM-<id>/DEM-<id>.md` | `/dge-intake` |
| Requirements | `demands/DEM-<id>/requirements/REQ-<id>.md` | `/dge-intake` |
| Gap register | `graph.json` under `gaps` | `/dge-intake` |
| Canonical graph | `graph.json` | `/dge-plan-graph` |
| Linear sync map | `sync/linear.json` | `/dge-sync` |
| ADO sync map | `sync/ado.json` | `/dge-sync` |
| Node evidence | `demands/DEM-<id>/evidence/NODE-<id>/` | `/dge-verify` |
| Review report | `reports/review-<timestamp>.md` | `/dge-review` |
| Status report | `reports/status-<timestamp>.md` | `/dge-status` |
| Learning note | `learnings/<slug>.md` | `/dge-compound` |

### Tracker mapping

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

### Repository layout

This repository contains the plugin source and shared contracts:

```text
.
├── README.md                  # Project overview and workflow contract
├── plugin.json                # Plugin manifest at root (Copilot CLI reads this first)
├── .claude-plugin/            # plugin.json (copy) + marketplace.json (Claude Code reads these)
├── assets/                    # Plugin icons, banner, diagrams, and public assets
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

> **Two identical plugin manifests, on purpose.** Claude Code reads `.claude-plugin/plugin.json`;
> Copilot CLI checks a **root-level** `plugin.json` first and
> [silently fails to load a plugin whose manifest lives only in `.claude-plugin/`](https://github.com/github/copilot-cli/issues/2010).
> So `plugin.json` and `.claude-plugin/plugin.json` are kept byte-identical (guarded by
> `tests/plugin-manifest.test.mjs`). Neither may add a `skills` field — Copilot auto-scans
> `skills/`, and Claude Code rejects a manifest that declares `skills`.

## Roadmap

DGE is honest about what delivers its "proven, not trusted" claim **today** versus what is the
**destination** — especially parallel, cross-agent validation. See **[ROADMAP.md](ROADMAP.md)** for
what ships today (the harness-neutral engine, engine-enforced `done`, the persistent graph, the
`/dge-deliver` conductor, the compound-learning loop) versus what's coming (concurrency-safe storage
and a cross-agent verify role).
