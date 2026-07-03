# Getting Started

## Install in a consuming repository

Install DGE where the canonical `delivery-graph/` folder should live:

```bash
npm install --save-dev github:rafaelolsr/delivery-graph
npx dge init --title "My first DGE graph"
```

Inside the DGE source repository, use `npm run dge -- ...` for development. In consuming repositories, use `npx dge ...`.

### Install the skills into your harness

The `npm install` above gives you the `dge` CLI. The `/dge-*` slash commands used in the numbered steps below are a separate surface: your harness must discover the skills that ship at `node_modules/delivery-graph-engineering/skills/`. Install them in one step:

```bash
npx dge install-skills
```

This detects your harness and copies the `dge-*` skill directories into the folder it reads:

- **Claude Code** → `.claude/skills/`
- **GitHub Copilot CLI** → `.github/skills/`

Auto-detection looks for `.claude/` or `.github/` in the repository. Options:

- `--harness claude|copilot` — choose the target explicitly (required if both harness folders exist, or if neither exists yet).
- `--symlink` — symlink the skills instead of copying, so `npm update` keeps them current.
- `--force` — overwrite skills that are already installed.

Re-running is safe: existing skills are skipped unless you pass `--force`.

> The numbered steps below assume the skills are installed. Without them, run the equivalent `npx dge ...` commands shown in each section directly.

## Decide what to commit: your `delivery-graph/` store

DGE does **not** touch your `.gitignore` — what you share is your team's call, not the
tool's. The `delivery-graph/` folder is your store; decide whether it belongs in version
control and paste one of the snippets below into your own `.gitignore` (append it; do not
replace your existing rules).

**Default — ignore the whole store** (nothing shared; each dev's graph is local):

```gitignore
# --- Delivery Graph Engineering ---
delivery-graph/
```

**Share the compound-loop learnings** (recommended for a single team on one repo). The
`learnings/` folder is what `/dge-intake` reads before scoping new work, so sharing it is
how the toolset gets smarter across the team — without sharing the churnier, conflict-prone
rest:

```gitignore
# --- Delivery Graph Engineering ---
# Ignore the runtime store, but SHARE the compound-loop learnings.
delivery-graph/*
!delivery-graph/learnings/
!delivery-graph/learnings/**
```

**Share the whole store** (demands, requirements, graph, evidence, reports) — richest
onboarding and traceability, best for small teams doing serialized work: simply do not
ignore `delivery-graph/` at all, and commit it.

> **Caveat for concurrent teams:** `graph.json` is a single JSON file with no locking, so
> two people authoring the graph at the same time will hit merge conflicts on it. For small
> teams editing serially this is a non-issue; at higher concurrency, coordinate graph edits
> (pull before editing, small commits). This is a per-repo decision — DGE neither knows nor
> tracks team boundaries.

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

## Automate steps 4-6 (optional)

Instead of driving each node by hand, run the autonomous harness loop. `/dge-execute-graph` walks the dependency-aware ready queue (`dge next`), and for each ready node it applies `/dge-work-node`, captures evidence, and closes it through the evidence-gated `dge done` — re-querying after every node so completing one can unblock the next. It is sequential, evidence-gated, and stops on the first failure.

```text
/dge-execute-graph
/dge-execute-graph --max 5 --max-retries 2
```

## Local engine check

Before integrating a tracker, verify the local graph engine:

```bash
npm run check
```

This runs graph validation, renders status, and executes the full test suite.

## Local authoring workflow

The public skills define the agent workflow. The local CLI provides the machine contract those skills can use.

```bash
npx dge init --title "My first DGE graph"
npx dge add-demand --title "Improve delivery" --source "user" --outcome "Validated graph nodes"
npx dge add-requirement --demand DEM-001 --statement "A requirement exists" --acceptance "Requirement is in graph" --evidence "Graph validation passes"
npx dge add-track --title "Implementation"
npx dge add-node --title "Create the first node" --type implementation --track TRK-implementation --requirements REQ-001 --validation "npm run check"
npx dge status --save
```

The default graph path is `delivery-graph/graph.json`. Saved status reports go to `delivery-graph/reports/status-<timestamp>.md`; use `--out <path>` for a stable handoff filename.

## Evidence and verification

Evidence is the core completion gate:

```bash
npx dge evidence run NODE-001 --satisfies "npm run check" -- npm run check
npx dge done NODE-001
npx dge status --save
```

`evidence run` executes the validation command and stores stdout/stderr/exit code under `delivery-graph/demands/DEM-001/evidence/NODE-001/artifacts/`. Passing commands are added to `evidence.json`; failed commands are saved as attempt artifacts but are not counted as evidence. Use `evidence add` for manual approvals or external proof the agent cannot capture. `done` fails until every `validation.required[]` item on the node has matching evidence, writes `verification.md`, writes a review report, blocks on review blockers, and then marks the node `done`.

For browser or UX validation, use Playwright evidence:

```bash
npx dge evidence playwright NODE-001 --satisfies "user can submit the form" --url http://localhost:3000 --script tests/e2e/form.spec.ts --artifacts test-results
```

This captures Playwright output and copies configured screenshots, traces, videos, or reports into the node evidence directory.

## Local review

```bash
npx dge review
```

This writes `delivery-graph/reports/review-<timestamp>.md` and reports graph consistency, blocker gaps, requirement coverage, and missing evidence.

## Linear dry-run sync

```bash
npx dge sync linear --team-id "<linear-team-id>"
```

This writes `delivery-graph/sync/linear.json` with planned issue payloads. It does not call the Linear API yet.

## Azure DevOps dry-run sync

```bash
npx dge sync ado --org "<ado-org>" --project "<ado-project>" --area "<area-path>" --iteration "<iteration-path>"
```

This writes `delivery-graph/sync/ado.json` with planned Task payloads and JSON Patch fields. It does not call the Azure DevOps API yet.
