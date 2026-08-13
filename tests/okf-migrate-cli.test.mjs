import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cliPath = path.resolve("bin/dge.mjs");

// Build a small real store via the CLI so the OKF preview/write runs against a
// genuine graph.json, not a hand-forged one.
function seedGraph() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "okf-migrate-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  run(graphPath, "init", "--title", "OKF migrate test");
  run(graphPath, "add-demand", "--title", "Demand", "--source", "test", "--summary", "TL;DR", "--outcome", "It works");
  run(graphPath, "add-requirement", "--demand", "DEM-001", "--statement", "A requirement", "--acceptance", "acc", "--evidence", "ev");
  run(graphPath, "add-track", "--title", "Implementation");
  run(graphPath, "add-node", "--title", "A node", "--type", "implementation", "--track", "TRK-implementation",
    "--requirements", "REQ-001", "--validation", "Manual: does the thing with a colon");
  return { tempDir, graphPath };
}

test("`dge okf preview` writes nothing and leaves graph.json byte-identical (no silent migration)", () => {
  const { tempDir, graphPath } = seedGraph();
  try {
    const before = fs.readFileSync(graphPath);
    const okfDirBefore = fs.existsSync(path.join(path.dirname(graphPath), "okf"));

    const out = run(graphPath, "okf", "preview", "--json");
    const summary = JSON.parse(out);

    // The preview reports, but writes nothing.
    assert.equal(summary.action, "preview");
    assert.equal(summary.wrote, false);
    assert.equal(summary.round_trip_lossless, true);
    assert.equal(summary.conformant, true);
    assert.ok(summary.files > 0);

    // graph.json is byte-identical — the no-rewrite regression.
    const after = fs.readFileSync(graphPath);
    assert.ok(before.equals(after), "graph.json must be byte-identical after `okf preview`");
    // …and no bundle directory was created by the preview.
    assert.equal(fs.existsSync(path.join(path.dirname(graphPath), "okf")), okfDirBefore,
      "preview must not create the okf bundle directory");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("`dge okf write` refuses without --confirm and never mutates graph.json", () => {
  const { tempDir, graphPath } = seedGraph();
  try {
    const before = fs.readFileSync(graphPath);
    assert.throws(() => run(graphPath, "okf", "write"), /--confirm/);
    // No bundle written, graph.json untouched.
    assert.ok(!fs.existsSync(path.join(path.dirname(graphPath), "okf")));
    assert.ok(before.equals(fs.readFileSync(graphPath)));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("`dge okf write --confirm` emits the bundle and STILL leaves graph.json byte-identical", () => {
  const { tempDir, graphPath } = seedGraph();
  try {
    const before = fs.readFileSync(graphPath);
    const out = run(graphPath, "okf", "write", "--confirm", "--json");
    const summary = JSON.parse(out);

    assert.equal(summary.wrote, true);
    assert.ok(summary.files.length > 0);
    const okfDir = path.join(path.dirname(graphPath), "okf");
    assert.ok(fs.existsSync(path.join(okfDir, "index.md")), "root index.md written");
    // The bundle exists, but graph.json — the canonical store — is unchanged (ADR-001).
    assert.ok(before.equals(fs.readFileSync(graphPath)), "graph.json must be byte-identical after `okf write`");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function run(graphPath, ...args) {
  return execFileSync(process.execPath, [cliPath, ...args, "--graph", graphPath], { encoding: "utf8" });
}
