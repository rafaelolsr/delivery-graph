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

// DEM-008 / NODE-030 (REQ-035): quiet/silent execution changes reporting, never
// gating. The regression: the full done path the conductor drives cannot reach
// `done` without a genuine passing evidence artifact — not with no evidence, and
// not with an ambiguous/fail note. verified stays CLI-minted-only.

function seedOneNode(graphPath) {
  run("init", "--graph", graphPath, "--title", "Silent-mode graph");
  run("add-demand", "--graph", graphPath, "--title", "D", "--source", "t", "--outcome", "o");
  run("add-requirement", "--graph", graphPath, "--demand", "DEM-001",
    "--statement", "s", "--acceptance", "a", "--evidence", "e");
  run("add-track", "--graph", graphPath, "--title", "T");
  run("add-node", "--graph", graphPath, "--title", "n", "--type", "test",
    "--track", "TRK-t", "--requirements", "REQ-001", "--validation", "the contract item");
}

test("done is impossible with NO evidence (even on the quiet path)", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-silent-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  seedOneNode(graphPath);

  assert.throws(
    () => run("done", "NODE-001", "--graph", graphPath),
    /missing validation evidence|must be verified/
  );
  // Node did not advance to done.
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.notEqual(graph.nodes[0].status, "done");
});

test("done is impossible when the only evidence is ambiguous", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-silent-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  seedOneNode(graphPath);

  run("evidence", "add", "NODE-001", "--graph", graphPath,
    "--satisfies", "the contract item", "--summary", "present but wrong",
    "--result", "ambiguous");

  assert.throws(
    () => run("done", "NODE-001", "--graph", graphPath),
    /missing validation evidence|must be verified/
  );
});

test("done succeeds only with a genuine passing evidence artifact on disk", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-silent-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  seedOneNode(graphPath);

  run("evidence", "run", "NODE-001", "--graph", graphPath,
    "--satisfies", "the contract item", "--", process.execPath, "-e", "console.log('proof')");
  run("done", "NODE-001", "--graph", graphPath);

  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.equal(graph.nodes[0].status, "done");

  // And the evidence really is on disk (not a phantom pass).
  const manifest = path.join(tempDir, "delivery-graph", "demands", "DEM-001", "evidence", "NODE-001", "evidence.json");
  assert.ok(fs.existsSync(manifest), "evidence artifact exists on disk");
});
