import assert from "node:assert/strict";
import test from "node:test";
import {
  intentGate, specGate, allocationGate, mutationGate,
  taskProveGate, demandProveGate, learningGate,
  GATE_VERDICTS, GATES
} from "../../src/governance/gates.mjs";
import {
  requiresHumanApproval, evaluateAuthority, AUTHORITY_DECISIONS, isHumanActor
} from "../../src/governance/policy.mjs";

// ---- policy / authority ----------------------------------------------------

test("an agent can NEVER grant itself permissions (self-expansion is rejected, not deferred)", () => {
  const change = { type: "mutation", actor: "builder/opus", reversible: true, effects: { expandsPermissions: true } };
  const result = evaluateAuthority(change, { approvals: [] });
  assert.equal(result.decision, AUTHORITY_DECISIONS.REJECTED);
  // even a forged self-approval by a non-human cannot rescue it
  const forged = evaluateAuthority(change, { approvals: [{ approver: "builder/opus", approved: true }] });
  assert.equal(forged.decision, AUTHORITY_DECISIONS.REJECTED);
});

test("a human CAN approve a permission expansion", () => {
  const change = { type: "mutation", actor: "human:rafael", reversible: true, effects: { expandsPermissions: true } };
  const pending = evaluateAuthority(change, { approvals: [] });
  assert.equal(pending.decision, AUTHORITY_DECISIONS.REQUIRES_HUMAN);
  const approved = evaluateAuthority(change, { approvals: [{ approver: "human:rafael", approved: true }] });
  assert.equal(approved.decision, AUTHORITY_DECISIONS.AUTO_OK);
});

test("each spec approval trigger forces human approval", () => {
  for (const effect of ["modifiesIntent", "weakensAcceptance", "removesProof", "irreversibleExternal", "changesForbiddenDomain", "unprovenInfluencesLearning"]) {
    const { required, reasons } = requiresHumanApproval({ reversible: true, effects: { [effect]: true } });
    assert.equal(required, true, `${effect} must require approval`);
    assert.ok(reasons.length >= 1);
  }
});

test("a reversible change with no trigger is auto-applicable; an irreversible one is not", () => {
  assert.equal(requiresHumanApproval({ reversible: true, effects: {} }).required, false);
  assert.equal(requiresHumanApproval({ reversible: false, effects: {} }).required, true);
});

test("unknown reversibility is default-denied (reversibility must be established, not presumed)", () => {
  const { required, reasons } = requiresHumanApproval({ effects: {} }); // reversible absent
  assert.equal(required, true);
  assert.match(reasons.join(" "), /reversibility is not established/);
});

test("isHumanActor only accepts the human: prefix (OKF §7)", () => {
  assert.equal(isHumanActor("human:rafael"), true);
  assert.equal(isHumanActor("builder/opus"), false);
  assert.equal(isHumanActor("process:nightly"), false);
});

// ---- mutation gate ---------------------------------------------------------

test("mutation gate: an authority-expanding automatic mutation cannot apply", () => {
  const g = mutationGate({
    id: "MUT-1",
    change: { actor: "builder/opus", reversible: true, effects: { expandsPermissions: true } }
  });
  assert.equal(g.verdict, GATE_VERDICTS.FAIL);
  assert.match(g.explanation, /authority rejected/);
});

test("mutation gate: an intent-modifying mutation requires human judgment", () => {
  const g = mutationGate({
    id: "MUT-2",
    change: { actor: "builder/opus", reversible: true, effects: { modifiesIntent: true } }
  });
  assert.equal(g.verdict, GATE_VERDICTS.REQUIRES_HUMAN_JUDGMENT);
});

test("mutation gate: a reversible in-intent split with rollback auto-passes", () => {
  const g = mutationGate({
    id: "MUT-3",
    change: { actor: "builder/opus", reversible: true, effects: {} },
    preservesRequirementCoverage: true, preservesProof: true, rollback: { restore: "v1" }
  });
  assert.equal(g.verdict, GATE_VERDICTS.PASS);
});

test("mutation gate: removing mandatory proof is rejected", () => {
  const g = mutationGate({
    id: "MUT-4",
    change: { actor: "human:rafael", reversible: true, effects: { removesProof: true } },
    approvals: []
  });
  assert.equal(g.verdict, GATE_VERDICTS.REQUIRES_HUMAN_JUDGMENT);
});

// ---- task prove gate -------------------------------------------------------

test("task prove: insufficient evidence blocks completion", () => {
  const g = taskProveGate({ node_id: "NODE-1", contract: ["a", "b"], satisfied: ["a"] });
  assert.equal(g.verdict, GATE_VERDICTS.INSUFFICIENT_EVIDENCE);
});

test("task prove: executor self-approval is rejected where independence is required", () => {
  const g = taskProveGate({
    node_id: "NODE-1", contract: ["a"], satisfied: ["a"],
    independenceRequired: true, executor: "builder/opus", verifier: "builder/opus"
  });
  assert.equal(g.verdict, GATE_VERDICTS.FAIL);
  assert.match(g.explanation, /self-approved/);
});

