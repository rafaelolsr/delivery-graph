// Evaluation and accountability gates (M3 — governance spine).
//
// Seven gates from the spec, each a pure function that produces the standard gate
// evaluation record so every verdict is explainable and replayable:
//
//   { gate, subject, evaluator, inputs, verdict, explanation, independence, at }
//
// Verdicts use the spec's recommended enum. Gates only gate MEANINGFUL state
// transitions; they never fire per micro-action. `at` is injected by the caller
// (timestamps are not generated here) so evaluations are deterministic and replayable.

import { evaluateAuthority, AUTHORITY_DECISIONS, isHumanActor } from "./policy.mjs";

export const GATE_VERDICTS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  CONTRACT_INVALIDATED: "CONTRACT_INVALIDATED",
  REQUIRES_HUMAN_JUDGMENT: "REQUIRES_HUMAN_JUDGMENT"
});

export const GATES = Object.freeze({
  INTENT: "intent",
  SPEC: "spec",
  ALLOCATION: "allocation",
  MUTATION: "mutation",
  TASK_PROVE: "task_prove",
  DEMAND_PROVE: "demand_prove",
  LEARNING: "learning"
});

function record({ gate, subject, evaluator, inputs, verdict, explanation, independence = null, at = null }) {
  return { gate, subject, evaluator, inputs, verdict, explanation, independence, at };
}

// --- Intent gate ------------------------------------------------------------
// Checks outcome clarity, measurable success, conflicting goals, authority,
// hard constraints, required human judgment.
export function intentGate(intent = {}, { evaluator = "process:intent-gate", at = null } = {}) {
  const problems = [];
  if (!intent.outcome || String(intent.outcome).trim() === "") problems.push("outcome is not stated");
  if (!Array.isArray(intent.success_criteria) || intent.success_criteria.length === 0) {
    problems.push("no measurable success criteria");
  }
  if (Array.isArray(intent.conflicts) && intent.conflicts.length > 0) {
    problems.push(`conflicting goals: ${intent.conflicts.join("; ")}`);
  }
  const verdict = problems.length === 0 ? GATE_VERDICTS.PASS : GATE_VERDICTS.FAIL;
  return record({
    gate: GATES.INTENT, subject: intent.id ?? "intent", evaluator,
    inputs: { outcome: !!intent.outcome, success_criteria: intent.success_criteria?.length ?? 0 },
    verdict, explanation: problems.length ? problems.join("; ") : "outcome clear and measurable", at
  });
}

// --- Spec admission gate ----------------------------------------------------
// Every executable task needs a validation contract + evidence path; deps consistent;
// result-level proof present.
export function specGate(spec = {}, { evaluator = "process:spec-gate", at = null } = {}) {
  const nodes = spec.nodes ?? [];
  const problems = [];
  for (const n of nodes) {
    const executable = n.type !== "research" && n.type !== "docs";
    if (executable && !(n.validation?.required?.length)) {
      problems.push(`${n.id} has no validation contract`);
    }
    for (const dep of n.depends_on ?? []) {
      if (!nodes.some((m) => m.id === dep)) problems.push(`${n.id} depends on missing ${dep}`);
    }
  }
  const covered = new Set(nodes.flatMap((n) => n.requirement_ids ?? []));
  for (const req of spec.requirement_ids ?? []) {
    if (!covered.has(req)) problems.push(`requirement ${req} is not covered by any node`);
  }
  const verdict = problems.length === 0 ? GATE_VERDICTS.PASS : GATE_VERDICTS.FAIL;
  return record({
    gate: GATES.SPEC, subject: spec.id ?? "spec", evaluator,
    inputs: { nodes: nodes.length, requirements: spec.requirement_ids?.length ?? 0 },
    verdict, explanation: problems.length ? problems.join("; ") : "every executable task has a contract; deps consistent; requirements covered", at
  });
}

