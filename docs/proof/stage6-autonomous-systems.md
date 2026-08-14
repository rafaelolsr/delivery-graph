# Stage 6 — Autonomous Systems Engineering (proof)

**`npm run check` exit 0 · 543/543 tests.** The system now takes a **bare goal** and
constructs, executes, and **reorganizes its own agent organization** — under the
existing governance substrate. This is the "agents engineer agents" inversion: humans
specify the goal + constraints + resources; the system decides the subgoals, agents,
topology, and restructuring.

## What became autonomous (beyond Stage 5)

| Capability | Module | Behavior |
|-----------|--------|----------|
| Goal decomposition | `src/autonomy/goal.mjs` | bare goal → subgoal graph (injectable decomposer, deterministic) |
| Capability discovery | `src/autonomy/goal.mjs` | matches required capabilities against an explicit registry; missing → surfaced gap, never hidden |
| Agent synthesis | `src/autonomy/organization.mjs` | creates agent specs with **least-privilege** permissions (policy-granted, never self-requested) |
| Topology construction | `src/autonomy/organization.mjs` | supervisor + agents; edges **derived** from subgoal deps, not hardcoded A→B→C |
| Self-reorganization | `src/autonomy/supervisor.mjs` | replaces an underperforming agent **through the mutation gate**; retains if it helps, rolls back if not |
| Orchestration | `src/autonomy/orchestrate.mjs` + `dge orchestrate` | one entry point: goal → org → execute → reorganize → report |

## The golden Stage-6 scenario (deterministic, offline)

`tests/autonomy/golden-orchestrate.test.mjs`:

1. Bare goal: *"Reduce cloud infrastructure cost by 20% without degrading reliability."*
2. The system **decomposes** it: investigate → analyze → implement → prove (always ends in independent proof — the org can't self-certify).
3. It **constructs its own org**: 4 agents, each model-allocated, with a derived topology.
4. Execution finds the `code_change` agent **underperforming** (quality 0.2).
5. The supervisor **reorganizes itself**: proposes a replacement → mutation gate confirms it is reversible, coverage-preserving, and grants no new authority → auto-approved → applied → re-evaluated (+0.70 benefit) → **retained**.
6. The **goal is met**; the report explains the whole sequence.

Negative cases proven: an unsatisfiable goal builds **no** org and surfaces the gap; a persistently weak agent triggers a **rollback**, not an infinite loop; the loop is deterministic (no wall clock / randomness).

## Governed, observable, constrained (the essay's requirement)

Every restructuring flows through the Stage-5 substrate — nothing bypasses it:

- **No self-granted authority.** A reorg that would expand permissions/topology is a non-human self-expansion → **REJECTED** by `policy.mjs`; only a human actor can escalate an authority-expanding org change (`proposeAddCapability` + gate).
- **Reversible + coverage-preserving.** A replacement must cover the same capabilities and carry a rollback; the mutation gate enforces it.
- **Rollback on regression.** A reorg that doesn't improve quality is reverted (post-adaptation evaluation), so the system never thrashes.
- **Least privilege.** A synthesized agent gets only the permissions its capabilities justify, granted by policy.

## Where this sits on your progression

> 2027 Human engineers agent systems (Stage 5 — DGE governed adaptive control plane)
> 20?? **Agents engineer agents** (Stage 6 — this)

The human now specifies the **goal and what "good" means**; the system engineers the
organization. Prompt/context/loop/agent choices become internal optimization performed
by the supervisor, within bounds it cannot widen on its own.

## Honest limitations

- **Deterministic sim executor.** Agents execute via an injected fake (quality map) so
  the loop is testable and offline. A real harness adapter (spawning live sub-agents) is
  a pluggable executor, deliberately not wired into CI (the spec's non-goal: don't couple
  the core to one harness / don't call paid models in tests).
- **Keyword decomposer.** The default goal→subgoal decomposer is a legible rule set, not
  a model. It is injectable, so a model-backed decomposer drops in without engine change.
- **Minimal covering roster.** One agent per capability; richer topologies (redundancy,
  competing agents, hierarchical sub-teams) are future work on the same substrate.

## Reproduce

```bash
npm run check                                   # 543/543, exit 0
node --test tests/autonomy/*.test.mjs
dge orchestrate "Reduce cloud cost by 20% without degrading reliability" --config <registry+candidates+quality.json>
```
