import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// REQ-041 / NODE-048: the first mutation in a repo with no graph auto-creates the
// store at the DEFAULT path delivery-graph/graph.json and prints a notice; an
// explicit --graph pointing at a missing file still fails loudly (no accidental
// second store). Exercised through the real CLI in a throwaway repo.

const CLI = fileURLToPath(new URL("../bin/dge.mjs", import.meta.url));

function runCli(cwd, argv) {
  return spawnSync(process.execPath, [CLI, ...argv], { cwd, encoding: "utf8" });
}

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dge-autocreate-"));
}

test("first add-* with no graph auto-creates the store at the default path and prints a notice", () => {
  const repo = tmpRepo();
  try {
    const defaultPath = path.join(repo, "delivery-graph", "graph.json");
    assert.equal(fs.existsSync(defaultPath), false, "precondition: no store yet");

    const result = runCli(repo, [
      "add-demand",
      "--title", "First demand",
      "--source", "user",
      "--outcome", "The store exists after the first mutation"
    ]);

    assert.equal(result.status, 0, `add-demand should succeed:\n${result.stderr}`);
    assert.equal(fs.existsSync(defaultPath), true, "store created at the default path");
    assert.match(result.stdout, /created store at delivery-graph\/graph\.json/, "prints a one-line notice");

    // and it is a real, valid store holding the demand
    const validate = runCli(repo, ["validate"]);
    assert.equal(validate.status, 0, `validate should pass:\n${validate.stderr}`);
    const store = JSON.parse(fs.readFileSync(defaultPath, "utf8"));
    assert.equal(store.demands.length, 1);
    assert.equal(store.demands[0].title, "First demand");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("an explicit --graph at a missing path still fails loudly (no accidental second store)", () => {
  const repo = tmpRepo();
  try {
    const explicit = path.join(repo, "custom", "elsewhere.json");
    const result = runCli(repo, [
      "add-demand",
      "--graph", explicit,
      "--title", "Should not be created",
      "--source", "user",
      "--outcome", "irrelevant"
    ]);

    assert.notEqual(result.status, 0, "explicit missing --graph must fail, not auto-create");
    assert.equal(fs.existsSync(explicit), false, "no store written at the explicit path");
    // and it did NOT silently fall back to the default path either
    assert.equal(
      fs.existsSync(path.join(repo, "delivery-graph", "graph.json")),
      false,
      "no accidental default store"
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("the auto-created default store is reused (not recreated) on the next mutation", () => {
  const repo = tmpRepo();
  try {
    const first = runCli(repo, ["add-demand", "--title", "One", "--source", "user", "--outcome", "o"]);
    assert.equal(first.status, 0, first.stderr);

    const second = runCli(repo, ["add-demand", "--title", "Two", "--source", "user", "--outcome", "o"]);
    assert.equal(second.status, 0, second.stderr);
    assert.doesNotMatch(second.stdout, /created store/, "second mutation reuses the store, no notice");

    const store = JSON.parse(fs.readFileSync(path.join(repo, "delivery-graph", "graph.json"), "utf8"));
    assert.equal(store.demands.length, 2, "both demands recorded in the same store");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
