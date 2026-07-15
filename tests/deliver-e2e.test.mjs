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

// DEM-008 / NODE-032 (REQ-026, REQ-036): the scripted proof that the mechanical
// chain the /dge-deliver conductor drives runs end to end through the CLI, from
// demand to an evidence-gated `done`, producing both gate-brief artifacts along
// the way. The conductor's *conversational* parts (design grill, gate approvals)
// are prose; this proves the CLI spine they sit on is complete and continuous.

test("the /dge-deliver spine runs demand -> brief -> plan -> graph -> execute -> done", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-e2e-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");

  // Design phase (CLI writes; conductor would drive this from the grill).
  run("init", "--graph", graphPath, "--title", "E2E demand");
  run("add-demand", "--graph", graphPath, "--title", "Ship it", "--source", "user", "--outcome", "done with proof");
  run("add-requirement", "--graph", graphPath, "--demand", "DEM-001",
    "--statement", "the thing works", "--acceptance", "verified with evidence", "--evidence", "test output");

  // Gate 1 artifact renders from graph.json.
  const demandBrief = run("brief", "demand", "DEM-001", "--graph", graphPath);
  assert.match(demandBrief, /DEM-001/);
  assert.match(demandBrief, /REQ-001/);

  // Plan phase.
  run("add-track", "--graph", graphPath, "--title", "Build");
  run("add-node", "--graph", graphPath, "--title", "do it", "--type", "test",
    "--track", "TRK-build", "--requirements", "REQ-001", "--validation", "it passes");

  // Gate 2 artifact renders the dependency tree + ready queue from graph.json
  // (Mermaid is opt-in via --mermaid, so the default brief has no fence).
  const graphBrief = run("brief", "graph", "DEM-001", "--graph", graphPath);
  assert.match(graphBrief, /## Plan/);
  assert.doesNotMatch(graphBrief, /```mermaid/);
  assert.match(graphBrief, /NODE-001/);
  assert.match(graphBrief, /Ready-queue order/);
  // --mermaid opt-in still yields the DAG fence.
  const mermaidBrief = run("brief", "graph", "DEM-001", "--mermaid", "--graph", graphPath);
  assert.match(mermaidBrief, /```mermaid/);

  // Execute phase: the queue head is NODE-001, then evidence-gated done.
  const next = JSON.parse(run("next", "--graph", graphPath, "--json"));
  assert.equal(next.next.id, "NODE-001");

  run("evidence", "run", "NODE-001", "--graph", graphPath,
    "--satisfies", "it passes", "--", process.execPath, "-e", "console.log('proof')");
  run("done", "NODE-001", "--graph", graphPath);

  // Summary phase: the queue is dry and the node is done with evidence.
  const after = JSON.parse(run("next", "--graph", graphPath, "--json"));
  assert.equal(after.next, null, "queue is dry after the last node");
  assert.equal(after.done_count, 1);

  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.equal(graph.nodes[0].status, "done");
});
