import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cliPath = path.resolve("bin/dge.mjs");

test("CLI writes Linear dry-run sync map", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-linear-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const syncPath = path.join(tempDir, "delivery-graph", "sync", "linear.json");

  run("init", "--graph", graphPath, "--title", "Linear graph");
  run("add-demand", "--graph", graphPath, "--title", "Demand", "--source", "test", "--outcome", "Linear sync exists");
  run(
    "add-requirement",
    "--graph",
    graphPath,
    "--demand",
    "DEM-001",
    "--statement",
    "Node syncs to Linear",
    "--acceptance",
    "Sync map exists",
    "--evidence",
    "Sync map JSON"
  );
  run("add-track", "--graph", graphPath, "--title", "Sync");
  run(
    "add-node",
    "--graph",
    graphPath,
    "--title",
    "Sync node",
    "--type",
    "implementation",
    "--track",
    "TRK-sync",
    "--requirements",
    "REQ-001",
    "--validation",
    "npm test"
  );

  const output = run("sync", "linear", "--graph", graphPath, "--team-id", "TEAM");
  assert.match(output, /linear sync dry-run: 1 operation/);

  const syncMap = JSON.parse(fs.readFileSync(syncPath, "utf8"));
  assert.equal(syncMap.target, "linear");
  assert.equal(syncMap.team_id, "TEAM");
  assert.equal(syncMap.nodes["NODE-001"].action, "create");
  assert.equal(syncMap.nodes["NODE-001"].linear_issue_id, "dry-run:NODE-001");
});

function run(...args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8"
  });
}
