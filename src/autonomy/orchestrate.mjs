// Stage 6 — the orchestrator façade (S6.4).
//
// One entry point that runs the whole autonomous-systems loop from a BARE GOAL:
//   goal → decompose → discover capabilities → construct organization →
//   run the self-reorganizing supervisor → report.
//
// Humans specify the goal + constraints + the capability registry + candidates (the
// "what" and the resources); the SYSTEM decides the subgoals, the agents, the topology,
// and reorganizes itself when an agent underperforms — all through the governance gates.
// Deterministic and offline: the executor is injected (a sim in tests).

import { makeGoal, decomposeGoal, discoverCapabilities } from "./goal.mjs";
import { constructOrganization, describeOrganization } from "./organization.mjs";
import { runSupervisor } from "./supervisor.mjs";
import { buildGovernanceReport } from "../governance/report.mjs";
import { admitLearning } from "./learning.mjs";

// orchestrateGoal: the full Stage-6 pipeline. Returns everything needed to explain what
// the system decided and did — subgoals, the constructed org, the reorg ledger, whether
// the goal was met, and a human report.
export function orchestrateGoal({
  goal, registry = [], candidates = [], strongerCandidates = [],
  executor, decomposer, maxRounds = 3, threshold = 0.5, policy = {}, approvals = [],
  heldOutSubgoals = null, minMargin = 0.05,
  learningStore = null, scope = "org", organization = null, project = null, repository = null,
  at = null
} = {}) {
  // Always normalize through makeGoal so defaults (successCriteria, constraints, …) are
  // present even when the caller passes a bare {id, statement}. Skipping this left
  // optional arrays undefined and broke the decomposer.
  const g = makeGoal(goal);

  // 1. Decompose the bare goal into a subgoal graph.
  const subgoals = decomposeGoal(g, decomposer ? { decomposer } : {});

  // 2. Discover which capabilities the environment can actually provide.
  const discovery = discoverCapabilities(subgoals, registry);
  if (!discovery.satisfiable) {
    return {
      goal: g, subgoals, discovery,
      organization: null, ledger: [], goalMet: false,
      escalated: false,
      report: buildGovernanceReport({ intent: { outcome: g.statement, success_criteria: g.successCriteria, constraints: g.constraints }, graphVersion: 0 }),
      reason: `unsatisfiable: no provider for ${discovery.gaps.join(", ")}`
    };
  }

  // 3. Construct the agent organization (agents + topology) — the system's own design.
  const org0 = constructOrganization({ goal: g, subgoals, discovery, candidates, at });

  // 4. Run the governed self-reorganizing supervisor loop. When a held-out set is
  //    provided, reorg retention is decided by a counterfactual A/B on held-out work
  //    (the system does not grade its own homework).
  const run = runSupervisor({
    goal: g, subgoals, org: org0, executor, strongerCandidates,
    maxRounds, threshold, policy, approvals, heldOutSubgoals, minMargin, at
  });
  run.orgRaw = run.org; run.threshold = threshold;

  const escalated = run.ledger.some((l) => l.action === "escalated");

  // 4b. Close the learning loop: admit this run's PROVEN, sanitized outcomes to the org
  //     store (gated), so the next run's allocation can read them. Only runs with a store
  //     configured and a proven Result contribute — unproven runs never influence history.
  let learning = null;
  if (learningStore) {
    learning = admitLearning({ run, store: learningStore, scope, organization, project, repository, at });
  }

  // 5. Human report: what was requested, the constructed org, the adaptations, the result.
  const report = buildGovernanceReport({
    intent: { outcome: g.statement, success_criteria: g.successCriteria, constraints: g.constraints },
    graphVersion: run.org.version ?? 0,
    allocations: run.org.agents.map((a) => ({ node_id: a.id, selected: a.model, rationale: a.allocationRationale, confidence: null, expected: null })),
    adaptations: run.ledger.filter((l) => l.action === "reorganized" || l.action === "rolled_back" || l.action === "escalated")
      .map((l) => ({ id: l.proposalId ?? `round-${l.round}`, kind: l.action, state: l.action, decision: l.action, decisionMaker: l.action === "escalated" ? null : "process:mutation-gate", resultAfterApplication: l.action })),
    result: { proven: run.goalMet, evidence: run.finalEvals.flatMap((e) => e.evidence ?? []), verdict: run.goalMet ? "goal met" : "goal not met" },
    learnings: []
  });

  return {
    goal: g, subgoals, discovery,
    organization: describeOrganization(run.org),
    orgRaw: run.org,
    ledger: run.ledger,
    goalMet: run.goalMet,
    escalated,
    rounds: run.rounds,
    learning,
    report
  };
}
