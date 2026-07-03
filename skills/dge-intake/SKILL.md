---
name: dge-intake
description: Brainstorm a raw demand into a structured demand record, gap register, requirements, and acceptance criteria for Delivery Graph Engineering.
argument-hint: "[raw demand, issue link, meeting note, or feature idea]"
---

# DGE Intake

Use this skill when starting a new piece of work. It is the brainstorm and gap-exposure step for Delivery Graph Engineering.

## Purpose

Turn a raw demand into testable requirements without designing the implementation. The output feeds `/dge-plan-graph`.

## Core rules

1. Ask exactly one question at a time and wait for the answer. When an answer is vague, incomplete, or contradictory, push back with one follow-up before moving on — do not batch questions and do not proceed on a fuzzy answer.
2. For every question, offer your own grounded recommendation and let the user confirm or redirect — interrogate, but never leave the user to invent the answer from nothing.
3. Lock in each concrete answer by restating it before it becomes a requirement.
4. Expose gaps explicitly; do not hide uncertainty in prose.
5. Do not produce work nodes or implementation tracks here.
6. Do not mark the intake ready while blocker gaps are unresolved.
7. Use the canonical DGE IDs: `DEM-###`, `REQ-###`, `GAP-###`.

## Inputs

`#$ARGUMENTS`

If no demand is provided, ask the user what demand, problem, or request they want to shape.

## Preflight: require the DGE CLI

Before writing anything, run the shared preflight (one callable place for every
`dge-*` skill and the `/dge-deliver` conductor). Intake runs before `dge init`, so
skip the graph check:

```bash
dge preflight --no-graph || npx --no-install dge preflight --no-graph
```

If it exits non-zero, **stop** and tell the user to install the DGE CLI first — do not proceed:

> **DGE CLI not found.** The `dge` CLI is a separate npm package from the `/dge-*`
> slash commands. If you installed the skills via the plugin marketplace, you still
> need the CLI — the marketplace ships prompts, not the binary. Install it in this
> project:
> ```bash
> npm install --save-dev github:rafaelolsr/delivery-graph
> ```
> Then re-run `/dge-intake`.

The `dge` CLI is the **only** writer of `delivery-graph/graph.json`. Never hand-write or
hand-edit `graph.json`. If the CLI is missing, the correct action is to install it, not to emulate it.

## Workflow

### 1. Capture the raw demand

Record:

- source
- requester, if known
- problem statement
- desired outcome
- urgency
- constraints
- non-goals
- known stakeholders

### 2. Survey what already exists

Before writing any requirement, read the relevant parts of the existing codebase. Do not design against a blank slate.

- Locate code, modules, config, or prior demands that already address part of this demand (`grep`/`find`/read; check `delivery-graph/demands/` and `requirements/` for overlap).
- For each candidate, decide: **reuse as-is**, **extend**, or **replace with justification**.
- Record findings as a short prior-art note in the demand's problem/constraints capture. If the survey reveals an unknown that blocks scoping, emit it as a `GAP` of `type: scope`.

Default position: the simplest change that reuses existing code beats a new abstraction. If nothing exists to reuse, say so explicitly — that statement is the evidence you looked.

#### Read prior learnings (compound loop)

Past demands leave behind learnings — bugs, gotchas, conventions, and failed
approaches — under `delivery-graph/learnings/`. **Query them before scoping** so
this demand does not re-solve or re-break something already learned:

```bash
dge learnings --about "<a few keywords from this demand>" --json   # or: npx dge learnings ...
dge learnings                                                       # list all when unsure
```

For each relevant learning: read the file it names, and either fold its guidance
into a requirement/constraint or record why it does not apply. This is the read
side of the compound loop that `/dge-compound` feeds — skipping it means the
toolset stops getting smarter with each demand. If there are no learnings yet,
say so; that statement is the evidence you looked.

### 3. Grill the demand

Run a structured `grill-me`: a relentless but constructive interrogation that
exposes every unresolved decision before any requirement is written. This is the
step that turns a fuzzy ask into concrete, testable requirements — do not shortcut it.

#### 3a. Map the decision tree, and show it

Pick the branches relevant to this demand from the list below, then **state the map
to the user** up front: "Here is what I want to pin down. I'll go branch by branch."
As you work, announce which branch you're on so the user can see progress and steer.

