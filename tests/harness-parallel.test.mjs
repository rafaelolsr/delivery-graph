import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readGraph, validateGraph } from "../src/graph-engine.mjs";
import { executeNodesInParallel, persistNodeResult } from "../src/harness-parallel.mjs";

const CLI = fileURLToPath(new URL("../bin/dge.mjs", import.meta.url));

// Build a minimal valid store on disk with two independent ready nodes.
function seedTwoNodeGraph() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-parallel-"));
  const graphPath = path.join(dir, "graph.json");
  const run = (...args) => {
    const r = spawnSync("node", [CLI, ...args, "--graph", graphPath], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  run("init", "--title", "parallel");
  run("add-demand", "--title", "D", "--source", "test", "--outcome", "parallel works");
  run("add-requirement", "--demand", "DEM-001", "--statement", "S", "--acceptance", "a", "--evidence", "e");
  run("add-track", "--title", "T");
  run("add-node", "--title", "A", "--type", "implementation", "--track", "TRK-t", "--requirements", "REQ-001", "--validation", "x");
  run("add-node", "--title", "B", "--type", "implementation", "--track", "TRK-t", "--requirements", "REQ-001", "--validation", "x");
  const graph = readGraph(graphPath);
  const [a, b] = graph.nodes.map((n) => n.id);
  return { graphPath, dir, nodeA: a, nodeB: b };
}

test("two harnesses complete two independent nodes concurrently with no lost writes", async () => {
  const { graphPath, dir, nodeA, nodeB } = seedTwoNodeGraph();

  // Two different harnesses, dispatched at the same time, each moving its node to
  // in_progress. Result data (which harness) is recorded through the evidence layer,
  // not on the node — the node object stays schema-valid (additionalProperties:false).
  const dispatch = async (harnessId) => ({ class: "ok", harness: harnessId });
  const apply = (node) => {
    node.status = "in_progress";
  };

  const results = await executeNodesInParallel(graphPath, [
    { nodeId: nodeA, harnessId: "claude", task: {}, dispatch, apply },
    { nodeId: nodeB, harnessId: "copilot", task: {}, dispatch, apply }
  ]);

  assert.equal(results.length, 2);
  // Which harness ran which node is captured in the returned outcomes.
  assert.equal(results.find((r) => r.nodeId === nodeA).harnessId, "claude");
  assert.equal(results.find((r) => r.nodeId === nodeB).harnessId, "copilot");

  const graph = readGraph(graphPath);
  const a = graph.nodes.find((n) => n.id === nodeA);
  const b = graph.nodes.find((n) => n.id === nodeB);

  // Both concurrent writes landed — neither clobbered the other.
  assert.equal(a.status, "in_progress");
  assert.equal(b.status, "in_progress");

  // The store is still valid after concurrent completion.
  assert.deepEqual(validateGraph(graph), []);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("many concurrent persists all survive — rev advances by exactly the write count", async () => {
  const { graphPath, dir, nodeA, nodeB } = seedTwoNodeGraph();
  const startRev = readGraph(graphPath).graph.rev;

  // 20 concurrent persists (interleaved across both nodes), each a store mutation.
  // Every successful commit bumps graph.rev by one; if any concurrent write were
  // lost, rev would advance by fewer than 20. rev is the schema-valid, direct
  // measure of "no lost writes" without touching node fields.
  const N = 20;
  const writers = [];
  for (let i = 0; i < N; i += 1) {
    const target = i % 2 === 0 ? nodeA : nodeB;
    writers.push(
      Promise.resolve().then(() =>
        persistNodeResult(graphPath, target, (node) => {
          node.status = "in_progress"; // idempotent, schema-valid mutation
        })
      )
    );
  }
  await Promise.all(writers);

  const graph = readGraph(graphPath);
  assert.equal(graph.graph.rev - startRev, N, "rev did not advance by N → lost writes");
  assert.deepEqual(validateGraph(graph), []);

  fs.rmSync(dir, { recursive: true, force: true });
});
