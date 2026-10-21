import assert from "node:assert/strict";
import test from "node:test";
import { makeGoal, decomposeGoal, discoverCapabilities } from "../../src/autonomy/goal.mjs";
import { constructOrganization } from "../../src/autonomy/organization.mjs";
import { runSupervisor, evaluateAgents, proposeReplaceAgent, proposeAddCapability } from "../../src/autonomy/supervisor.mjs";
import { evaluateProposal, PROPOSAL_STATES } from "../../src/governance/mutation.mjs";

const CANDIDATES = [
  { id: "haiku", capabilities: ["research", "data_analysis", "code_change", "verification"], permissions: ["read", "write", "query"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.9, latencyScore: 0.9, evidenceQuality: 0.6, reliability: { successRate: 0.75, confidence: "high" }, sampleCount: 40 }
];
const STRONGER = [
  { id: "opus", capabilities: ["research", "data_analysis", "code_change", "verification"], permissions: ["read", "write", "query"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.3, latencyScore: 0.4, evidenceQuality: 0.95, reliability: { successRate: 0.97, confidence: "high" }, sampleCount: 80 }
];
const REGISTRY = [
  { id: "researcher", capabilities: ["research"] },
  { id: "analyst", capabilities: ["data_analysis"] },
  { id: "coder", capabilities: ["code_change"] },
  { id: "verifier", capabilities: ["verification"] }
];

function buildOrg() {
  const goal = makeGoal({ id: "G", statement: "Reduce cloud cost by 20% without degrading reliability" });
  const subgoals = decomposeGoal(goal);
  const discovery = discoverCapabilities(subgoals, REGISTRY);
  const org = constructOrganization({ goal, subgoals, discovery, candidates: CANDIDATES });
  return { goal, subgoals, org };
}

test("evaluateAgents flags an agent whose quality is below threshold", () => {
  const { subgoals, org } = buildOrg();
  const executor = (agent) => ({ quality: agent.role === "code_change" ? 0.2 : 0.9, evidence: `${agent.id}-out` });
  const evals = evaluateAgents(org, subgoals, executor, { threshold: 0.5 });
  const coder = evals.find((e) => e.role === "code_change");
  assert.equal(coder.underperforming, true);
});

test("SELF-REORG: an underperforming agent is replaced through the mutation gate and retained when it helps", () => {
  const { subgoals, org } = buildOrg();
  // code_change agent is weak until replaced; the replacement (-v2) is strong.
  const executor = (agent) => {
    if (agent.role !== "code_change") return { quality: 0.9, evidence: `${agent.id}` };
    return { quality: agent.id.endsWith("-v2") ? 0.9 : 0.2, evidence: `${agent.id}` };
  };
  const result = runSupervisor({ subgoals, org, executor, strongerCandidates: STRONGER, at: "T" });
  const reorg = result.ledger.find((l) => l.action === "reorganized");
  assert.ok(reorg, "a reorganization happened");
  assert.equal(reorg.replaced, "AGENT-code_change");
  assert.ok(reorg.observedBenefit > 0, "the replacement improved quality");
  assert.equal(result.goalMet, true, "after reorg the org meets the threshold");
});

test("a reorg that does NOT help is rolled back (no thrashing)", () => {
  const { subgoals, org } = buildOrg();
  // code_change stays weak even after replacement → benefit <= 0 → rollback.
  const executor = (agent) => ({ quality: agent.role === "code_change" ? 0.2 : 0.9, evidence: agent.id });
  const result = runSupervisor({ subgoals, org, executor, strongerCandidates: STRONGER, maxRounds: 3, at: "T" });
  assert.ok(result.ledger.some((l) => l.action === "rolled_back"));
  // it stopped rather than thrashing forever
  assert.ok(result.rounds <= 3);
});

test("a healthy org triggers NO reorg", () => {
  const { subgoals, org } = buildOrg();
  const executor = () => ({ quality: 0.9, evidence: "ok" });
  const result = runSupervisor({ subgoals, org, executor, strongerCandidates: STRONGER, at: "T" });
  assert.equal(result.goalMet, true);
  assert.ok(result.ledger.every((l) => l.action !== "reorganized"));
});

test("REPLACING like-for-like does NOT expand authority (auto-admissible)", () => {
  const { subgoals, org } = buildOrg();
  const worst = { agent: "AGENT-code_change", role: "code_change", quality: 0.2 };
  const { proposal } = proposeReplaceAgent({ org, subgoals, underperformer: worst, strongerCandidates: STRONGER, at: "T" });
  assert.equal(proposal.change.effects.expandsPermissions, false);
  const evaluated = evaluateProposal(proposal, { at: "T" });
  assert.equal(evaluated.state, PROPOSAL_STATES.APPROVED); // reversible, coverage-preserving, no expansion
});

test("ADDING a new capability EXPANDS authority — a non-human supervisor is REJECTED (cannot self-grant)", () => {
  const { org } = buildOrg();
  const proposal = proposeAddCapability({ org, capability: "deploy", candidates: CANDIDATES, at: "T" });
  assert.equal(proposal.change.effects.expandsPermissions, true);
  // The supervisor is a non-human actor, so self-expansion is REJECTED outright — the
  // strongest guarantee (an agent can never grant itself authority), not merely deferred.
  const evaluated = evaluateProposal(proposal, { at: "T" });
  assert.equal(evaluated.state, PROPOSAL_STATES.REJECTED);
});

test("a HUMAN adding the same capability ESCALATES for approval (the legitimate path)", () => {
  const { org } = buildOrg();
  const proposal = proposeAddCapability({ org, capability: "deploy", candidates: CANDIDATES, at: "T" });
  // Re-actor the change to a human: now it is a pending human decision, not a self-grant.
  proposal.change.actor = "human:rafael";
  const evaluated = evaluateProposal(proposal, { at: "T" });
  assert.equal(evaluated.state, PROPOSAL_STATES.ESCALATED);
});

test("the whole loop is deterministic and bounded (same inputs → same ledger; never exceeds maxRounds)", () => {
  const { subgoals, org } = buildOrg();
  const executor = (agent) => ({ quality: agent.role === "code_change" ? 0.2 : 0.9, evidence: agent.id });
  const a = runSupervisor({ subgoals, org, executor, strongerCandidates: STRONGER, maxRounds: 2, at: "T" });
  const b = runSupervisor({ subgoals, org, executor, strongerCandidates: STRONGER, maxRounds: 2, at: "T" });
  assert.deepEqual(a.ledger.map((l) => l.action), b.ledger.map((l) => l.action));
  assert.ok(a.rounds <= 2);
});
