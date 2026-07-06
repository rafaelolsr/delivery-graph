import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// DEM-014 / NODE-058: `dge done --waive <reason>` is the CLI entry point for the
// waiver escape hatch. All enforcement lives in waiveNode() (src/evidence-engine.mjs);
// these tests prove the CLI actually calls it — a raw `dge done --waive` from a
// terminal must be governed identically to any other caller, and each of the four
// hard guardrails must reject through the CLI, not just the engine unit tests.

const cliPath = path.resolve("bin/dge.mjs");

function run(...args) {
  return execFileSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

function runFails(args) {
  try {
    run(...args);
    return null;
  } catch (error) {
    return error.stderr?.toString() ?? error.stdout?.toString() ?? error.message;
  }
}

function setupGraph(tempDir) {
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  run("init", "--graph", graphPath, "--title", "Waiver graph");
  run("add-demand", "--graph", graphPath, "--title", "Demand", "--source", "test", "--outcome", "Waiver exists");
  run(
    "add-requirement",
    "--graph", graphPath,
    "--demand", "DEM-001",
    "--statement", "Un-provable work can still close",
    "--acceptance", "Waived",
    "--evidence", "N/A"
  );
  run("add-track", "--graph", graphPath, "--title", "Implementation");
  return graphPath;
}

function addNode(graphPath, opts = {}) {
  const args = [
    "add-node", "--graph", graphPath,
    "--title", opts.title ?? "Un-provable node",
    "--type", "implementation",
    "--track", "TRK-implementation",
    "--requirements", "REQ-001",
    "--validation", opts.validation ?? "manual sign-off"
  ];
  if (opts.dependsOn) args.push("--depends-on", opts.dependsOn);
  const output = run(...args);
  const match = output.match(/NODE-\d+/);
  return match[0];
}

test("dge done --waive closes a review node with no evidence and records the reason", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-waive-"));
  const graphPath = setupGraph(tempDir);
  const nodeId = addNode(graphPath);
  run("transition", "--graph", graphPath, nodeId, "in_progress");
  run("transition", "--graph", graphPath, nodeId, "review");

  const output = run("done", "--graph", graphPath, nodeId, "--waive", "No automatable check exists for this manual sign-off");
  assert.match(output, /done-waived/);

  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  const node = graph.nodes.find((n) => n.id === nodeId);
  assert.equal(node.status, "done-waived");
  assert.equal(node.waiver.reason, "No automatable check exists for this manual sign-off");
  assert.ok(node.waiver.waived_at);
});

test("a waived node unblocks a dependent exactly like a done node", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-waive-"));
  const graphPath = setupGraph(tempDir);
  const upstream = addNode(graphPath, { title: "Upstream un-provable node" });
  const downstream = addNode(graphPath, { title: "Downstream node", dependsOn: upstream });

  run("transition", "--graph", graphPath, upstream, "in_progress");
  run("transition", "--graph", graphPath, upstream, "review");
  const output = run("done", "--graph", graphPath, upstream, "--waive", "Un-provable");

  assert.match(output, new RegExp(downstream));
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.equal(graph.nodes.find((n) => n.id === downstream).status, "ready");
});

test("--waive rejects a blank reason", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-waive-"));
  const graphPath = setupGraph(tempDir);
  const nodeId = addNode(graphPath);
  run("transition", "--graph", graphPath, nodeId, "in_progress");
  run("transition", "--graph", graphPath, nodeId, "review");

  const error = runFails(["done", "--graph", graphPath, nodeId, "--waive", ""]);
  assert.match(error, /waiver reason/i);

  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.equal(graph.nodes.find((n) => n.id === nodeId).status, "review");
});

test("--waive rejects a node not in review", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-waive-"));
  const graphPath = setupGraph(tempDir);
  const nodeId = addNode(graphPath);
  // Left in "ready" — never transitioned to review.

  const error = runFails(["done", "--graph", graphPath, nodeId, "--waive", "reason"]);
  assert.match(error, /cannot be waived from status "ready"/);
});

// The incomplete-dependencies guardrail is covered at the engine level
// (tests/evidence-engine.test.mjs: "waiveNode rejects a node with incomplete
// dependencies") by constructing the graph directly. It is not reachable from
// this CLI test: `dge transition ... in_progress` itself enforces the same
// dependency check, so a node can never reach `review` while a dependency is
// incomplete — there is no CLI path that produces the state this guardrail
// exists to reject.

test("--waive rejects a node that already has evidence recorded", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-waive-"));
  const graphPath = setupGraph(tempDir);
  const nodeId = addNode(graphPath, { validation: "npm test" });
  run("transition", "--graph", graphPath, nodeId, "in_progress");
  run("evidence", "--graph", graphPath, "add", nodeId, "--satisfies", "npm test", "--summary", "ran it manually");
  run("transition", "--graph", graphPath, nodeId, "review");

  const error = runFails(["done", "--graph", graphPath, nodeId, "--waive", "reason"]);
  assert.match(error, /has evidence recorded/);
  assert.match(error, /dge verify/);
});
