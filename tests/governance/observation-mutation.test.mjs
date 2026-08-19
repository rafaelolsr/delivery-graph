import assert from "node:assert/strict";
import test from "node:test";
import {
  makeObservation, observeProgress, recommendIntervention,
  PROGRESS_SIGNALS, INTERVENTIONS
} from "../../src/governance/observation.mjs";
import {
  makeProposal, evaluateProposal, applyProposal, evaluateAfterApplication,
  PROPOSAL_STATES
} from "../../src/governance/mutation.mjs";

// ---- observation -----------------------------------------------------------

test("repeated attempts with no new evidence is STALLED", () => {
  const obs = [
    makeObservation({ attempt: 1, evidenceProduced: 2 }),
    makeObservation({ attempt: 2, evidenceProduced: 2 }),
    makeObservation({ attempt: 3, evidenceProduced: 2 })
  ];
  const p = observeProgress(obs);
  assert.equal(p.signal, PROGRESS_SIGNALS.STALLED);
  assert.equal(p.evidenceDelta, 0);
});

test("a stalled task with a stronger model available switches model", () => {
  const p = { signal: PROGRESS_SIGNALS.STALLED, attempts: 3 };
  const r = recommendIntervention(p, { hasStrongerModel: true });
  assert.equal(r.intervention, INTERVENTIONS.SWITCH_MODEL);
});

test("a stalled task with NO stronger strategy stops and asks a human (never loops forever)", () => {
  const p = { signal: PROGRESS_SIGNALS.STALLED, attempts: 5 };
  const r = recommendIntervention(p, { hasStrongerModel: false });
  assert.equal(r.intervention, INTERVENTIONS.STOP_ASK_HUMAN);
});

test("an invalidated assumption returns control to Spec", () => {
  const obs = [makeObservation({ attempt: 1, evidenceProduced: 0, invalidatedAssumptions: ["API shape changed"] })];
  const p = observeProgress(obs);
  assert.equal(p.signal, PROGRESS_SIGNALS.ASSUMPTION_INVALIDATED);
  assert.equal(recommendIntervention(p).intervention, INTERVENTIONS.RETURN_TO_SPEC);
});

test("marginal progress with non-positive expected value retries differently (does not continue forever)", () => {
  const p = { signal: PROGRESS_SIGNALS.MARGINAL };
  assert.equal(recommendIntervention(p, { expectedValueOfContinuing: 0 }).intervention, INTERVENTIONS.RETRY_DIFFERENT_STRATEGY);
  assert.equal(recommendIntervention(p, { expectedValueOfContinuing: 5 }).intervention, INTERVENTIONS.CONTINUE);
});

test("a task is not stopped merely for taking long (healthy despite high elapsed)", () => {
  const obs = [
    makeObservation({ attempt: 1, evidenceProduced: 0, elapsedMs: 1 }),
    makeObservation({ attempt: 2, evidenceProduced: 3, elapsedMs: 999999 })
  ];
  const p = observeProgress(obs);
  assert.notEqual(p.signal, PROGRESS_SIGNALS.STALLED, "elapsed time alone must not stall a task making progress");
});

// ---- mutation governance ---------------------------------------------------

const splitChange = { actor: "governor/opus", reversible: true, effects: {} };

test("a reversible in-policy task split is automatically applied", () => {
  const proposal = makeProposal({
    id: "MUT-1", kind: "split_task", change: splitChange,
    preservesRequirementCoverage: true, preservesProof: true, rollback: { restore: "v0" }
  });
  const evaluated = evaluateProposal(proposal, { at: "T" });
  assert.equal(evaluated.state, PROPOSAL_STATES.APPROVED);
});

test("splitting preserves requirement + proof coverage or the gate rejects it", () => {
  const bad = makeProposal({
    id: "MUT-2", kind: "split_task", change: splitChange,
    preservesRequirementCoverage: false, preservesProof: true, rollback: { restore: "v0" }
  });
  const evaluated = evaluateProposal(bad, { at: "T" });
  assert.equal(evaluated.state, PROPOSAL_STATES.REJECTED);
  assert.match(evaluated.gate.explanation, /coverage not preserved/);
});

