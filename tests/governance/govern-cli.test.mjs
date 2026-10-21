import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planGovernance, riskForNode, requirementsForNode } from "../../src/governance/govern-cli.mjs";

const cliPath = path.resolve("bin/dge.mjs");

const CANDIDATES = [
  { id: "haiku", capabilities: ["code_change"], permissions: ["read", "write"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.9, latencyScore: 0.9, evidenceQuality: 0.6, reliability: { successRate: 0.75, confidence: "high" }, sampleCount: 40 },
  { id: "opus", capabilities: ["code_change"], permissions: ["read", "write"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.3, latencyScore: 0.4, evidenceQuality: 0.95, reliability: { successRate: 0.97, confidence: "high" }, sampleCount: 80 }
];

function graphWithReadyNode() {
  return {
    graph: { id: "DEM-1", title: "t" }, version: 2,
    demands: [{ id: "DEM-1", outcome: "ship it", constraints: [] }],
    requirements: [{ id: "REQ-1", demand_id: "DEM-1" }],
    gaps: [], tracks: [{ id: "TRK-i", title: "i" }],
    nodes: [{ id: "NODE-1", type: "implementation", track: "TRK-i", requirement_ids: ["REQ-1"], depends_on: [], status: "ready", validation: { required: ["tests pass"] } }]
  };
}

test("riskForNode derives risk from node type (config can override)", () => {
  assert.equal(riskForNode({ type: "implementation" }), "medium");
  assert.equal(riskForNode({ type: "release" }), "high");
  assert.equal(riskForNode({ type: "docs" }), "low");
  assert.equal(riskForNode({ type: "implementation" }, { riskByType: { implementation: "high" } }), "high");
});

test("requirementsForNode requires evidence + independence when a node has a validation contract", () => {
  const r = requirementsForNode({ id: "N", type: "implementation", validation: { required: ["x"] } });
  assert.deepEqual(r.evidence, ["test_results"]);
  assert.equal(r.independentVerifier, true);
});

test("planGovernance allocates a ready node and gate-passes with real candidates", () => {
  const { allocations, readyCount, candidateCount } = planGovernance(graphWithReadyNode(), { candidates: CANDIDATES, profile: "balanced" });
  assert.equal(readyCount, 1);
  assert.equal(candidateCount, 2);
  assert.equal(allocations.length, 1);
  assert.ok(allocations[0].selected);
  assert.equal(allocations[0].gate.verdict, "PASS");
  assert.match(allocations[0].rationale, /score/);
});

test("the SAME node adapts its allocation to risk (low→cheap, high→reliable)", () => {
  const low = planGovernance(graphWithReadyNode(), { candidates: CANDIDATES, profile: "economy" });
  const high = planGovernance(graphWithReadyNode(), { candidates: CANDIDATES, profile: "reliability_first", riskByType: { implementation: "high" } });
  assert.equal(low.allocations[0].selected, "haiku", "low-risk economy → cheaper model");
  assert.equal(high.allocations[0].selected, "opus", "high-risk reliability_first → reliable model");
  assert.notEqual(low.allocations[0].selected, high.allocations[0].selected);
});

test("cold start (no candidates) selects nothing but reports honestly — not a crash", () => {
  const { allocations } = planGovernance(graphWithReadyNode(), {});
  assert.equal(allocations[0].selected, null);
  assert.equal(allocations[0].gate.verdict, "FAIL"); // no eligible candidate
});

test("planGovernance NEVER mutates graph.json (read-only planning)", () => {
  const graph = graphWithReadyNode();
  const before = JSON.stringify(graph);
  planGovernance(graph, { candidates: CANDIDATES });
  assert.equal(JSON.stringify(graph), before, "the governor plan must not mutate the graph");
});

test("`dge govern` runs live against a real graph.json and leaves it byte-identical", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "govern-cli-"));
  try {
    const dgDir = path.join(dir, "delivery-graph");
    fs.mkdirSync(dgDir, { recursive: true });
    const graphPath = path.join(dgDir, "graph.json");
    fs.writeFileSync(graphPath, JSON.stringify(graphWithReadyNode(), null, 2));
    const configPath = path.join(dir, "govern.json");
    fs.writeFileSync(configPath, JSON.stringify({ candidates: CANDIDATES, profile: "balanced" }));
    const before = fs.readFileSync(graphPath);

    const out = execFileSync(process.execPath, [cliPath, "govern", "--config", configPath, "--json", "--graph", graphPath], { encoding: "utf8" });
    const parsed = JSON.parse(out);
    assert.equal(parsed.readyCount, 1);
    assert.ok(parsed.allocations[0].selected);
    // The live command is read-only: graph.json is byte-identical after governing.
    assert.ok(before.equals(fs.readFileSync(graphPath)), "dge govern must not mutate graph.json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
