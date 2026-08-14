// Stage 6 — the self-reorganizing supervisor loop (S6.3).
//
// This is the runtime organizational intelligence: the supervisor EXECUTES the org
// (via a deterministic, injected executor — no live paid agents), OBSERVES each agent's
// output, EVALUATES it, and RESTRUCTURES the organization when an agent underperforms —
// all THROUGH the existing governance substrate. A reorganization is a mutation: it goes
// through the mutation gate, must be reversible + coverage-preserving, rolls back on eval
// regression, and any authority/topology EXPANSION escalates to a human.
//
// The loop is bounded and deterministic: a fixed max number of reorg rounds, an injected
// executor, and injected timestamps, so it is fully testable offline and never loops
// forever (reuses the M6 "no infinite loop" rule).

import { evaluateProposal, applyProposal, evaluateAfterApplication, makeProposal, PROPOSAL_STATES } from "../governance/mutation.mjs";
import { coversAllCapabilities, synthesizeAgent } from "./organization.mjs";

// Evaluate one agent's simulated output. `executor(agent, subgoal) -> { evidence,
// quality }` is injected; quality in [0,1]. An agent is underperforming when its quality
// is below the threshold with no improvement — the org-level analog of M6's stall.
export function evaluateAgents(org, subgoals, executor, { threshold = 0.5 } = {}) {
  const results = [];
  for (const agent of org.agents) {
    const served = subgoals.filter((s) => s.requiredCapabilities.includes(agent.role));
    let total = 0, n = 0, evidence = [];
    for (const sg of served) {
      const out = executor(agent, sg);
      total += out.quality; n += 1;
      if (out.evidence) evidence.push(out.evidence);
    }
    const quality = n ? total / n : null;
    results.push({ agent: agent.id, role: agent.role, quality, evidence, underperforming: quality !== null && quality < threshold });
  }
  return results;
}

// Propose replacing an underperforming agent with a stronger candidate. This is a
// REVERSIBLE, coverage-preserving reorg (the replacement covers the same capability), so
// it is auto-admissible IF the mutation gate passes. Replacing an agent does NOT expand
// permissions (the new agent gets the same least-privilege grant), so it never escalates
// on authority — but ADDING a capability the org didn't have would (tested separately).
export function proposeReplaceAgent({ org, subgoals, underperformer, strongerCandidates, at = null }) {
  const old = org.agents.find((a) => a.id === underperformer.agent);
  const replacement = synthesizeAgent({
    id: `${old.id}-v2`, role: old.role, capabilities: old.capabilities,
    providers: old.tools, candidates: strongerCandidates, risk: "high"
  });
  // Coverage is preserved because the replacement serves the same capabilities.
  const wouldCover = coversAllCapabilities(
    { ...org, agents: org.agents.map((a) => (a.id === old.id ? replacement : a)) },
    subgoals
  ).covered;
  const proposal = makeProposal({
    id: `REORG-${old.id}`,
    kind: "reassign_executor", // reversible, in the auto-admissible set
    triggeringObservation: underperformer,
    change: {
      actor: "supervisor/autonomy",
      reversible: true,
      // replacing like-for-like grants no new permission → no expansion
      effects: { expandsPermissions: !isSubset(replacement.permissions, old.permissions) }
    },
    preservesRequirementCoverage: wouldCover,
    preservesProof: true,
    rollback: { restoreAgent: old }
  });
  // makeProposal has a fixed shape and drops extra keys, so return the synthesized
  // replacement alongside it rather than smuggling it into the proposal record.
  return { proposal, replacement, replacedId: old.id };
}

// Add a NEW capability the org lacks — this EXPANDS the topology/authority surface and
// therefore must escalate to a human (it introduces an agent with new permissions).
export function proposeAddCapability({ org, capability, candidates, at = null }) {
  const agent = synthesizeAgent({ id: `AGENT-${capability}`, role: capability, capabilities: [capability], candidates });
  return makeProposal({
    id: `EXPAND-${capability}`,
    kind: "add_investigation",
    change: {
      actor: "supervisor/autonomy",
      reversible: true,
      // introducing a NEW authority surface the org didn't have → expansion → human gate
      effects: { expandsPermissions: true }
    },
    preservesRequirementCoverage: true,
    preservesProof: true,
    rollback: { removeAgent: agent.id }
  });
}

// Run the governed self-reorganization loop. Returns the final org + a full ledger of
// every reorg (proposed → gate verdict → applied/escalated/rejected → retained/rolled_back).
export function runSupervisor({
  goal, subgoals, org, executor, strongerCandidates = [],
  maxRounds = 3, threshold = 0.5, policy = {}, approvals = [], at = null
}) {
  let current = org;
  const ledger = [];
  let round = 0;

  while (round < maxRounds) {
    round += 1;
    const evals = evaluateAgents(current, subgoals, executor, { threshold });
    const worst = evals.filter((e) => e.underperforming).sort((a, b) => a.quality - b.quality)[0];
    if (!worst) {
      ledger.push({ round, action: "none", reason: "all agents meet the quality threshold", evals });
      break; // healthy — stop (no thrashing)
    }

    // Propose a governed replacement for the worst agent.
    const { proposal, replacement, replacedId } = proposeReplaceAgent({ org: current, subgoals, underperformer: worst, strongerCandidates, at });
    const evaluated = evaluateProposal(proposal, { policy, approvals, at });

    if (evaluated.state === PROPOSAL_STATES.ESCALATED) {
      ledger.push({ round, action: "escalated", proposalId: evaluated.id, worst: worst.agent, gate: evaluated.gate });
      break; // needs a human — stop and surface it
    }
    if (evaluated.state !== PROPOSAL_STATES.APPROVED) {
      ledger.push({ round, action: "rejected", proposalId: evaluated.id, gate: evaluated.gate });
      break;
    }

    // Apply: swap the underperforming agent for its replacement, versioning the org.
    const applier = (orgState) => ({
      ...orgState,
      agents: orgState.agents.map((a) => (a.id === replacedId ? replacement : a))
    });
    const { proposal: applied, graph: nextOrg, previousGraph } = applyProposal(evaluated, current, applier, { at });

    // Re-evaluate after application: did the replacement actually help?
    const afterEvals = evaluateAgents(nextOrg, subgoals, executor, { threshold });
    const afterWorst = afterEvals.find((e) => e.agent === replacement.id);
    const observedBenefit = afterWorst ? (afterWorst.quality - worst.quality) : -1;
    const { proposal: settled, graph: rolledBack } = evaluateAfterApplication(applied, { observedBenefit, previousGraph, rollbacker: (g) => g, at });

    if (settled.state === PROPOSAL_STATES.RETAINED) {
      current = nextOrg;
      ledger.push({ round, action: "reorganized", replaced: worst.agent, with: replacement.id, observedBenefit, version: nextOrg.version });
    } else {
      current = rolledBack ?? previousGraph;
      ledger.push({ round, action: "rolled_back", agent: worst.agent, observedBenefit });
      break; // the reorg didn't help and was reverted — stop rather than thrash
    }
  }

  const finalEvals = evaluateAgents(current, subgoals, executor, { threshold });
  const goalMet = finalEvals.every((e) => e.quality === null || e.quality >= threshold);
  return { org: current, ledger, finalEvals, goalMet, rounds: round };
}

function isSubset(a, b) {
  const set = new Set(b);
  return a.every((x) => set.has(x));
}
