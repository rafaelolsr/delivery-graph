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

function run(...args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8"
  });
}