// --- Allocation gate --------------------------------------------------------
// Candidate eligibility, policy compliance, verifier independence, explainable selection.
export function allocationGate(allocation = {}, { evaluator = "process:allocation-gate", at = null } = {}) {
  const problems = [];
  if (!allocation.selected) problems.push("no execution identity selected");
  if (!allocation.rationale) problems.push("selection is not explained (no rationale)");
  if (allocation.eligible === false) problems.push("selected candidate is ineligible");
  if (allocation.verifierIndependenceRequired && allocation.verifier === allocation.selected) {
    problems.push("verifier is not independent of the executor");
  }
  const verdict = problems.length === 0 ? GATE_VERDICTS.PASS : GATE_VERDICTS.FAIL;
  return record({
    gate: GATES.ALLOCATION, subject: allocation.node_id ?? "allocation", evaluator,
    inputs: { selected: allocation.selected ?? null, eligible: allocation.eligible ?? null },
    verdict, explanation: problems.length ? problems.join("; ") : "eligible, policy-compliant, independent, explainable", at
  });
}

// --- Mutation gate ----------------------------------------------------------
// Intent preservation, validation-coverage preservation, authority, reversibility,
// rollback, expected benefit. Delegates the authority decision to the policy engine.
export function mutationGate(mutation = {}, { policy = {}, approvals = [], evaluator = "process:mutation-gate", at = null } = {}) {
  const problems = [];
  const change = mutation.change ?? {};
  const authority = evaluateAuthority(change, { approvals });

  if (authority.decision === AUTHORITY_DECISIONS.REJECTED) {
    return record({
      gate: GATES.MUTATION, subject: mutation.id ?? "mutation", evaluator,
      inputs: { reversible: change.reversible, actor: change.actor },
      verdict: GATE_VERDICTS.FAIL, explanation: `authority rejected: ${authority.reasons.join("; ")}`, at
    });
  }
  if (authority.decision === AUTHORITY_DECISIONS.REQUIRES_HUMAN) {
    return record({
      gate: GATES.MUTATION, subject: mutation.id ?? "mutation", evaluator,
      inputs: { reversible: change.reversible, actor: change.actor },
      verdict: GATE_VERDICTS.REQUIRES_HUMAN_JUDGMENT, explanation: `needs human approval: ${authority.reasons.join("; ")}`, at
    });
  }
  // Auto-applicable authority-wise; now the structural preservation checks.
  if (mutation.preservesRequirementCoverage === false) problems.push("requirement coverage not preserved");
  if (mutation.preservesProof === false) problems.push("proof coverage not preserved");
  if (mutation.rollback == null) problems.push("no rollback path");
  const verdict = problems.length === 0 ? GATE_VERDICTS.PASS : GATE_VERDICTS.FAIL;
  return record({
    gate: GATES.MUTATION, subject: mutation.id ?? "mutation", evaluator,
    inputs: { reversible: change.reversible, authority: authority.decision },
    verdict, explanation: problems.length ? problems.join("; ") : "in-intent, coverage+proof preserved, reversible with rollback", at
  });
}

