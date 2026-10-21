import assert from "node:assert/strict";
import test from "node:test";
import { makeGoal, decomposeGoal, discoverCapabilities } from "../../src/autonomy/goal.mjs";
import { synthesizeAgent, constructOrganization, describeOrganization, coversAllCapabilities } from "../../src/autonomy/organization.mjs";

const CANDIDATES = [
  { id: "haiku", capabilities: ["research", "data_analysis", "code_change", "verification"], permissions: ["read", "write", "query"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.9, latencyScore: 0.9, evidenceQuality: 0.6, reliability: { successRate: 0.75, confidence: "high" }, sampleCount: 40 },
  { id: "opus", capabilities: ["research", "data_analysis", "code_change", "verification"], permissions: ["read", "write", "query"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.3, latencyScore: 0.4, evidenceQuality: 0.95, reliability: { successRate: 0.97, confidence: "high" }, sampleCount: 80 }
];

const REGISTRY = [
  { id: "researcher", capabilities: ["research"] },
  { id: "analyst", capabilities: ["data_analysis"] },
  { id: "coder", capabilities: ["code_change"] },
  { id: "verifier", capabilities: ["verification"] }
];

function build() {
  const goal = makeGoal({ id: "G", statement: "Reduce cloud cost by 20% without degrading reliability" });
  const subgoals = decomposeGoal(goal);
  const discovery = discoverCapabilities(subgoals, REGISTRY);
  return { goal, subgoals, discovery };
}

test("a synthesized agent gets LEAST-PRIVILEGE permissions from policy, not self-request", () => {
  const research = synthesizeAgent({ id: "A", role: "research", capabilities: ["research"], candidates: CANDIDATES });
  assert.deepEqual(research.permissions, ["read"]); // research never gets write
  assert.equal(research.grantedBy, "policy");
  const coder = synthesizeAgent({ id: "B", role: "code_change", capabilities: ["code_change"], candidates: CANDIDATES });
  assert.deepEqual(coder.permissions.sort(), ["read", "write"]);
});

test("the system CONSTRUCTS its own agent organization from a bare goal", () => {
  const { goal, subgoals, discovery } = build();
  const org = constructOrganization({ goal, subgoals, discovery, candidates: CANDIDATES });
  assert.equal(org.satisfiable, true);
  // one agent per distinct required capability + a supervisor
  const roles = org.agents.map((a) => a.role).sort();
  assert.deepEqual(roles, ["code_change", "data_analysis", "research", "verification"]);
  assert.equal(org.supervisor.id, "SUPERVISOR");
  assert.deepEqual(org.supervisor.governs.sort(), org.agents.map((a) => a.id).sort());
});

test("topology edges are DERIVED from subgoal dependencies, not hardcoded", () => {
  const { goal, subgoals, discovery } = build();
  const org = constructOrganization({ goal, subgoals, discovery, candidates: CANDIDATES });
  const desc = describeOrganization(org);
  // investigate(research) → analyze(data_analysis) → implement(code_change) → prove(verification)
  assert.ok(desc.topology.includes("AGENT-research→AGENT-data_analysis"));
  assert.ok(desc.topology.includes("AGENT-data_analysis→AGENT-code_change"));
  assert.ok(desc.topology.includes("AGENT-code_change→AGENT-verification"));
});

test("each agent is allocated a model via the governed allocator (explainable)", () => {
  const { goal, subgoals, discovery } = build();
  const org = constructOrganization({ goal, subgoals, discovery, candidates: CANDIDATES });
  for (const a of org.agents) {
    assert.ok(a.model, `${a.role} got a model`);
    assert.match(a.allocationRationale, /score|eligible|cold/);
  }
});

test("an unsatisfiable goal yields NO org and surfaces the gaps (never a fake org)", () => {
  const goal = makeGoal({ id: "G", statement: "Reduce cloud cost by 20%" });
  const subgoals = decomposeGoal(goal);
  const discovery = discoverCapabilities(subgoals, [{ id: "researcher", capabilities: ["research"] }]); // missing others
  const org = constructOrganization({ goal, subgoals, discovery, candidates: CANDIDATES });
  assert.equal(org.satisfiable, false);
  assert.equal(org.agents.length, 0);
  assert.ok(org.gaps.length > 0);
});

test("coversAllCapabilities detects when a roster would drop a required capability", () => {
  const { goal, subgoals, discovery } = build();
  const org = constructOrganization({ goal, subgoals, discovery, candidates: CANDIDATES });
  assert.equal(coversAllCapabilities(org, subgoals).covered, true);
  // remove the verifier agent → coverage broken
  const broken = { ...org, agents: org.agents.filter((a) => a.role !== "verification") };
  const check = coversAllCapabilities(broken, subgoals);
  assert.equal(check.covered, false);
  assert.ok(check.missing.includes("verification"));
});
