import assert from "node:assert/strict";
import test from "node:test";
import { renderStatus } from "../src/status-renderer.mjs";

// DEM-008 / NODE-029: during quiet execution the conductor re-renders the status
// board after each node transition. The board must be a faithful projection of
// graph.json (never a separate log), so re-rendering after a transition reflects
// the new state. These tests prove that projection property.

function makeNode(id, status, dependsOn = []) {
  return {
    id, title: `${id} title`, type: "test", track: "TRK-x",
    requirement_ids: ["REQ-001"], depends_on: dependsOn, status,
    validation: { required: ["v"], evidence_path: `delivery-graph/demands/DEM-001/evidence/${id}/` },
    sync: { linear_issue_id: null, ado_task_id: null }
  };
}

function graphWith(nodes) {
  return {
    graph: { id: "DGE-001", title: "Board", status: "active" },
    demands: [{ id: "DEM-001", title: "D", source: "t", outcome: "o" }],
    requirements: [{ id: "REQ-001", demand_id: "DEM-001", statement: "s", priority: "must", acceptance: ["a"], validation: { method: "automated-test", required_evidence: ["e"] } }],
    gaps: [],
    tracks: [{ id: "TRK-x", title: "X" }],
    nodes
  };
}

test("the board reflects graph.json state (a node's status appears in the render)", () => {
  const graph = graphWith([makeNode("NODE-001", "ready"), makeNode("NODE-002", "ready", ["NODE-001"])]);
  const board = renderStatus(graph);
  assert.match(board, /NODE-001/);
  assert.match(board, /NODE-002/);
});

test("re-rendering after a transition reflects the new state (projection, not a log)", () => {
  const before = renderStatus(graphWith([makeNode("NODE-001", "ready"), makeNode("NODE-002", "ready", ["NODE-001"])]));
  // Transition NODE-001 -> done, exactly what the loop does between nodes.
  const after = renderStatus(graphWith([makeNode("NODE-001", "done"), makeNode("NODE-002", "ready", ["NODE-001"])]));

  // The two renders differ: the board tracks state, it is not a static/append log.
  assert.notEqual(before, after);
  // The 'done' section now names NODE-001.
  assert.match(after, /done \| 1 \| NODE-001/);
});
