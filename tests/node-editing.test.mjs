import assert from "node:assert/strict";
import test from "node:test";
import { addDemand, addRequirement, addTrack, addNode, removeNode, setNodeValidation } from "../src/graph-authoring.mjs";
import { getEvidenceStatus } from "../src/evidence-engine.mjs";

// DEM-004: authoring mistakes must be correctable via the CLI engine —
// remove a node (guarded against orphaning dependents) and re-set a node's
// validation contract — without hand-editing graph.json.
function twoNodeGraph() {
  let g = { graph: { id: "DGE-001", title: "t", status: "draft" }, demands: [], requirements: [], gaps: [], tracks: [], nodes: [] };
  g = addDemand(g, { title: "d", source: "s", outcome: "o" }).graph;
  g = addRequirement(g, { demandId: "DEM-001", statement: "st", acceptance: ["a"], evidence: "e" }).graph;
  g = addTrack(g, { title: "V" }).graph;
  g = addNode(g, { title: "A", type: "test", track: "TRK-v", requirements: "REQ-001", validation: "x" }).graph;
  g = addNode(g, { title: "B", type: "test", track: "TRK-v", requirements: "REQ-001", dependsOn: "NODE-001", validation: "y" }).graph;
  return g;
}

test("removeNode deletes a leaf node", () => {
  const g = twoNodeGraph();
  const { graph } = removeNode(g, "NODE-002");
  assert.deepEqual(graph.nodes.map((n) => n.id), ["NODE-001"]);
});

test("removeNode rejects a node with dependents", () => {
  const g = twoNodeGraph();
  assert.throws(
    () => removeNode(g, "NODE-001"),
    /cannot be removed; these nodes depend on it: NODE-002/
  );
});

test("removeNode rejects an unknown node", () => {
  const g = twoNodeGraph();
  assert.throws(() => removeNode(g, "NODE-999"), /NODE-999 not found/);
});

test("setNodeValidation replaces the contract and is comma-safe", () => {
  const g = twoNodeGraph();
  const { graph } = setNodeValidation(g, "NODE-001", "one item, with a comma");
  assert.deepEqual(graph.nodes.find((n) => n.id === "NODE-001").validation.required, ["one item, with a comma"]);
});

test("setNodeValidation re-checks evidence completeness against the new contract", () => {
  const g = twoNodeGraph();
  const { graph } = setNodeValidation(g, "NODE-001", ["new-a", "new-b"]);
  const node = graph.nodes.find((n) => n.id === "NODE-001");
  // no evidence for the new items -> incomplete
  const status = getEvidenceStatus("/tmp/nonexistent/delivery-graph/graph.json", graph, node);
  assert.deepEqual(status.missing.sort(), ["new-a", "new-b"]);
});

test("setNodeValidation rejects an unknown node", () => {
  const g = twoNodeGraph();
  assert.throws(() => setNodeValidation(g, "NODE-999", "x"), /NODE-999 not found/);
});
