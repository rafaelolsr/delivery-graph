// Golden end-to-end acceptance scenario (M8).
//
// A deterministic, fully-offline walk through the governed-adaptive lifecycle wiring
// every real governance module together. NO paid live models are called — candidates
// and observations are fixtures. This is the spec's headline acceptance test.
//
// Sequence:
//   Intent → Spec → allocate an economical model → execution STALLS → observe poor
//   marginal progress → switch to a stronger eligible model → a discovered dependency
//   requires SPLITTING the task → mutation gate confirms it is reversible + in-authority
//   → graph is versioned and continues → executor produces evidence → an independent
//   verifier PROVES the task → demand-level Prove confirms the original Intent →
//   Result is emitted → sanitized performance history is admitted to the org store →
//   the human report explains the whole sequence.

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { intentGate, specGate, allocationGate, taskProveGate, demandProveGate, learningGate, GATE_VERDICTS } from "../../src/governance/gates.mjs";
import { allocate, RISK_BANDS, OPTIMIZATION_PROFILES } from "../../src/governance/allocation.mjs";
import { makeObservation, observeProgress, recommendIntervention, PROGRESS_SIGNALS, INTERVENTIONS } from "../../src/governance/observation.mjs";
import { makeProposal, evaluateProposal, applyProposal, evaluateAfterApplication, PROPOSAL_STATES } from "../../src/governance/mutation.mjs";
import { createFileStore } from "../../src/governance/org-store.mjs";
import { renderGovernanceReport, REQUIRED_REPORT_QUESTIONS } from "../../src/governance/report.mjs";

const T = "2026-08-13T00:00:00Z"; // fixed timestamp — deterministic, no wall clock

// Two fixture models. Economical=cheap+ok; strong=dear+reliable. No network, no cost.
const economical = {
  id: "economical-model", capabilities: ["code_change"], permissions: ["read", "write"],
  permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true,
  costScore: 0.9, latencyScore: 0.9, evidenceQuality: 0.6,
  reliability: { successRate: 0.75, confidence: "high" }, sampleCount: 40
};
const strong = {
  id: "strong-model", capabilities: ["code_change"], permissions: ["read", "write"],
  permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true,
  costScore: 0.3, latencyScore: 0.4, evidenceQuality: 0.95,
  reliability: { successRate: 0.97, confidence: "high" }, sampleCount: 80
};

