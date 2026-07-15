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

// DEM-008 / NODE-026: the shared skill preamble is now one callable command.
// Reaching it proves the CLI is installed; it then gates on the graph and prints
// the "CLI is the only writer" reminder every skill and the conductor depend on.

test("dge preflight passes on a valid graph and prints the writer reminder", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-preflight-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  run("init", "--graph", graphPath, "--title", "Preflight graph");

  const out = run("preflight", "--graph", graphPath);
  assert.match(out, /dge CLI: reachable/);
  assert.match(out, /valid/);
  assert.match(out, /ONLY writer/);
});

test("dge preflight --no-graph passes before init (design's case)", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-preflight-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  // No init: the graph does not exist yet.
  const out = run("preflight", "--no-graph", "--graph", graphPath);
  assert.match(out, /not required/);
  assert.match(out, /ONLY writer/);
});

test("dge preflight exits non-zero when the graph is missing (the stop signal)", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-preflight-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  assert.throws(
    () => run("preflight", "--graph", graphPath),
    /Could not read JSON graph|status 1/
  );
});