- **Problem** — what problem, for whom, and what are they doing today instead?
- **Users / stakeholders** — who is the primary user? who signs off?
- **Scope** — what is explicitly in, and what is explicitly out?
- **Data** — what does this read, write, and display?
- **Actions** — what can a user do, and what happens after each?
- **Edge cases** — empty, loading, error, partial-data, and concurrency states?
- **Constraints** — tech stack, existing systems to respect, performance, a11y?
- **Success** — how do we know it works? what evidence proves it?

#### 3b. Walk each branch, one question at a time

Start with the most foundational branch (usually Problem — everything depends on it).
Within a branch:

1. Ask **one** question and wait.
2. **Offer a recommendation** grounded in the codebase survey and prior learnings:
   *"My recommendation: <answer>. <one-sentence rationale, citing prior art where possible>."*
   Then ask the user to confirm or redirect.
3. If the answer is **vague, incomplete, or contradictory**, push back with one
   concrete follow-up — do not accept it and move on. Useful pushes:
   - "What does that look like specifically?"
   - "Give me a number — how many is 'a lot'?"
   - "What's the worst thing that happens if we get this wrong?"
4. If the answer is **concrete**, lock it in: *"Locked: <decision>."* and move on.
5. If it depends on an earlier decision, flag it: "This depends on <X> — does that still hold?"

Challenge, as you walk, every: unclear problem · vague success criteria · missing
owner · hidden dependency · untestable requirement · scope creep · speculative
feature (actually asked for, or only imagined?) · premature abstraction or
robustness beyond the stated outcome · requirement with no traceable need · everything
defaulting to `must` when it is really `should`/`could` · contradiction · validation
ambiguity · unhandled edge/empty/error state.

Anything the user cannot resolve becomes a `GAP` (Step 4), not a silently-assumed answer.

### 4. Emit gaps

Represent each unresolved issue as:

```yaml
- id: GAP-001
  type: validation
  severity: blocker
  question: "What evidence proves this requirement is complete?"
  blocks: [REQ-001]
  resolution: null
```

### 5. Write requirements

Before writing any requirement, replay the **Confirmed decisions** recap: list
each locked-in decision from Step 3 back to the user and give them a last chance to
correct a misread. Only then convert decisions into requirements — a requirement
must trace to a locked decision, not to an assumed answer.

Each requirement must be testable.

Assign priority honestly: `must` only for what the stated outcome fails without. Push nice-to-haves to `should`/`could`, and record anything deliberately excluded as a `wont` priority or a demand non-goal. Every requirement must trace to a stated outcome; if it cannot, drop it or demote it.

```yaml
- id: REQ-001
  demand_id: DEM-001
  statement: "..."
  priority: should
  acceptance:
    - "..."
  validation:
    method: automated-test
    required_evidence:
      - "..."
```

### 6. Save outputs

Author the canonical store **only through the `dge` CLI** (see CLI contract below). The CLI
writes `delivery-graph/graph.json` and the `demands/` and `requirements/` markdown for you:

- `dge add-demand ...` writes `delivery-graph/demands/DEM-###.md` and the graph entry
- `dge add-requirement ...` writes `delivery-graph/requirements/REQ-###.md` and the graph entry
- `dge add-gap ...` / `dge resolve-gap ...` record gaps in the graph

Do not write `graph.json` yourself. The CLI owns its schema.

## Readiness gate

Return `ready_for_graph: true` only when:

1. The problem is clear.
2. The intended outcome is explicit.
3. Non-goals are named.
4. Constraints are known or marked as gaps.
5. Requirements are testable.
6. Acceptance criteria exist.
7. No blocker gaps remain unresolved.
8. Existing code was surveyed; each requirement either reuses/extends prior art or states why new work is needed.
9. Priorities are differentiated (not everything is `must`) and speculative scope is either justified or recorded as a non-goal / `wont`.
10. Edge cases were probed — empty, error, partial-data, and concurrency states are each either covered by a requirement or explicitly out of scope.
11. Every locked-in decision was replayed to the user (Confirmed decisions recap) and each requirement traces to one.

If blocker gaps remain, stop and report them instead of invoking `/dge-plan-graph`.

## CLI contract

The DGE CLI is required (see Preflight) and is the only writer of the canonical store. Use
`dge` if it is on the PATH (the plugin ships it), otherwise `npx dge`:

```bash
dge add-demand ...       # or: npx dge add-demand ...
dge add-requirement ...
dge add-gap ...
dge resolve-gap ...
```

Never edit `graph.json` by hand. If the CLI is unavailable, stop and install it (Preflight).
