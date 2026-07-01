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

test("CLI captures Playwright evidence with browser artifacts", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-playwright-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const artifactDir = path.join(tempDir, "playwright-results");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "screenshot.png"), "png");

  run("init", "--graph", graphPath, "--title", "Playwright graph");
  run("add-demand", "--graph", graphPath, "--title", "Demand", "--source", "test", "--outcome", "Browser evidence exists");
  run(
    "add-requirement",
    "--graph",
    graphPath,
    "--demand",
    "DEM-001",
    "--statement",
    "Browser proof is captured",
    "--acceptance",
    "Playwright evidence has artifacts",
    "--evidence",
    "browser proof"
  );
  run("add-track", "--graph", graphPath, "--title", "Validation");
  run(
    "add-node",
    "--graph",
    graphPath,
    "--title",
    "Capture browser proof",
    "--type",
    "test",
    "--track",
    "TRK-validation",
    "--requirements",
    "REQ-001",
    "--validation",
    "browser proof"
  );

  const output = run(
    "evidence",
    "playwright",
    "NODE-001",
    "--graph",
    graphPath,
    "--satisfies",
    "browser proof",
    "--summary",
    "browser flow passed",
    "--url",
    "http://localhost:3000",
    "--script",
    "tests/e2e/app.spec.ts",
    "--artifacts",
    artifactDir,
    "--",
    process.execPath,
    "-e",
    "console.log(process.env.DGE_EVIDENCE_URL)"
  );

  assert.match(output, /"kind": "playwright"/);
  const evidence = JSON.parse(fs.readFileSync(path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "evidence.json"), "utf8"));
  assert.equal(evidence.items[0].kind, "playwright");
  assert.equal(evidence.items[0].metadata.url, "http://localhost:3000");

  const evidenceDir = path.join(tempDir, "delivery-graph", "evidence", "NODE-001");
  const commandArtifact = JSON.parse(fs.readFileSync(path.join(evidenceDir, evidence.items[0].artifact), "utf8"));
  assert.match(commandArtifact.stdout, /http:\/\/localhost:3000/);
  assert.equal(fs.readFileSync(path.join(evidenceDir, commandArtifact.artifacts[0], "screenshot.png"), "utf8"), "png");
});

test("CLI captures failed Playwright attempts without satisfying evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-playwright-fail-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");

  run("init", "--graph", graphPath, "--title", "Playwright failed graph");
  run("add-demand", "--graph", graphPath, "--title", "Demand", "--source", "test", "--outcome", "Browser evidence can fail");
  run(
    "add-requirement",
    "--graph",
    graphPath,
    "--demand",
    "DEM-001",
    "--statement",
    "Browser proof must pass",
    "--acceptance",
    "Failed Playwright does not count",
    "--evidence",
    "browser proof"
  );
  run("add-track", "--graph", graphPath, "--title", "Validation");
  run(
    "add-node",
    "--graph",
    graphPath,
    "--title",
    "Fail browser proof",
    "--type",
    "test",
    "--track",
    "TRK-validation",
    "--requirements",
    "REQ-001",
    "--validation",
    "browser proof"
  );

  assert.throws(
    () => run(
      "evidence",
      "playwright",
      "NODE-001",
      "--graph",
      graphPath,
      "--satisfies",
      "browser proof",
      "--",
      process.execPath,
      "-e",
      "process.exit(9)"
    ),
    /Command failed with exit code 9; output artifact:/
  );

  assert.equal(fs.existsSync(path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "evidence.json")), false);
  assert.equal(fs.readdirSync(path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "artifacts")).filter((file) => file.includes("playwright")).length, 1);
});

test("CLI next walks the ready queue as dependencies complete", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-next-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");

  run("init", "--graph", graphPath, "--title", "Next graph");
  run("add-demand", "--graph", graphPath, "--title", "Demand", "--source", "test", "--outcome", "The queue advances");
  run(
    "add-requirement",
    "--graph",
    graphPath,
    "--demand",
    "DEM-001",
    "--statement",
    "next returns the head of the ready queue",
    "--acceptance",
    "next advances when a dependency completes",
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

  const first = JSON.parse(run("next", "--graph", graphPath, "--json"));
  assert.equal(first.next.id, "NODE-001");
  assert.equal(first.ready_count, 1);
  assert.equal(first.done_count, 0);
  assert.equal(first.remaining_count, 2);

  completeNode(graphPath, "NODE-001", "parent proof");

  const second = JSON.parse(run("next", "--graph", graphPath, "--json"));
  assert.equal(second.next.id, "NODE-002");
  assert.equal(second.done_count, 1);
  assert.equal(second.remaining_count, 1);

  completeNode(graphPath, "NODE-002", "child proof");

  const third = JSON.parse(run("next", "--graph", graphPath, "--json"));
  assert.equal(third.next, null);
  assert.equal(third.ready_count, 0);
  assert.equal(third.remaining_count, 0);
});

function completeNode(graphPath, nodeId, satisfies) {
  run(
    "evidence",
    "run",
    nodeId,
    "--graph",
    graphPath,
    "--satisfies",
    satisfies,
    "--",
    process.execPath,
    "-e",
    "console.log('proof')"
  );
  run("done", nodeId, "--graph", graphPath);
}

function run(...args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}
