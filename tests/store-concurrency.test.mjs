import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ConcurrentModificationError,
  readGraph,
  readGraphRev,
  writeGraph
} from "../src/graph-engine.mjs";
import { createGraph } from "../src/graph-authoring.mjs";

function tempGraphPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-cas-"));
  return path.join(dir, "graph.json");
}

function seed() {
  const graphPath = tempGraphPath();
  const graph = createGraph({ title: "CAS test", createdAt: "2026-07-03T00:00:00Z" });
  writeGraph(graphPath, graph); // rev 0 -> 1
  return graphPath;
}

test("createGraph seeds rev at 0", () => {
  const graph = createGraph({ title: "x", createdAt: "2026-07-03T00:00:00Z" });
  assert.equal(graph.graph.rev, 0);
});

test("writeGraph bumps rev on every write", () => {
  const graphPath = seed();
  assert.equal(readGraphRev(graphPath), 1);
  writeGraph(graphPath, readGraph(graphPath));
  assert.equal(readGraphRev(graphPath), 2);
});

test("readGraphRev returns 0 for a missing store", () => {
  const graphPath = tempGraphPath(); // never written
  assert.equal(readGraphRev(graphPath), 0);
});

test("writeGraph with a matching expectedRev commits", () => {
  const graphPath = seed(); // rev 1
  const rev = readGraphRev(graphPath);
  const next = writeGraph(graphPath, readGraph(graphPath), { expectedRev: rev });
  assert.equal(next, rev + 1);
});

test("writeGraph with a stale expectedRev throws ConcurrentModificationError and does not clobber", () => {
  const graphPath = seed(); // rev 1
  const staleRev = readGraphRev(graphPath); // 1

  // A concurrent writer commits first, advancing rev to 2.
  writeGraph(graphPath, readGraph(graphPath));
  assert.equal(readGraphRev(graphPath), 2);

  // Our write, still holding the stale rev, must be refused — not silently lost.
  assert.throws(
    () => writeGraph(graphPath, readGraph(graphPath), { expectedRev: staleRev }),
    (error) => {
      assert.ok(error instanceof ConcurrentModificationError);
      assert.equal(error.expectedRev, staleRev);
      assert.equal(error.actualRev, 2);
      return true;
    }
  );

  // The concurrent writer's commit survives intact.
  assert.equal(readGraphRev(graphPath), 2);
});
