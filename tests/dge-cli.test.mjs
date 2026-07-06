import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cliPath = path.resolve("bin/dge.mjs");

test("CLI authors a graph end-to-end", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-cli-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");

  run("init", "--graph", graphPath, "--title", "CLI graph");
  run("add-demand", "--graph", graphPath, "--title", "Demand", "--source", "test", "--outcome", "Graph exists");
  run(
    "add-requirement",
    "--graph",
    graphPath,
    "--demand",
    "DEM-001",
    "--statement",
    "CLI can add requirements",
    "--acceptance",
    "Requirement exists",
    "--evidence",
    "Validation output"
  );
  run("add-track", "--graph", graphPath, "--title", "Implementation");
  run(
    "add-node",
    "--graph",
    graphPath,
    "--title",
    "Implement CLI",
    "--type",
    "implementation",
    "--track",
    "TRK-implementation",
    "--requirements",
    "REQ-001",
    "--validation",
    "npm test"
  );

  const status = run("status", "--graph", graphPath);
  assert.match(status, /NODE-001 Implement CLI/);

  const explicitStatusPath = path.join(tempDir, "delivery-graph", "reports", "status.md");
  const statusWithOut = run("status", "--graph", graphPath, "--out", explicitStatusPath);
  assert.match(statusWithOut, /status report:/);
  assert.match(fs.readFileSync(explicitStatusPath, "utf8"), /NODE-001 Implement CLI/);

  const statusWithSave = run("status", "--graph", graphPath, "--save");
  assert.match(statusWithSave, /status report:/);
  assert.equal(fs.readdirSync(path.join(tempDir, "delivery-graph", "reports")).filter((file) => file.startsWith("status-")).length, 1);

  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.equal(graph.demands.length, 1);
  assert.equal(graph.requirements.length, 1);
  assert.equal(graph.tracks.length, 1);
  assert.equal(graph.nodes.length, 1);
});

test("CLI status --demand scopes the board and progress line to one demand", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-cli-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");

  run("init", "--graph", graphPath, "--title", "CLI graph");
  run("add-demand", "--graph", graphPath, "--title", "First demand", "--source", "test", "--outcome", "First outcome");
  run("add-demand", "--graph", graphPath, "--title", "Second demand", "--source", "test", "--outcome", "Second outcome");
  run("add-requirement", "--graph", graphPath, "--demand", "DEM-001", "--statement", "First req", "--acceptance", "a", "--evidence", "e");
  run("add-requirement", "--graph", graphPath, "--demand", "DEM-002", "--statement", "Second req", "--acceptance", "a", "--evidence", "e");
  run("add-track", "--graph", graphPath, "--title", "Implementation");
  run("add-node", "--graph", graphPath, "--title", "Node one", "--type", "implementation", "--track", "TRK-implementation", "--requirements", "REQ-001", "--validation", "npm test");
  run("add-node", "--graph", graphPath, "--title", "Node two", "--type", "implementation", "--track", "TRK-implementation", "--requirements", "REQ-002", "--validation", "npm test");

  const scoped = run("status", "--graph", graphPath, "--demand", "DEM-001");
  assert.match(scoped, /Node one/);
  assert.doesNotMatch(scoped, /Node two/);
  assert.match(scoped, /Intake ✅ → Plan ✅ → Execute 🟡 \(0\/1\) → Verify ⚪ → Done ⚪/);

  const unscoped = run("status", "--graph", graphPath);
  assert.match(unscoped, /Node one/);
  assert.match(unscoped, /Node two/);
});

test("CLI writes Azure DevOps dry-run sync map", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-cli-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");

  run("init", "--graph", graphPath, "--title", "ADO graph");
  run("add-demand", "--graph", graphPath, "--title", "Demand", "--source", "test", "--outcome", "ADO sync exists");
  run(
    "add-requirement",
    "--graph",
    graphPath,
    "--demand",
    "DEM-001",
    "--statement",
    "CLI can sync ADO tasks",
    "--acceptance",
    "ADO sync map exists",
    "--evidence",
    "Sync output"
  );
  run("add-track", "--graph", graphPath, "--title", "Implementation");
  run(
    "add-node",
    "--graph",
    graphPath,
    "--title",
    "Implement ADO sync",
    "--type",
    "implementation",
    "--track",
    "TRK-implementation",
    "--requirements",
    "REQ-001",
    "--validation",
    "npm test"
  );

  const output = run(
    "sync",
    "--graph",
    graphPath,
    "ado",
    "--org",
    "ORG",
    "--project",
    "PROJECT",
    "--area",
    "PROJECT\\Area",
    "--iteration",
    "PROJECT\\Sprint 1"
  );
  assert.match(output, /ado sync dry-run: 1 operation/);

  const sync = JSON.parse(fs.readFileSync(path.join(tempDir, "delivery-graph", "sync", "ado.json"), "utf8"));
  assert.equal(sync.target, "ado");
  assert.equal(sync.organization, "ORG");
  assert.equal(sync.project, "PROJECT");
  assert.equal(sync.nodes["NODE-001"].ado_task_id, "dry-run:NODE-001");
  assert.equal(sync.nodes["NODE-001"].payload.fields["System.AreaPath"], "PROJECT\\Area");
});

function run(...args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8"
  });
}
