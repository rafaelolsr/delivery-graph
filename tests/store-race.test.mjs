import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";

const CLI = fileURLToPath(new URL("../bin/dge.mjs", import.meta.url));

function tempGraphPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-race-"));
  return path.join(dir, "graph.json");
}

// REQ-048: concurrent writers must not lose updates. This spawns N real OS
// processes that each add a track to the same store at once, then asserts all N
// landed and the store is still valid — the true concurrency proof (the guard
// unit tests in store-concurrency.test.mjs only exercise sequential calls).
test("N concurrent writers all persist with no lost or corrupted writes", async () => {
  const graphPath = tempGraphPath();
  const init = spawnSync("node", [CLI, "init", "--title", "race", "--graph", graphPath], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);

  const N = 20;
  const writers = Array.from({ length: N }, (_, i) =>
    new Promise((resolve) => {
      const child = spawn("node", [CLI, "add-track", "--title", `Track ${i}`, "--graph", graphPath], {
        stdio: "ignore"
      });
      child.on("exit", (code) => resolve(code));
    })
  );
  const codes = await Promise.all(writers);
  assert.ok(codes.every((c) => c === 0), `some writers failed: ${codes.filter((c) => c !== 0).length}`);

  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.equal(graph.tracks.length, N, `expected ${N} tracks, found ${graph.tracks.length} (lost writes)`);

  // Every title survived exactly once — no clobber, no duplication.
  const titles = new Set(graph.tracks.map((t) => t.title));
  assert.equal(titles.size, N);

  // Store is still schema-valid after the race.
  const validate = spawnSync("node", [CLI, "validate", "--graph", graphPath], { encoding: "utf8" });
  assert.equal(validate.status, 0, validate.stdout + validate.stderr);

  // No lock file leaked.
  assert.equal(fs.existsSync(`${graphPath}.lock`), false, "store lock leaked");

  fs.rmSync(path.dirname(graphPath), { recursive: true, force: true });
});
