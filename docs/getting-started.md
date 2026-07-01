# Getting Started

## Install in a consuming repository

Install DGE where the canonical `delivery-graph/` folder should live:

```bash
npm install --save-dev github:rafaelolsr/delivery-graph
npx dge init --title "My first DGE graph"
```

Inside the DGE source repository, use `npm run dge -- ...` for development. In consuming repositories, use `npx dge ...`.

### Install the skills into your harness

The `npm install` above gives you the `dge` CLI. The `/dge-*` slash commands used in the numbered steps below are a separate surface: your harness must discover the skills that ship at `node_modules/delivery-graph-engineering/skills/`. Copy or symlink the `dge-*` skill directories into the skills folder your harness reads:

- **GitHub Copilot CLI** → `.github/skills/`
- **Claude Code** → `.claude/skills/`

For the full copy/symlink commands, verification steps, and caveats (permission prompts and argument passing), see [Install in GitHub Copilot CLI](../README.md#install-in-github-copilot-cli) in the README.

> The numbered steps below assume the skills are installed. Without them, run the equivalent `npx dge ...` commands shown in each section directly.

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

`evidence run` executes the validation command and stores stdout/stderr/exit code under `delivery-graph/evidence/NODE-001/artifacts/`. Passing commands are added to `evidence.json`; failed commands are saved as attempt artifacts but are not counted as evidence. Use `evidence add` for manual approvals or external proof the agent cannot capture. `done` fails until every `validation.required[]` item on the node has matching evidence, writes `verification.md`, writes a review report, blocks on review blockers, and then marks the node `done`.

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
