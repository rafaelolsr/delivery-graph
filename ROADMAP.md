# DGE Roadmap

DGE's positioning is **"the neutral ground where any agent's work is proven, not trusted."**
This roadmap is honest about what delivers that claim **today** versus what is the **destination**
the architecture is built for. It exists so the vision — especially parallel, cross-agent
validation — is a documented commitment, not a lost idea.

## Ships today (the substrate)

The foundation for neutral, evidence-gated, multi-agent delivery already exists:

- **Harness-neutral engine.** The `dge` CLI is a plain binary; `graph.json` is a plain file.
  Any agent (Claude Code, Copilot CLI, …) reads and writes the same delivery graph.
- **Engine-enforced `done`.** `verified` is CLI-minted-only (via `dge verify` against evidence
  on disk); `done` requires `verified`. No path — including the conductor's quiet mode — reaches
  `done` without proof. This is the differentiator.
- **Persistent dependency graph** with per-node validation contracts, versioned in `graph.json`.
- **The `/dge-deliver` conductor**: intent → two judgment gates (Demand Brief, Graph Brief) →
  silent, evidence-gated execution → summary. Sequential, one node at a time.
- **Compound learning loop**: `/dge-compound` writes learnings; `/dge-intake` reads them.
- **CLI authoring + record editing**: create and correct demands/requirements/nodes without
  hand-editing `graph.json`.

## The destination: parallel, cross-agent validation

The headline claim — *different agents building and verifying each other's work against one
objective source of truth* — is what no single harness can structurally do. Two pieces turn it
from "built for" into "does":

### 1. Concurrency-safe store (the unlock)

**Problem:** `graph.json` is a single unlocked file. Two agents writing it concurrently corrupt
it, so execution is deliberately sequential today. This blocks the "parallel" half of the pitch
and caps team scale.

**Direction:** split the canonical store so agents don't collide — per-node or per-demand graph
fragments, or a merge-aware format / lightweight locking — while keeping `graph.json` as the
logical source of truth. This is the single highest-leverage item on the roadmap: it makes
"parallel" honest and unlocks team-scale collaboration.

### 2. Cross-agent verify role

**Problem:** today the evidence gate validates *everyone's* output objectively, but there is no
step where a *different agent* adversarially checks a node's work (design smells, missed edge
cases — the things tests can't catch). "Validation" currently means the gate, not agent-checks-agent.

**Direction:** a structured verify role where agent B independently reviews agent A's node
against its contract, distinct from and on top of the objective evidence gate. Combined with (1),
this delivers *"Claude builds, Kimi verifies, the engine proves"* — the full neutral-ground story.

## Validation before features (do this first)

Before building the above, capture the empirical proof the whole pitch rests on:

- **One third-party defect-caught artifact.** On a real repo that is *not* DGE's own, show a
  harness claim `done`, DGE's engine block it on missing evidence, and document the defect it
  would have shipped. See [`docs/proof/`](docs/proof/). This is the make-or-break, pay-for-itself
  first-run demo — self-dogfooding is the weakest possible evidence for a "don't trust
  self-reported completion" tool.

## Known limits (honest)

- **Team scale is not ready.** Single unlocked `graph.json` → concurrent graph edits conflict.
  Sharing is per-repo, per-team, opt-in-by-committing; there is no cross-team/cross-project
  demand sharing (DGE is a one-to-many tool, team-blind by design).
- **The workflow half is commoditized.** Intake→plan→gates→execute is table stakes that native
  harnesses are absorbing. DGE's durable value is the persistent graph + enforced evidence +
  compound learning, not the flow.
- **Adoption risk: ceremony vs. value.** The blocking evidence gate must pay for itself fast; a
  lightweight/express path for trivial changes and a real escape hatch are needed so it isn't
  ripped out on two-line edits.