test("task prove: a weakened contract is CONTRACT_INVALIDATED", () => {
  const g = taskProveGate({ node_id: "NODE-1", contract: ["a"], satisfied: ["a"], contractWeakened: true });
  assert.equal(g.verdict, GATE_VERDICTS.CONTRACT_INVALIDATED);
});

test("task prove: satisfied + independent verifier passes", () => {
  const g = taskProveGate({
    node_id: "NODE-1", contract: ["a"], satisfied: ["a"],
    independenceRequired: true, executor: "builder/opus", verifier: "verifier/sonnet"
  });
  assert.equal(g.verdict, GATE_VERDICTS.PASS);
  assert.equal(g.independence.satisfied, true);
});

// ---- demand prove gate -----------------------------------------------------

test("demand prove: all tasks done but Intent NOT achieved blocks Result", () => {
  const g = demandProveGate({
    id: "DEM-1",
    tasks: [{ proven: true }, { proven: true }],
    outcomeAchieved: false
  });
  assert.equal(g.verdict, GATE_VERDICTS.FAIL);
  assert.match(g.explanation, /outcome is not achieved/);
});

test("demand prove: outcome achieved + all proven + constraints intact passes", () => {
  const g = demandProveGate({
    id: "DEM-1",
    tasks: [{ proven: true }],
    outcomeAchieved: true, violatedHardConstraints: [], composesToValidResult: true
  });
  assert.equal(g.verdict, GATE_VERDICTS.PASS);
});

test("demand prove: a violated hard constraint blocks Result even if outcome 'achieved'", () => {
  const g = demandProveGate({
    id: "DEM-1", tasks: [{ proven: true }], outcomeAchieved: true,
    violatedHardConstraints: ["must not call paid model"]
  });
  assert.equal(g.verdict, GATE_VERDICTS.FAIL);
});

// ---- learning gate ---------------------------------------------------------

test("learning: only a proven Result may be admitted", () => {
  const g = learningGate({ id: "L-1", supportingResultProven: false, provenanceComplete: true, scope: "repo" });
  assert.equal(g.verdict, GATE_VERDICTS.FAIL);
});

test("learning: sensitive content blocks admission", () => {
  const g = learningGate({ id: "L-1", supportingResultProven: true, provenanceComplete: true, scope: "org", containsSensitiveContent: true });
  assert.equal(g.verdict, GATE_VERDICTS.FAIL);
});

test("learning: proven + sanitized + scoped + sampled admits", () => {
  const g = learningGate({
    id: "L-1", supportingResultProven: true, provenanceComplete: true,
    scope: "org", sampleCount: 30, minSamples: 5
  });
  assert.equal(g.verdict, GATE_VERDICTS.PASS);
});

// ---- explainable + replayable ---------------------------------------------

test("every gate record is explainable and replayable (stable shape, no hidden clock)", () => {
  const records = [
    intentGate({ id: "DEM-1", outcome: "x", success_criteria: ["c"] }, { at: "T" }),
    specGate({ id: "DEM-1", nodes: [], requirement_ids: [] }, { at: "T" }),
    allocationGate({ node_id: "N", selected: "claude", rationale: "cheapest eligible", eligible: true }, { at: "T" }),
    taskProveGate({ node_id: "N", contract: ["a"], satisfied: ["a"] }, { at: "T" }),
    learningGate({ id: "L", supportingResultProven: true, provenanceComplete: true, scope: "org" }, { at: "T" })
  ];
  for (const r of records) {
    for (const key of ["gate", "subject", "evaluator", "inputs", "verdict", "explanation", "at"]) {
      assert.ok(key in r, `record missing ${key}`);
    }
    assert.equal(r.at, "T", "timestamp is injected, not self-generated (replayable)");
    assert.ok(Object.values(GATE_VERDICTS).includes(r.verdict));
    assert.ok(typeof r.explanation === "string" && r.explanation.length > 0);
  }
});

test("intent gate flags an unmeasurable outcome", () => {
  const g = intentGate({ id: "DEM-1", outcome: "", success_criteria: [] });
  assert.equal(g.verdict, GATE_VERDICTS.FAIL);
});

test("spec gate flags an executable node with no validation contract", () => {
  const g = specGate({
    id: "DEM-1",
    nodes: [{ id: "N1", type: "implementation", depends_on: [], requirement_ids: ["R1"], validation: { required: [] } }],
    requirement_ids: ["R1"]
  });
  assert.equal(g.verdict, GATE_VERDICTS.FAIL);
  assert.match(g.explanation, /no validation contract/);
});

test("allocation gate rejects a non-independent verifier", () => {
  const g = allocationGate({
    node_id: "N", selected: "claude", rationale: "x", eligible: true,
    verifierIndependenceRequired: true, verifier: "claude"
  });
  assert.equal(g.verdict, GATE_VERDICTS.FAIL);
});
