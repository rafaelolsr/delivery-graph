// Graph mutation controller (M6).
//
// Turns an intervention into a versioned, governed mutation. Every structural change:
//   - is expressed as an adaptation PROPOSAL with the spec's full record,
//   - passes the mutation gate (authority + coverage + reversibility + rollback),
//   - if auto-admissible, is APPLIED, producing a NEW graph version + transition record,
//   - can be ROLLED BACK, and is EVALUATED after application (retained | rolled_back).
//
// Authority-expanding or intent-changing mutations can NEVER auto-apply — the gate
// returns REQUIRES_HUMAN_JUDGMENT and the proposal parks in `escalated`.

import { mutationGate, GATE_VERDICTS } from "./gates.mjs";

// Proposal lifecycle (spec state machine).
export const PROPOSAL_STATES = Object.freeze({
  PROPOSED: "proposed",
  EVALUATED: "evaluated",
  APPROVED: "approved",
  REJECTED: "rejected",
  ESCALATED: "escalated",
  APPLIED: "applied",
  EVALUATED_AFTER_APPLICATION: "evaluated_after_application",
  RETAINED: "retained",
  ROLLED_BACK: "rolled_back"
});

// The reversible, in-policy mutation kinds the spec lists as automatically admissible.
export const AUTO_ADMISSIBLE_KINDS = Object.freeze(new Set([
  "split_task", "merge_tasks", "add_investigation", "reorder", "add_dependency",
  "remove_dependency", "reassign_executor", "change_model", "change_tools",
  "change_context", "replace_proof_equal_strength"
]));

// makeProposal: the full adaptation-proposal record from the spec.
export function makeProposal({
  id, triggeringObservation, kind, change,
  expectedBenefit = null, expectedCost = null, riskClass = "low",
  validationImpact = null, rollback = null,
  preservesRequirementCoverage = true, preservesProof = true, at = null
} = {}) {
  if (!id) throw new Error("a proposal requires an id");
  if (!kind) throw new Error("a proposal requires a kind");
  return {
    id, state: PROPOSAL_STATES.PROPOSED,
    triggeringObservation, kind, change,
    expectedBenefit, expectedCost, riskClass,
    validationImpact, rollback,
    preservesRequirementCoverage, preservesProof,
    decision: null, decisionMaker: null, resultAfterApplication: null,
    history: [{ state: PROPOSAL_STATES.PROPOSED, at }], at
  };
}

function transition(proposal, state, extra = {}, at = null) {
  return { ...proposal, state, ...extra, history: [...proposal.history, { state, at }] };
}

// Evaluate a proposal through the mutation gate. Returns a new proposal in state
// evaluated→approved | rejected | escalated. Never mutates the graph here.
export function evaluateProposal(proposal, { policy = {}, approvals = [], at = null } = {}) {
  const gate = mutationGate(
    { id: proposal.id, change: proposal.change, preservesRequirementCoverage: proposal.preservesRequirementCoverage, preservesProof: proposal.preservesProof, rollback: proposal.rollback },
    { policy, approvals, at }
  );
  const evaluated = transition(proposal, PROPOSAL_STATES.EVALUATED, { gate }, at);

  if (gate.verdict === GATE_VERDICTS.PASS && AUTO_ADMISSIBLE_KINDS.has(proposal.kind)) {
    return transition(evaluated, PROPOSAL_STATES.APPROVED, { decision: "auto-approved", decisionMaker: gate.evaluator }, at);
  }
  if (gate.verdict === GATE_VERDICTS.REQUIRES_HUMAN_JUDGMENT) {
    return transition(evaluated, PROPOSAL_STATES.ESCALATED, { decision: "needs human approval", decisionMaker: null }, at);
  }
  return transition(evaluated, PROPOSAL_STATES.REJECTED, { decision: gate.explanation, decisionMaker: gate.evaluator }, at);
}

// Apply an APPROVED proposal via an injected applier(graph, proposal) -> newGraph.
// Bumps the graph version and records the transition. The applier is injected so this
// controller stays decoupled from the concrete graph store.
export function applyProposal(proposal, graph, applier, { at = null } = {}) {
  if (proposal.state !== PROPOSAL_STATES.APPROVED) {
    throw new Error(`cannot apply a proposal in state ${proposal.state}; must be approved`);
  }
  const previousVersion = graph.version ?? 0;
  const newGraph = applier(graph, proposal);
  newGraph.version = previousVersion + 1;
  newGraph.transition = { proposalId: proposal.id, from: previousVersion, to: newGraph.version, kind: proposal.kind, at };
  const applied = transition(proposal, PROPOSAL_STATES.APPLIED, { appliedVersion: newGraph.version, previousVersion }, at);
  return { proposal: applied, graph: newGraph, previousGraph: graph };
}

// Evaluate the outcome AFTER application; retain if it helped, else roll back.
// `observedBenefit` compares reality to expectedBenefit. rollbacker(previousGraph)
// restores the prior version (its existence was gate-required).
export function evaluateAfterApplication(applied, { observedBenefit, previousGraph, rollbacker = (g) => g, at = null } = {}) {
  const evaluated = transition(applied, PROPOSAL_STATES.EVALUATED_AFTER_APPLICATION, { observedBenefit }, at);
  const helped = observedBenefit !== null && observedBenefit > 0;
  if (helped) {
    return { proposal: transition(evaluated, PROPOSAL_STATES.RETAINED, { resultAfterApplication: "retained" }, at), graph: null };
  }
  // A failed adaptation rolls back to the preserved previous version.
  const restored = rollbacker(previousGraph);
  return { proposal: transition(evaluated, PROPOSAL_STATES.ROLLED_BACK, { resultAfterApplication: "rolled_back" }, at), graph: restored };
}
