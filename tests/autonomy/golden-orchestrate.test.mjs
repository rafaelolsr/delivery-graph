// GOLDEN Stage-6 scenario: from a bare goal, the system constructs its own agent
// organization, executes it, detects an underperforming agent, reorganizes itself
// through the governance gates, meets the goal, and explains the whole thing — all
// deterministic and offline (no live paid agents).

import assert from "node:assert/strict";
import test from "node:test";
import { orchestrateGoal } from "../../src/autonomy/orchestrate.mjs";

const T = "2026-08-14T00:00:00Z";

const REGISTRY = [
  { id: "researcher", capabilities: ["research"] },
  { id: "analyst", capabilities: ["data_analysis"] },
  { id: "coder", capabilities: ["code_change"] },
  { id: "verifier", capabilities: ["verification"] }
];
const CANDIDATES = [
  { id: "haiku", capabilities: ["research", "data_analysis", "code_change", "verification"], permissions: ["read", "write", "query"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.9, latencyScore: 0.9, evidenceQuality: 0.6, reliability: { successRate: 0.75, confidence: "high" }, sampleCount: 40 }
];
const STRONGER = [
  { id: "opus", capabilities: ["research", "data_analysis", "code_change", "verification"], permissions: ["read", "write", "query"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.3, latencyScore: 0.4, evidenceQuality: 0.95, reliability: { successRate: 0.97, confidence: "high" }, sampleCount: 80 }
];

test("GOLDEN Stage 6: bare goal → self-constructed org → self-reorganization → goal met → explained", () => {
  // A weak coder until it is replaced by the stronger candidate (-v2).
  const executor = (agent) => {
    if (agent.role !== "code_change") return { quality: 0.9, evidence: `${agent.role}:ok` };
    return { quality: agent.id.endsWith("-v2") ? 0.9 : 0.2, evidence: `${agent.id}:out` };
  };

  const result = orchestrateGoal({
    goal: { id: "GOAL-1", statement: "Reduce cloud infrastructure cost by 20% without degrading reliability", successCriteria: ["cost down 20%", "reliability preserved"], constraints: ["must not call paid live models in tests"], riskTolerance: "medium" },
    registry: REGISTRY, candidates: CANDIDATES, strongerCandidates: STRONGER,
    executor, at: T
  });

  // The system decided the subgoals itself (not human-authored).
  assert.deepEqual(result.subgoals.map((s) => s.id), ["SG-investigate", "SG-analyze", "SG-implement", "SG-prove"]);

  // It constructed its own agent organization with a derived topology.
  assert.equal(result.organization.satisfiable, true);
  assert.equal(result.organization.agentCount, 4);
  assert.ok(result.organization.topology.includes("AGENT-code_change→AGENT-verification"));

  // It reorganized itself: the weak coder was replaced through the mutation gate.
  const reorg = result.ledger.find((l) => l.action === "reorganized");
  assert.ok(reorg, "the system reorganized itself");
  assert.equal(reorg.replaced, "AGENT-code_change");
  assert.ok(reorg.observedBenefit > 0);

  // The goal is met after the self-reorganization.
  assert.equal(result.goalMet, true);

  // The human report explains what was requested, the org, the adaptation, the result.
  assert.match(result.report ? JSON.stringify(result.report) : "", /Reduce cloud infrastructure cost/);
  assert.equal(result.report.result.proven, true);
});

test("GOLDEN negative: an unsatisfiable goal builds NO org and surfaces the capability gap", () => {
  const result = orchestrateGoal({
    goal: { id: "GOAL-2", statement: "Reduce cloud cost by 20%" },
    registry: [{ id: "researcher", capabilities: ["research"] }], // missing analysis/code/verify
    candidates: CANDIDATES, strongerCandidates: STRONGER,
    executor: () => ({ quality: 0.9 }), at: T
  });
  assert.equal(result.goalMet, false);
  assert.equal(result.organization, null);
  assert.match(result.reason, /unsatisfiable/);
});

test("GOLDEN negative: a persistently weak agent triggers a rollback, not an infinite loop", () => {
  const executor = (agent) => ({ quality: agent.role === "code_change" ? 0.2 : 0.9, evidence: agent.id });
  const result = orchestrateGoal({
    goal: { id: "GOAL-3", statement: "Reduce cloud cost by 20%" },
    registry: REGISTRY, candidates: CANDIDATES, strongerCandidates: STRONGER,
    executor, maxRounds: 3, at: T
  });
  assert.ok(result.ledger.some((l) => l.action === "rolled_back"));
  assert.ok(result.rounds <= 3);
});

test("GOLDEN determinism: same goal + inputs → identical org and ledger (no wall clock, no randomness)", () => {
  const executor = (agent) => ({ quality: agent.role === "code_change" ? (agent.id.endsWith("-v2") ? 0.9 : 0.2) : 0.9, evidence: agent.id });
  const opts = { goal: { id: "G", statement: "Reduce cloud cost by 20%" }, registry: REGISTRY, candidates: CANDIDATES, strongerCandidates: STRONGER, executor, at: T };
  const a = orchestrateGoal(opts);
  const b = orchestrateGoal(opts);
  assert.deepEqual(a.organization, b.organization);
  assert.deepEqual(a.ledger.map((l) => l.action), b.ledger.map((l) => l.action));
});
