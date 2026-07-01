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
    "npm test"
  );

  assert.ok(fs.existsSync(path.join(tempDir, "delivery-graph", "demands", "DEM-001.md")));
  assert.ok(fs.existsSync(path.join(tempDir, "delivery-graph", "requirements", "REQ-001.md")));

  const missingStatus = run("status", "--graph", graphPath);
  assert.match(missingStatus, /Missing validation evidence/);
  assert.match(missingStatus, /NODE-001: npm test/);

  run("transition", "NODE-001", "in_progress", "--graph", graphPath);
  run("transition", "NODE-001", "review", "--graph", graphPath);

  assert.throws(
    () => run("verify", "NODE-001", "--graph", graphPath),
    /missing validation evidence/
  );

  run(
    "evidence",
    "add",
    "NODE-001",
    "--graph",
    graphPath,
    "--satisfies",
    "npm test",
    "--summary",
    "npm test passed"
  );

  const verifiedOutput = run("verify", "NODE-001", "--graph", graphPath);
  assert.match(verifiedOutput, /NODE-001 verified/);
  assert.match(verifiedOutput, /verification report:/);

  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.equal(graph.nodes[0].status, "verified");

  run("transition", "NODE-001", "done", "--graph", graphPath);
  const doneGraph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.equal(doneGraph.nodes[0].status, "done");
  assert.match(
    fs.readFileSync(path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "verification.md"), "utf8"),
    /npm test: satisfied/
  );

  const reviewOutput = run("review", "--graph", graphPath);
  assert.match(reviewOutput, /review report:/);

  const reportsDir = path.join(tempDir, "delivery-graph", "reports");
  assert.equal(fs.readdirSync(reportsDir).filter((file) => file.startsWith("review-")).length, 1);
});

function run(...args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}
