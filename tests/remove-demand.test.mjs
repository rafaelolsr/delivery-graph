import assert from "node:assert/strict";
import test from "node:test";
import { removeDemand } from "../src/graph-authoring.mjs";

function makeGraph() {
  return {
    graph: { id: "DGE-001", title: "Remove", status: "active" },
    demands: [
      { id: "DEM-001", title: "A", source: "test", outcome: "a" },
      { id: "DEM-002", title: "B", source: "test", outcome: "b" }
    ],
    requirements: [
      req("REQ-001", "DEM-001"),
      req("REQ-002", "DEM-002")
    ],
    gaps: [
      { id: "GAP-001", type: "validation", severity: "blocker", question: "q", blocks: ["REQ-001"], resolution: "r" }
    ],
    tracks: [{ id: "TRK-x", title: "X" }],
    nodes: [
      node("NODE-001", ["REQ-001"], []),
      node("NODE-002", ["REQ-002"], [])
    ]
  };
}

function req(id, demandId) {
  return {
    id,
    demand_id: demandId,
    statement: "s",
    acceptance: ["a"],
    validation: { method: "automated-test", required_evidence: ["e"] }
  };
}

function node(id, requirementIds, dependsOn) {
  const demandId = requirementIds[0] === "REQ-001" ? "DEM-001" : "DEM-002";
  return {
    id,
    title: `${id} t`,
    type: "implementation",
    track: "TRK-x",
    requirement_ids: requirementIds,
    depends_on: dependsOn,
    status: "ready",
    validation: { required: ["x"], evidence_path: `delivery-graph/demands/${demandId}/evidence/${id}/` },
    sync: { linear_issue_id: null, ado_task_id: null }
  };
}

test("removeDemand purges the demand, its requirements, nodes, and scoped gaps", () => {
  const { graph } = removeDemand(makeGraph(), "DEM-001");
  assert.deepEqual(graph.demands.map((d) => d.id), ["DEM-002"]);
  assert.deepEqual(graph.requirements.map((r) => r.id), ["REQ-002"]);
  assert.deepEqual(graph.nodes.map((n) => n.id), ["NODE-002"]);
  assert.equal(graph.gaps.length, 0); // GAP-001 blocked only DEM-001's REQ-001
});

test("removeDemand refuses when another demand's node depends on this demand's node", () => {
  const graph = makeGraph();
  // NODE-002 (DEM-002) now depends on NODE-001 (DEM-001).
  graph.nodes.find((n) => n.id === "NODE-002").depends_on = ["NODE-001"];
  assert.throws(
    () => removeDemand(graph, "DEM-001"),
    /DEM-001 cannot be removed; nodes in other demands depend on its nodes: NODE-002/
  );
});

test("removeDemand keeps a gap that also blocks another demand's requirement", () => {
  const graph = makeGraph();
  graph.gaps[0].blocks = ["REQ-001", "REQ-002"]; // spans both demands
  const { graph: next } = removeDemand(graph, "DEM-001");
  assert.equal(next.gaps.length, 1); // not orphaned-deleted
});

test("removeDemand throws for an unknown demand", () => {
  assert.throws(() => removeDemand(makeGraph(), "DEM-999"), /DEM-999 not found/);
});
