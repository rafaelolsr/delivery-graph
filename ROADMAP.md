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
- **Compound learning loop**: `/dge-compound` writes learnings; `/dge-design` reads them.
- **CLI authoring + record editing**: create and correct demands/requirements/nodes without
  hand-editing `graph.json`.

## The destination: autonomous, cross-agent engineering

The headline claim — *different agents building and verifying each other's work against one
objective source of truth* — is what no single harness can structurally do. Two pieces turn it
from "built for" into "does":

### 1. Concurrency-safe store (local substrate implemented)

**Implemented:** local writes use an exclusive store lock, atomic replacement, revision
compare-and-swap, and bounded retry. Parallel harness tests prove concurrent node results persist
without lost updates or graph corruption.

**Remaining:** isolate agent code changes in separate worktrees, add durable claims/leases and
crash recovery, and define a distributed-store strategy for agents running on different hosts.
The local lock protects `graph.json`; it does not isolate concurrent edits to the consuming repo.

### 2. Cross-agent verify role

**Policy substrate now implemented:** `src/agentic-verification.mjs` classifies node risk,
selects an independent verifier, scopes its context to contract + diff + evidence, and fails
closed unless the verifier returns an explicit structured pass. Standard-risk work may reuse a
harness in a fresh run; high-risk work requires a different harness. `dge verification-plan`
exposes the decision to conductors.

**Remaining integration:** wire this policy into the production execution control plane so every
builder completion automatically dispatches its planned verifier and persists the run identity,
verdict, and repair history before `done`. This delivers *"Claude builds, Kimi verifies, the
engine proves"* — the full neutral-ground story.

## Validation before features (do this first)

Before building the above, capture the empirical proof the whole pitch rests on:

- **One third-party defect-caught artifact.** On a real repo that is *not* DGE's own, show a
  harness claim `done`, DGE's engine block it on missing evidence, and document the defect it
  would have shipped. See [`docs/proof/`](docs/proof/). This is the make-or-break, pay-for-itself
  first-run demo — self-dogfooding is the weakest possible evidence for a "don't trust
  self-reported completion" tool.

## Known limits (honest)

- **Team scale is not ready.** Local graph writes are concurrency-safe, but agent code changes
  are not worktree-isolated and the lock is not distributed across hosts. Sharing remains
  per-repo and there is no cross-team/cross-project demand coordination.
- **The workflow half is commoditized.** Design→plan→gates→execute is table stakes that native
  harnesses are absorbing. DGE's durable value is the persistent graph + enforced evidence +
  compound learning, not the flow.
- **Adoption risk: ceremony vs. value.** The blocking evidence gate must pay for itself fast; a
  lightweight/express path for trivial changes and a real escape hatch are needed so it isn't
  ripped out on two-line edits.