test("an authority-EXPANDING mutation cannot auto-apply (escalated or rejected, never applied)", () => {
  const expanding = makeProposal({
    id: "MUT-3", kind: "reassign_executor",
    change: { actor: "governor/opus", reversible: true, effects: { expandsPermissions: true } },
    rollback: { restore: "v0" }
  });
  const evaluated = evaluateProposal(expanding, {});
  assert.notEqual(evaluated.state, PROPOSAL_STATES.APPLIED);
  assert.notEqual(evaluated.state, PROPOSAL_STATES.APPROVED);
  // a non-human self-expansion is rejected outright
  assert.equal(evaluated.state, PROPOSAL_STATES.REJECTED);
});

test("an intent-modifying mutation escalates for human approval", () => {
  const intentChange = makeProposal({
    id: "MUT-4", kind: "split_task",
    change: { actor: "governor/opus", reversible: true, effects: { modifiesIntent: true } },
    rollback: { restore: "v0" }
  });
  const evaluated = evaluateProposal(intentChange, {});
  assert.equal(evaluated.state, PROPOSAL_STATES.ESCALATED);
});

test("applying a proposal bumps the graph version and records the transition (reconstructable)", () => {
  const proposal = makeProposal({ id: "MUT-5", kind: "split_task", change: splitChange, rollback: { restore: "v0" } });
  const approved = evaluateProposal(proposal, {});
  const graph = { version: 3, nodes: [{ id: "N1" }] };
  const applier = (g, p) => ({ ...g, nodes: [{ id: "N1a" }, { id: "N1b" }], splitBy: p.id });
  const { proposal: applied, graph: newGraph } = applyProposal(approved, graph, applier, { at: "T" });
  assert.equal(applied.state, PROPOSAL_STATES.APPLIED);
  assert.equal(newGraph.version, 4);
  assert.equal(newGraph.transition.from, 3);
  assert.equal(newGraph.transition.to, 4);
  assert.equal(newGraph.transition.proposalId, "MUT-5");
  // The whole lifecycle is reconstructable from the history ledger.
  assert.deepEqual(applied.history.map((h) => h.state), [
    PROPOSAL_STATES.PROPOSED, PROPOSAL_STATES.EVALUATED, PROPOSAL_STATES.APPROVED, PROPOSAL_STATES.APPLIED
  ]);
});

test("a failed adaptation rolls back to the preserved previous version", () => {
  const proposal = makeProposal({ id: "MUT-6", kind: "change_model", change: splitChange, rollback: { restore: "v3" } });
  const approved = evaluateProposal(proposal, {});
  const graph = { version: 3, nodes: [{ id: "N1" }] };
  const applier = (g) => ({ ...g, nodes: [{ id: "N1-new" }] });
  const { proposal: applied, graph: newGraph, previousGraph } = applyProposal(approved, graph, applier);
  // The adaptation did not help (observedBenefit <= 0) → roll back.
  const { proposal: done, graph: restored } = evaluateAfterApplication(applied, {
    observedBenefit: -1, previousGraph, rollbacker: (g) => g
  });
  assert.equal(done.state, PROPOSAL_STATES.ROLLED_BACK);
  assert.equal(restored.version, 3, "rolled back to the preserved previous version");
  assert.deepEqual(restored.nodes, [{ id: "N1" }]);
});

test("a helpful adaptation is retained", () => {
  const proposal = makeProposal({ id: "MUT-7", kind: "change_model", change: splitChange, rollback: { restore: "v3" } });
  const approved = evaluateProposal(proposal, {});
  const { proposal: applied, previousGraph } = applyProposal(approved, { version: 1 }, (g) => ({ ...g }));
  const { proposal: done } = evaluateAfterApplication(applied, { observedBenefit: 5, previousGraph });
  assert.equal(done.state, PROPOSAL_STATES.RETAINED);
});

test("a proposal cannot be applied unless approved", () => {
  const proposal = makeProposal({ id: "MUT-8", kind: "split_task", change: { actor: "governor/opus", reversible: true, effects: { modifiesIntent: true } }, rollback: {} });
  const escalated = evaluateProposal(proposal, {});
  assert.throws(() => applyProposal(escalated, { version: 1 }, (g) => g), /must be approved/);
});
