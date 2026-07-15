import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../bin/dge.mjs", import.meta.url));

test("verification-plan exposes a fresh risk-based verifier decision", () => {
  const { dir, graphPath } = seed("implementation");
  const result = run(graphPath, [
    "verification-plan",
    "NODE-001",
    "--builder-run",
    "build-001",
    "--builder-harness",
    "claude",
    "--harness",
    "claude",
    "--harness",
    "copilot",
    "--json"
  ]);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.risk, "standard");
  assert.equal(plan.builder.run_id, "build-001");
  assert.equal(plan.verifier.harness, "copilot");
  assert.equal(plan.requires_fresh_context, true);
  assert.equal(plan.context_policy, "contract-diff-evidence-only");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("verification-plan fails closed for high-risk work without another harness", () => {
  const { dir, graphPath } = seed("release");
  const result = run(graphPath, [
    "verification-plan",
    "NODE-001",
    "--builder-run",
    "build-001",
    "--builder-harness",
    "claude",
    "--harness",
    "claude",
    "--json"
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires a verifier harness different/);
  fs.rmSync(dir, { recursive: true, force: true });
});

function seed(nodeType) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-verification-plan-"));
  const graphPath = path.join(dir, "graph.json");
  for (const args of [
    ["init", "--title", "verification policy"],
    ["add-demand", "--title", "D", "--source", "test", "--outcome", "verified"],
    ["add-requirement", "--demand", "DEM-001", "--statement", "S", "--acceptance", "A", "--evidence", "E"],
    ["add-track", "--title", "T"],
    [
      "add-node",
      "--title",
      "N",
      "--type",
      nodeType,
      "--track",
      "TRK-t",
      "--requirements",
      "REQ-001",
      "--validation",
      "npm test"
    ]
  ]) {
    const result = run(graphPath, args);
    assert.equal(result.status, 0, result.stderr);
  }
  return { dir, graphPath };
}

function run(graphPath, args) {
  return spawnSync("node", [CLI, ...args, "--graph", graphPath], { encoding: "utf8" });
}