test("GOLDEN: a governed-adaptive demand runs end to end, offline, and is fully explainable", () => {
  const trace = { allocations: [], adaptations: [], gates: [], observations: [] };

  // --- Intent gate ---
  const intent = {
    id: "DEM-G", outcome: "apply a medium-risk code change", success_criteria: ["tests pass", "independently proven"],
    constraints: ["must not call paid live models in tests"]
  };
  const ig = intentGate(intent, { at: T });
  trace.gates.push(ig);
  assert.equal(ig.verdict, GATE_VERDICTS.PASS);

  // --- Spec admission gate: an implementation task + an independent proof task ---
  const spec = {
    id: "DEM-G", requirement_ids: ["REQ-G"],
    nodes: [
      { id: "NODE-impl", type: "implementation", depends_on: [], requirement_ids: ["REQ-G"], validation: { required: ["tests pass"] } },
      { id: "NODE-proof", type: "test", depends_on: ["NODE-impl"], requirement_ids: ["REQ-G"], validation: { required: ["independent verifier PASS"] } }
    ]
  };
  const sg = specGate(spec, { at: T });
  trace.gates.push(sg);
  assert.equal(sg.verdict, GATE_VERDICTS.PASS);

  // --- Allocation: medium risk, economy → the economical model wins (history-based) ---
  const reqs = { node_id: "NODE-impl", capabilities: ["code_change"], permissions: ["read", "write"], domains: ["app"], evidence: ["test_results"] };
  let alloc = allocate([economical, strong], reqs, { risk: RISK_BANDS.MEDIUM, profile: OPTIMIZATION_PROFILES.ECONOMY, at: T });
  trace.allocations.push(alloc);
  assert.equal(alloc.selected, "economical-model", "economy picks the cheaper eligible model first");
  const ag = allocationGate({ node_id: "NODE-impl", selected: alloc.selected, rationale: alloc.rationale, eligible: true, verifierIndependenceRequired: true, verifier: "strong-model" }, { at: T });
  trace.gates.push(ag);
  assert.equal(ag.verdict, GATE_VERDICTS.PASS);

  // --- Execution STALLS: three attempts, no new evidence ---
  const stallWindow = [
    makeObservation({ attempt: 1, evidenceProduced: 0, at: T }),
    makeObservation({ attempt: 2, evidenceProduced: 0, at: T }),
    makeObservation({ attempt: 3, evidenceProduced: 0, at: T })
  ];
  const progress = observeProgress(stallWindow);
  trace.observations.push(progress);
  assert.equal(progress.signal, PROGRESS_SIGNALS.STALLED);

  // --- The governor detects poor marginal progress and switches to a stronger model ---
  const intervention = recommendIntervention(progress, { hasStrongerModel: true });
  assert.equal(intervention.intervention, INTERVENTIONS.SWITCH_MODEL);
  alloc = allocate([strong], reqs, { risk: RISK_BANDS.HIGH, profile: OPTIMIZATION_PROFILES.RELIABILITY_FIRST, at: T });
  trace.allocations.push(alloc);
  assert.equal(alloc.selected, "strong-model");

  // --- A discovered dependency requires SPLITTING the task ---
  const split = makeProposal({
    id: "MUT-G", kind: "split_task",
    triggeringObservation: progress,
    change: { actor: "governor/strong-model", reversible: true, effects: {} },
    preservesRequirementCoverage: true, preservesProof: true, rollback: { restore: "v0" }, at: T
  });
  const evaluated = evaluateProposal(split, { at: T });
  trace.adaptations.push(evaluated);
  // The mutation gate confirms reversible + inside authority → auto-approved.
  assert.equal(evaluated.state, PROPOSAL_STATES.APPROVED);

  // --- Graph is versioned and execution continues ---
  const graphV0 = { version: 0, nodes: spec.nodes };
  const applier = (g) => ({ ...g, nodes: [
    { id: "NODE-impl-a", type: "implementation", depends_on: [], requirement_ids: ["REQ-G"], validation: { required: ["tests pass (part a)"] } },
    { id: "NODE-impl-b", type: "implementation", depends_on: ["NODE-impl-a"], requirement_ids: ["REQ-G"], validation: { required: ["tests pass (part b)"] } },
    g.nodes[1]
  ] });
  const { proposal: applied, graph: graphV1, previousGraph } = applyProposal(evaluated, graphV0, applier, { at: T });
  assert.equal(graphV1.version, 1);
  assert.equal(graphV1.transition.from, 0);

  // --- The executor produces evidence; an independent verifier PROVES the task ---
  const taskProve = taskProveGate({
    node_id: "NODE-impl-b", contract: ["tests pass (part b)"], satisfied: ["tests pass (part b)"],
    independenceRequired: true, executor: "strong-model", verifier: "independent-verifier"
  }, { at: T });
  trace.gates.push(taskProve);
  assert.equal(taskProve.verdict, GATE_VERDICTS.PASS);
  assert.equal(taskProve.independence.satisfied, true);

  // The adaptation helped → retained.
  const { proposal: retained } = evaluateAfterApplication(applied, { observedBenefit: 3, previousGraph, at: T });
  assert.equal(retained.state, PROPOSAL_STATES.RETAINED);

  // --- Demand-level Prove confirms the ORIGINAL Intent (not merely all-tasks-done) ---
  const demandProve = demandProveGate({
    id: "DEM-G",
    tasks: [{ proven: true }, { proven: true }],
    outcomeAchieved: true, violatedHardConstraints: [], composesToValidResult: true
  }, { at: T });
  trace.gates.push(demandProve);
  assert.equal(demandProve.verdict, GATE_VERDICTS.PASS);

  // --- Sanitized performance history is admitted to the org store ---
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-store-"));
  try {
    const learning = {
      id: "L-G", supportingResultProven: true, provenanceComplete: true, scope: "org",
      sampleCount: 40, minSamples: 5, containsSensitiveContent: false
    };
    const lg = learningGate(learning, { at: T });
    trace.gates.push(lg);
    assert.equal(lg.verdict, GATE_VERDICTS.PASS, "only a proven, sanitized, scoped result is admitted");

    const store = createFileStore({ location: dir });
    // The caller's object carries a raw prompt + secret — the store must REFUSE it, so
    // learning is only admitted once the raw content is stripped to a sanitized aggregate.
    const rawAttempt = {
      id: "AGG-G", organization: "acme", project: "p", repository: "repo-g",
      provider: "vendor", model: "strong-model", version: "1",
      taskClass: "code_change", riskBand: "medium",
      successRate: 0.97, proofRate: 1.0, sampleCount: 40, confidence: "high",
      prompt: "the raw builder prompt", secret: "API_KEY"
    };
    assert.throws(() => store.appendProvenResult(rawAttempt), /privacy/, "raw content must be refused by the store");
    // Admit only the sanitized aggregate (no raw fields).
    const { prompt, secret, ...sanitized } = rawAttempt;
    store.appendProvenResult(sanitized);
    const shared = store.readComparable({ organization: "acme", taskClass: "code_change" });
    assert.equal(shared.length, 1);
    assert.equal(shared[0].successRate, 0.97);
    assert.equal(shared[0].prompt, undefined, "no raw content leaked to the org store");
    assert.equal(shared[0].secret, undefined);

    // --- The human report explains the whole sequence ---
    const report = renderGovernanceReport({
      intent, graphVersion: graphV1.version,
      allocations: trace.allocations, adaptations: [retained],
      gates: trace.gates, observations: trace.observations,
      result: { proven: true, evidence: ["independent verifier PASS", "tests green"], verdict: "PASS" },
      learnings: [{ scope: "org", admitted: true, summary: "strong-model reliable for medium-risk code change" }]
    });
    for (const q of REQUIRED_REPORT_QUESTIONS) assert.ok(report.includes(q), `report answers: ${q}`);
    assert.match(report, /economical-model/); // initial pick
    assert.match(report, /strong-model/); // the switch
    assert.match(report, /split_task.*retained/); // the mutation and its outcome
    assert.match(report, /independent verifier PASS/); // the proof
    assert.match(report, /strong-model reliable/); // the admitted learning
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("GOLDEN negative: the same demand CANNOT emit a Result if the Intent is not achieved", () => {
  // Every task proven, but the original outcome not achieved → Result blocked.
  const g = demandProveGate({ id: "DEM-G", tasks: [{ proven: true }, { proven: true }], outcomeAchieved: false }, { at: T });
  assert.equal(g.verdict, GATE_VERDICTS.FAIL);
});

test("GOLDEN negative: an unproven result is NOT admitted to organization learning", () => {
  const g = learningGate({ id: "L-x", supportingResultProven: false, provenanceComplete: true, scope: "org" }, { at: T });
  assert.equal(g.verdict, GATE_VERDICTS.FAIL);
});

test("GOLDEN negative: the scenario never selects an ineligible cheaper candidate", () => {
  const cheapIneligible = { ...economical, id: "cheap-but-no-write", permissions: ["read"], costScore: 1 };
  const reqs = { capabilities: ["code_change"], permissions: ["read", "write"], domains: ["app"], evidence: ["test_results"] };
  const alloc = allocate([cheapIneligible, strong], reqs, { risk: RISK_BANDS.LOW, profile: OPTIMIZATION_PROFILES.ECONOMY });
  assert.notEqual(alloc.selected, "cheap-but-no-write");
});
