import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { regenerateArtifacts } from "../src/markdown-artifacts.mjs";
import { validateGraph } from "../src/graph-engine.mjs";

function setup() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-canon-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = {
    graph: { id: "DGE-001", title: "Canon", status: "active" },
    demands: [{ id: "DEM-001", title: "D", source: "test", outcome: "o" }],
    requirements: [
      {
        id: "REQ-001",
        demand_id: "DEM-001",
        priority: "must",
        statement: "s, with a comma",
        acceptance: ["a1", "a2"],
        validation: { method: "automated-test", required_evidence: ["e"] }
      }
    ],
    gaps: [],
    tracks: [{ id: "TRK-x", title: "X" }],
    nodes: []
  };
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));
  return { tempDir, graphPath, graph };
}

test("regenerating the tree from graph.json is byte-for-byte identical", () => {
  const { tempDir, graphPath, graph } = setup();

  const first = regenerateArtifacts(graphPath, graph);
  const before = first.map((p) => fs.readFileSync(p, "utf8"));

  // Delete the derived markdown, then regenerate.
  for (const p of first) fs.rmSync(p);
  const second = regenerateArtifacts(graphPath, graph);
  const after = second.map((p) => fs.readFileSync(p, "utf8"));

  assert.deepEqual(second, first); // same paths
  assert.deepEqual(after, before); // same bytes

  // Artifacts live under the owning demand (demand-centric layout).
  assert.ok(fs.existsSync(path.join(tempDir, "delivery-graph", "demands", "DEM-001", "DEM-001.md")));
  assert.ok(
    fs.existsSync(path.join(tempDir, "delivery-graph", "demands", "DEM-001", "requirements", "REQ-001.md"))
  );
});

test("validateGraph depends only on graph.json, not the folder tree", () => {
  const { graph } = setup();
  // No markdown written at all; validation still passes purely from the graph object.
  assert.deepEqual(validateGraph(graph), []);
});
