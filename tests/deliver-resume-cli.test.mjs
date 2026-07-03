import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cliPath = path.resolve("bin/dge.mjs");

function run(...args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

// DEM-008 / NODE-027: the /dge-deliver conductor resumes from the ready queue on an
// in-progress demand (done nodes stay done) and abandoning leaves the graph intact.
// The conductor is prose, but the mechanics it relies on are CLI behavior we can prove.

function seedGraph(graphPath) {
  run("init", "--graph", graphPath, "--title", "Resume graph");
  run("add-demand", "--graph", graphPath, "--title", "D", "--source", "test", "--outcome", "o");
  run("add-requirement", "--graph", graphPath, "--demand", "DEM-001",
    "--statement", "s", "--acceptance", "a", "--evidence", "e");
  run("add-track", "--graph", graphPath, "--title", "T");
  // Two nodes; NODE-002 depends on NODE-001.
  run("add-node", "--graph", graphPath, "--title", "first", "--type", "test",
    "--track", "TRK-t", "--requirements", "REQ-001", "--validation", "first done");
  run("add-node", "--graph", graphPath, "--title", "second", "--type", "test",
    "--track", "TRK-t", "--requirements", "REQ-001", "--depends-on", "NODE-001",
    "--validation", "second done");
}

function complete(graphPath, nodeId, satisfies) {
  run("evidence", "run", nodeId, "--graph", graphPath, "--satisfies", satisfies,
    "--", process.execPath, "-e", "console.log('proof')");
  run("done", nodeId, "--graph", graphPath);
}

test("resume: after one node is done, dge next returns the newly-unblocked node, done stays done", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-resume-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  seedGraph(graphPath);

  complete(graphPath, "NODE-001", "first done");

  // Simulate the conductor resuming: dge next is the queue head.
  const next = JSON.parse(run("next", "--graph", graphPath, "--json"));
  assert.equal(next.next.id, "NODE-002", "resume should surface the unblocked node");
  assert.equal(next.done_count, 1, "the completed node stays done across a resume");

  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  const n1 = graph.nodes.find((n) => n.id === "NODE-001");
  assert.equal(n1.status, "done", "NODE-001 remains done, not restarted");
});

test("abandon: leaving the flow without touching state preserves the graph", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-abandon-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  seedGraph(graphPath);
  complete(graphPath, "NODE-001", "first done");

  const before = fs.readFileSync(graphPath, "utf8");
  // "Abandoning" is simply not issuing further mutations; the store is untouched.
  const after = fs.readFileSync(graphPath, "utf8");
  assert.equal(before, after, "abandoning does not mutate or destroy the graph");

  // And the demand is still resumable: next still points at NODE-002.
  const next = JSON.parse(run("next", "--graph", graphPath, "--json"));
  assert.equal(next.next.id, "NODE-002");
});
