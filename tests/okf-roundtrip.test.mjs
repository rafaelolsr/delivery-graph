import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { graphToBundle } from "../src/okf-bundle.mjs";
import { bundleToGraph, roundTrip, diffGraphs } from "../src/okf-compat.mjs";

// A hand-built "new format" graph exercising every field the bundle preserves.
function newFormatGraph() {
  return {
    graph: { id: "DEM-021", title: "OKF knowledge core", status: "active" },
    demands: [
      {
        id: "DEM-021",
        title: "OKF knowledge core",
        summary: "OKF v0.2 bundle projection.",
        outcome: "A projection exists and round-trips.",
        constraints: ["graph.json stays canonical", "no silent migration"],
        non_goals: ["the governor"]
      }
    ],
    requirements: [
      {
        id: "REQ-092",
        demand_id: "DEM-021",
        statement: "Add a compatibility reader plus round-trip.",
        priority: "must",
        acceptance: ["round-trip proves no loss", "IDs stable"]
      }
    ],
    gaps: [],
    tracks: [{ id: "TRK-implementation", title: "Implementation" }],
    nodes: [
      {
        id: "NODE-088",
        title: "Compatibility reader + round-trip",
        type: "implementation",
        track: "TRK-implementation",
        requirement_ids: ["REQ-092"],
        depends_on: ["NODE-087"],
        status: "in_progress",
        validation: {
          required: ["round-trip over fixtures proves no loss", "existing suite green"],
          evidence_path: "delivery-graph/demands/DEM-021/evidence/NODE-088/"
        }
      },
      {
        id: "NODE-087",
        title: "Bundle generator",
        type: "implementation",
        track: "TRK-implementation",
        requirement_ids: ["REQ-091"],
        depends_on: [],
        status: "done",
        validation: {
          required: ["generator emits index.md"],
          evidence_path: "delivery-graph/demands/DEM-021/evidence/NODE-087/"
        }
      }
    ]
  };
}

test("new-format graph survives graph -> bundle -> graph with no semantic loss", () => {
  const graph = newFormatGraph();
  const diffs = diffGraphs(graph, roundTrip(graph));
  assert.deepEqual(diffs, [], `expected lossless round trip, got: ${diffs.join("; ")}`);
});

test("identifiers stay stable across the round trip", () => {
  const graph = newFormatGraph();
  const back = roundTrip(graph);
  assert.deepEqual(back.demands.map((d) => d.id), ["DEM-021"]);
  assert.deepEqual(back.requirements.map((r) => r.id), ["REQ-092"]);
  assert.deepEqual(back.nodes.map((n) => n.id).sort(), ["NODE-087", "NODE-088"]);
});

test("dependencies, validation contracts, and state survive the round trip", () => {
  const graph = newFormatGraph();
  const back = roundTrip(graph);
  const n88 = back.nodes.find((n) => n.id === "NODE-088");
  assert.deepEqual(n88.depends_on, ["NODE-087"]);
  assert.deepEqual(n88.validation.required, [
    "round-trip over fixtures proves no loss",
    "existing suite green"
  ]);
  assert.equal(n88.validation.evidence_path, "delivery-graph/demands/DEM-021/evidence/NODE-088/");
  assert.equal(n88.status, "in_progress");
});

test("the real canonical graph.json survives the round trip losslessly", () => {
  // The live store doubles as a golden legacy fixture: whatever DGE actually holds
  // must round-trip through the bundle with no loss over the bundle's fields.
  const graph = JSON.parse(fs.readFileSync("delivery-graph/graph.json", "utf8"));
  const diffs = diffGraphs(graph, roundTrip(graph));
  assert.deepEqual(diffs, [], `real graph.json lost data in round trip: ${diffs.slice(0, 5).join("; ")}`);
});

test("every node id and dependency edge in the real graph is preserved", () => {
  const graph = JSON.parse(fs.readFileSync("delivery-graph/graph.json", "utf8"));
  const back = bundleToGraph(graphToBundle(graph));
  const srcNodes = new Map(graph.nodes.map((n) => [n.id, n]));
  assert.equal(back.nodes.length, graph.nodes.length, "node count preserved");
  for (const n of back.nodes) {
    const src = srcNodes.get(n.id);
    assert.ok(src, `node ${n.id} preserved`);
    assert.deepEqual(n.depends_on, src.depends_on ?? [], `deps of ${n.id} preserved`);
  }
});
