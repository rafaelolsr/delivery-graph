import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cliPath = path.resolve("bin/dge.mjs");

test("CLI supports usable local loop through evidence, verify, status, and review", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-usable-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");

  run("init", "--graph", graphPath, "--title", "Usable graph");
  run("add-demand", "--graph", graphPath, "--title", "Demand", "--source", "test", "--outcome", "DGE is usable");
  run(
    "add-requirement",
    "--graph",
    graphPath,
    "--demand",
    "DEM-001",
    "--statement",
    "Evidence gates completion",
    "--acceptance",
    "Node verifies only with evidence",
    "--evidence",
    "Evidence manifest"
  );
  run("add-track", "--graph", graphPath, "--title", "Validation");
  run(
    "add-node",
    "--graph",
    graphPath,
    "--title",
    "Verify node",
    "--type",
    "test",
    "--track",
    "TRK-validation",
    "--requirements",
    "REQ-001",
    "--validation",
    "node proof command"
  );

  assert.ok(fs.existsSync(path.join(tempDir, "delivery-graph", "demands", "DEM-001.md")));
  assert.ok(fs.existsSync(path.join(tempDir, "delivery-graph", "requirements", "REQ-001.md")));

  const missingStatus = run("status", "--graph", graphPath);
  assert.match(missingStatus, /Missing validation evidence/);
  assert.match(missingStatus, /NODE-001: node proof command/);

  run("transition", "NODE-001", "in_progress", "--graph", graphPath);
  run("transition", "NODE-001", "review", "--graph", graphPath);

  assert.throws(
    () => run("done", "NODE-001", "--graph", graphPath),
    /missing validation evidence/
  );

  assert.throws(
    () => run(
      "evidence",
      "run",
      "NODE-001",
      "--graph",
      graphPath,
      "--satisfies",
      "node proof command",
      "--",
      process.execPath,
      "-e",
      "process.exit(7)"
    ),
    /Command failed with exit code 7; output artifact:/
  );
  assert.equal(fs.existsSync(path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "evidence.json")), false);

  run(
    "evidence",
    "run",
    "NODE-001",
    "--graph",
    graphPath,
    "--satisfies",
    "node proof command",
    "--summary",
    "proof command passed",
    "--",
    process.execPath,
    "-e",
    "console.log('proof')"
  );

  const doneOutput = run("done", "NODE-001", "--graph", graphPath);
  assert.match(doneOutput, /NODE-001 done/);
  assert.match(doneOutput, /evidence manifest:/);
  assert.match(doneOutput, /verification report:/);
  assert.match(doneOutput, /review report:/);

  const doneGraph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.equal(doneGraph.nodes[0].status, "done");
  assert.match(
    fs.readFileSync(path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "verification.md"), "utf8"),
    /node proof command: satisfied/
  );

  const reportsDir = path.join(tempDir, "delivery-graph", "reports");
  assert.equal(fs.readdirSync(reportsDir).filter((file) => file.startsWith("review-")).length, 1);
});

test("CLI done blocks unresolved review blockers", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-done-blocked-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");

  run("init", "--graph", graphPath, "--title", "Done blocked graph");
  run("add-demand", "--graph", graphPath, "--title", "Demand", "--source", "test", "--outcome", "Blockers stop done");
  run(
    "add-requirement",
    "--graph",
    graphPath,
    "--demand",
    "DEM-001",
    "--statement",
    "Done requires clean review",
    "--acceptance",
    "Done fails when blocker gaps remain",
    "--evidence",
    "proof"
  );
  run("add-track", "--graph", graphPath, "--title", "Validation");
  run(
    "add-node",
    "--graph",
    graphPath,
    "--title",
    "Blocked done",
    "--type",
    "test",
    "--track",
    "TRK-validation",
    "--requirements",
    "REQ-001",
    "--validation",
    "proof"
  );
  run("transition", "NODE-001", "in_progress", "--graph", graphPath);
  run("transition", "NODE-001", "review", "--graph", graphPath);
  run(
    "evidence",
    "run",
    "NODE-001",
    "--graph",
    graphPath,
    "--satisfies",
    "proof",
    "--",
    process.execPath,
    "-e",
    "console.log('proof')"
  );
  run("add-gap", "--graph", graphPath, "--type", "validation", "--severity", "blocker", "--question", "Still blocked?", "--blocks", "REQ-001");

  assert.throws(
    () => run("done", "NODE-001", "--graph", graphPath),
    /Review blockers prevent done: GAP-001: Still blocked\?/
  );
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.equal(graph.nodes[0].status, "review");
  assert.equal(fs.readdirSync(path.join(tempDir, "delivery-graph", "reports")).filter((file) => file.startsWith("review-")).length, 1);
});

test("CLI done requires dependencies to be done", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-done-deps-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");

  run("init", "--graph", graphPath, "--title", "Dependency graph");
  run("add-demand", "--graph", graphPath, "--title", "Demand", "--source", "test", "--outcome", "Dependencies block done");
  run(
    "add-requirement",
    "--graph",
    graphPath,
    "--demand",
    "DEM-001",
    "--statement",
    "Done honors dependencies",
    "--acceptance",
    "Dependent node cannot be done first",
    "--evidence",
    "proof"
  );
  run("add-track", "--graph", graphPath, "--title", "Validation");
  run(
    "add-node",
    "--graph",
    graphPath,
    "--title",
    "Parent",
    "--type",
    "test",
    "--track",
    "TRK-validation",
    "--requirements",
    "REQ-001",
    "--validation",
    "parent proof"
  );
  run(
    "add-node",
    "--graph",
    graphPath,
    "--title",
    "Child",
    "--type",
    "test",
    "--track",
    "TRK-validation",
    "--requirements",
    "REQ-001",
    "--depends-on",
    "NODE-001",
    "--validation",
    "child proof"
  );
  run(
    "evidence",
    "run",
    "NODE-002",
    "--graph",
    graphPath,
    "--satisfies",
    "child proof",
    "--",
    process.execPath,
    "-e",
    "console.log('child proof')"
  );

  assert.throws(
    () => run("done", "NODE-002", "--graph", graphPath),
    /NODE-002 cannot be done; incomplete dependencies: NODE-001/
  );
});

function run(...args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}
