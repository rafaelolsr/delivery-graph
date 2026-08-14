import assert from "node:assert/strict";
import test from "node:test";
import { measureOrg, counterfactualAB, AB_VERDICTS } from "../../src/autonomy/counterfactual.mjs";
import { makeGoal, decomposeGoal, discoverCapabilities, makeSubgoal } from "../../src/autonomy/goal.mjs";
import { constructOrganization } from "../../src/autonomy/organization.mjs";
import { runSupervisor } from "../../src/autonomy/supervisor.mjs";

const REGISTRY = [
  { id: "researcher", capabilities: ["research"] },
  { id: "analyst", capabilities: ["data_analysis"] },
  { id: "coder", capabilities: ["code_change"] },
  { id: "verifier", capabilities: ["verification"] }
];
const CANDIDATES = [{ id: "haiku", capabilities: ["research", "data_analysis", "code_change", "verification"], permissions: ["read", "write", "query"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.9, latencyScore: 0.9, evidenceQuality: 0.6, reliability: { successRate: 0.75, confidence: "high" }, sampleCount: 40 }];
const STRONGER = [{ id: "opus", capabilities: ["research", "data_analysis", "code_change", "verification"], permissions: ["read", "write", "query"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.3, latencyScore: 0.4, evidenceQuality: 0.95, reliability: { successRate: 0.97, confidence: "high" }, sampleCount: 80 }];

function buildOrg() {
  const goal = makeGoal({ id: "G", statement: "Reduce cloud cost by 20% without degrading reliability" });
  const subgoals = decomposeGoal(goal);
  const discovery = discoverCapabilities(subgoals, REGISTRY);
  const org = constructOrganization({ goal, subgoals, discovery, candidates: CANDIDATES });
  return { goal, subgoals, org };
}

const heldOut = [makeSubgoal({ id: "HO-1", statement: "held-out code task", requiredCapabilities: ["code_change"] })];

test("measureOrg averages measured quality and EXCLUDES unknowns", () => {
  const org = { agents: [{ id: "A", role: "code_change" }] };
  const exec = (a, sg) => ({ quality: sg.id === "HO-null" ? null : 0.8 });
  const m = measureOrg(org, [makeSubgoal({ id: "HO-1", requiredCapabilities: ["code_change"] }), makeSubgoal({ id: "HO-null", requiredCapabilities: ["code_change"] })], exec);
  assert.equal(m.measured, 0.8); // the null is excluded, not averaged as 0
  assert.equal(m.samples, 1);
});

test("counterfactual KEEPS after only when it MEASURABLY beats before on held-out work", () => {
  const before = { agents: [{ id: "AGENT-code_change", role: "code_change" }] };
  const after = { agents: [{ id: "AGENT-code_change-v2", role: "code_change" }] };
  const exec = (a) => ({ quality: a.id.endsWith("-v2") ? 0.9 : 0.2 });
  const ab = counterfactualAB({ before, after, heldOutSubgoals: heldOut, executor: exec });
  assert.equal(ab.verdict, AB_VERDICTS.KEEP_AFTER);
  assert.ok(ab.margin >= 0.05);
});

test("counterfactual REVERTS when after does not beat before (no self-grading win)", () => {
  const before = { agents: [{ id: "AGENT-code_change", role: "code_change" }] };
  const after = { agents: [{ id: "AGENT-code_change-v2", role: "code_change" }] };
  // The replacement is NO better on held-out work, even if it claimed higher quality elsewhere.
  const exec = () => ({ quality: 0.2 });
  const ab = counterfactualAB({ before, after, heldOutSubgoals: heldOut, executor: exec });
  assert.equal(ab.verdict, AB_VERDICTS.KEEP_BEFORE);
  assert.equal(ab.keptAfter, false);
});

test("a marginal gain below the margin is INCONCLUSIVE and reverts (a reorg must earn its place)", () => {
  const before = { agents: [{ id: "x", role: "code_change" }] };
  const after = { agents: [{ id: "y", role: "code_change" }] };
  const exec = (a) => ({ quality: a.id === "y" ? 0.52 : 0.50 }); // +0.02 < 0.05 margin
  const ab = counterfactualAB({ before, after, heldOutSubgoals: heldOut, executor: exec, minMargin: 0.05 });
  assert.equal(ab.verdict, AB_VERDICTS.INCONCLUSIVE);
  assert.equal(ab.keptAfter, false);
});

test("SUPERVISOR with held-out A/B keeps a genuinely-better reorg", () => {
  const { subgoals, org } = buildOrg();
  const executor = (agent) => ({ quality: agent.role === "code_change" ? (agent.id.endsWith("-v2") ? 0.9 : 0.2) : 0.9, evidence: agent.id });
  const result = runSupervisor({ subgoals, org, executor, strongerCandidates: STRONGER, heldOutSubgoals: heldOut, at: "T" });
  const reorg = result.ledger.find((l) => l.action === "reorganized");
  assert.ok(reorg, "a genuinely-better reorg is kept");
  assert.equal(reorg.counterfactual.verdict, AB_VERDICTS.KEEP_AFTER);
});

test("SUPERVISOR with held-out A/B REVERTS a reorg that only wins on the triggering signal, not held-out", () => {
  const { subgoals, org } = buildOrg();
  // The v2 replacement looks better on the in-loop eval (0.9) BUT is no better on the
  // held-out task (still 0.2) — the A/B must catch this and revert.
  const executor = (agent, sg) => {
    if (agent.role !== "code_change") return { quality: 0.9, evidence: agent.id };
    if (sg && sg.id === "HO-1") return { quality: 0.2, evidence: agent.id }; // held-out: no improvement
    return { quality: agent.id.endsWith("-v2") ? 0.9 : 0.2, evidence: agent.id }; // in-loop: looks better
  };
  const result = runSupervisor({ subgoals, org, executor, strongerCandidates: STRONGER, heldOutSubgoals: heldOut, at: "T" });
  assert.ok(result.ledger.some((l) => l.action === "rolled_back"), "held-out A/B reverted the self-flattering reorg");
});