// --- Task Prove gate --------------------------------------------------------
// Validation-contract satisfaction, evidence authenticity/relevance, executor/verifier
// independence, no unresolved failure, no weakened contract.
export function taskProveGate(task = {}, { evaluator = "process:task-prove-gate", at = null } = {}) {
  const problems = [];
  const missing = (task.contract ?? []).filter((item) => !(task.satisfied ?? []).includes(item));
  if (missing.length) {
    return record({
      gate: GATES.TASK_PROVE, subject: task.node_id ?? "task", evaluator,
      inputs: { contract: task.contract?.length ?? 0, satisfied: task.satisfied?.length ?? 0 },
      verdict: GATE_VERDICTS.INSUFFICIENT_EVIDENCE, explanation: `unsatisfied contract items: ${missing.join("; ")}`, at
    });
  }
  if (task.contractWeakened) {
    return record({
      gate: GATES.TASK_PROVE, subject: task.node_id ?? "task", evaluator,
      inputs: {}, verdict: GATE_VERDICTS.CONTRACT_INVALIDATED,
      explanation: "the validation contract was weakened to manufacture a pass", at
    });
  }
  if (task.independenceRequired && task.verifier && task.verifier === task.executor) {
    problems.push("executor self-approved where independence is required");
  }
  if (task.unresolvedFailure) problems.push("an unresolved failure remains");
  const verdict = problems.length === 0 ? GATE_VERDICTS.PASS : GATE_VERDICTS.FAIL;
  return record({
    gate: GATES.TASK_PROVE, subject: task.node_id ?? "task", evaluator,
    inputs: { contract: task.contract?.length ?? 0, independent: task.executor !== task.verifier },
    verdict, explanation: problems.length ? problems.join("; ") : "contract satisfied by authentic evidence, independently verified",
    independence: task.independenceRequired ? { required: true, satisfied: task.verifier !== task.executor } : null, at
  });
}

// --- Demand Prove gate ------------------------------------------------------
// A Result requires the original outcome achieved + hard constraints preserved +
// local successes composing into a valid overall Result — NOT merely all tasks done.
export function demandProveGate(demand = {}, { evaluator = "process:demand-prove-gate", at = null } = {}) {
  const problems = [];
  const tasks = demand.tasks ?? [];
  const allTasksProven = tasks.length > 0 && tasks.every((t) => t.proven === true);
  if (!allTasksProven) problems.push("not every task is independently proven");
  // The crucial rule: all-tasks-done is necessary but NOT sufficient.
  if (demand.outcomeAchieved !== true) problems.push("the original Intent outcome is not achieved");
  if (Array.isArray(demand.violatedHardConstraints) && demand.violatedHardConstraints.length) {
    problems.push(`hard constraints violated: ${demand.violatedHardConstraints.join("; ")}`);
  }
  if (demand.composesToValidResult === false) problems.push("local successes do not compose into a valid Result");
  const verdict = problems.length === 0 ? GATE_VERDICTS.PASS : GATE_VERDICTS.FAIL;
  return record({
    gate: GATES.DEMAND_PROVE, subject: demand.id ?? "demand", evaluator,
    inputs: { tasks: tasks.length, allTasksProven, outcomeAchieved: demand.outcomeAchieved ?? null },
    verdict, explanation: problems.length ? problems.join("; ") : "original outcome achieved, hard constraints intact, composes to a valid Result", at
  });
}

// --- Learning admission gate ------------------------------------------------
// Admit org-wide learning only after its supporting outcome passes the relevant Prove
// gate; provenance complete; data sanitized; scoped correctly; not contradicted.
export function learningGate(learning = {}, { evaluator = "process:learning-gate", at = null } = {}) {
  const problems = [];
  if (learning.supportingResultProven !== true) problems.push("supporting Result is not proven");
  if (!learning.provenanceComplete) problems.push("provenance is incomplete");
  if (learning.containsSensitiveContent) problems.push("sensitive content is not removed");
  if (!learning.scope) problems.push("knowledge is not scoped");
  if (learning.contradictedByStrongerEvidence) problems.push("contradicted by stronger evidence");
  if (typeof learning.sampleCount === "number" && learning.sampleCount < (learning.minSamples ?? 1)) {
    problems.push(`insufficient samples (${learning.sampleCount})`);
  }
  const verdict = problems.length === 0 ? GATE_VERDICTS.PASS : GATE_VERDICTS.FAIL;
  return record({
    gate: GATES.LEARNING, subject: learning.id ?? "learning", evaluator,
    inputs: { proven: learning.supportingResultProven ?? false, sampleCount: learning.sampleCount ?? null },
    verdict, explanation: problems.length ? problems.join("; ") : "proven, sanitized, scoped, sufficiently sampled, uncontradicted", at
  });
}
