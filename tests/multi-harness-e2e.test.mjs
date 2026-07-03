import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readGraph, validateGraph } from "../src/graph-engine.mjs";
import {
  DISPATCH_CLASSES,
  makeAdapterRegistry,
  dispatchWithFallback
} from "../src/harness-adapters.mjs";
import { routeNode } from "../src/harness-router.mjs";
import { makeModelSelector, DEFAULT_COST_POLICY } from "../src/harness-cost.mjs";
import { executeNodesInParallel } from "../src/harness-parallel.mjs";

const CLI = fileURLToPath(new URL("../bin/dge.mjs", import.meta.url));

function seed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-e2e-"));
  const graphPath = path.join(dir, "graph.json");
  const run = (...a) => {
    const r = spawnSync("node", [CLI, ...a, "--graph", graphPath], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  run("init", "--title", "e2e");
  run("add-demand", "--title", "D", "--source", "test", "--outcome", "multi-harness e2e");
  run("add-requirement", "--demand", "DEM-001", "--statement", "S", "--acceptance", "a", "--evidence", "e");
  run("add-track", "--title", "T");
  run("add-node", "--title", "A", "--type", "implementation", "--track", "TRK-t", "--requirements", "REQ-001", "--validation", "x");
  run("add-node", "--title", "B", "--type", "research", "--track", "TRK-t", "--requirements", "REQ-001", "--validation", "x");
  const g = readGraph(graphPath);
  return { graphPath, dir, nodes: g.nodes };
}

// A stub adapter returning a scripted class per call, so we can script an infra
// failure that forces fallback, then success.
function scriptedAdapter(id, script) {
  let i = 0;
  return {
    id,
    available: () => ({ ok: true }),
    dispatch() {
      const cls = script[Math.min(i, script.length - 1)];
      i += 1;
      return { class: cls, exitCode: cls === DISPATCH_CLASSES.OK ? 0 : 1, stdout: "", stderr: "" };
    }
  };
}

test("end-to-end: route → infra fallback → parallel execution, store valid throughout", async () => {
  const { graphPath, dir, nodes } = seed();
  const [nodeA, nodeB] = nodes;

  const selectModel = makeModelSelector(DEFAULT_COST_POLICY);

  // 1. ROUTE each node — different types get different harnesses + cost-tiered models.
  const routeA = routeNode(nodeA, { selectModel }); // implementation → claude / opus
  const routeB = routeNode(nodeB, { selectModel }); // research → copilot / mini
  assert.equal(routeA.harness, "claude");
  assert.equal(routeA.model, "claude-opus");
  assert.equal(routeB.harness, "copilot");
  assert.equal(routeB.model, "gpt-mini");
  // Every route is inspectable.
  assert.ok(routeA.rationale && routeB.rationale);

  // 2. FALLBACK — primary claude hits an infra failure, chain falls back to copilot.
  const claude = scriptedAdapter("claude", [DISPATCH_CLASSES.INFRA_FAILURE]);
  const copilot = scriptedAdapter("copilot", [DISPATCH_CLASSES.OK]);
  const registry = makeAdapterRegistry([claude, copilot]);
  const fb = dispatchWithFallback(registry, ["claude", "copilot"], { prompt: "x" });
  assert.equal(fb.class, DISPATCH_CLASSES.OK);
  assert.equal(fb.harness, "copilot"); // fell back, ran successfully

  // 3. PARALLEL execution over the concurrency-safe store — both nodes advance,
  //    dispatched to different harnesses, persisted without loss.
  const dispatch = async (harnessId) =>
    dispatchWithFallback(registry, [harnessId === "claude" ? "copilot" : harnessId], { prompt: "x" });
  const apply = (node) => {
    node.status = "in_progress";
  };
  const results = await executeNodesInParallel(graphPath, [
    { nodeId: nodeA.id, harnessId: routeA.harness, task: {}, dispatch, apply },
    { nodeId: nodeB.id, harnessId: routeB.harness, task: {}, dispatch, apply }
  ]);
  assert.equal(results.length, 2);

  // 4. GATE INTEGRITY — the store is valid after the whole multi-harness flow.
  const finalGraph = readGraph(graphPath);
  assert.deepEqual(validateGraph(finalGraph), []);
  assert.ok(finalGraph.nodes.every((n) => n.status === "in_progress"));

  fs.rmSync(dir, { recursive: true, force: true });
});

test("end-to-end: a work failure blocks and is NOT laundered across harnesses", () => {
  // The whole point, end to end: a genuinely failing node cannot be turned green by
  // routing it around the harnesses.
  const claude = scriptedAdapter("claude", [DISPATCH_CLASSES.WORK_FAILURE]);
  const copilot = scriptedAdapter("copilot", [DISPATCH_CLASSES.OK]);
  const registry = makeAdapterRegistry([claude, copilot]);
  const outcome = dispatchWithFallback(registry, ["claude", "copilot"], { prompt: "x" });
  assert.equal(outcome.class, DISPATCH_CLASSES.WORK_FAILURE);
  assert.equal(outcome.harness, "claude"); // stopped at the failing harness
});
