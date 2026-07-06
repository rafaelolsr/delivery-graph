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

test("the board leads with a bold done/total · ready · blocked headline", () => {
  const graph = graphWith([
    makeNode("NODE-001", "done"),
    makeNode("NODE-002", "ready", ["NODE-001"]),
    makeNode("NODE-003", "blocked")
  ]);
  const board = renderStatus(graph);
  // Headline sits right under the H1 and is bold.
  assert.match(board, /^\*\*1\/3 done · 1 ready · 1 blocked\*\*$/m);
});

test("the board headline and Next are correct in the all-done state", () => {
  const graph = graphWith([makeNode("NODE-001", "done"), makeNode("NODE-002", "done")]);
  const board = renderStatus(graph);
  assert.match(board, /^\*\*2\/2 done · 0 ready · 0 blocked\*\*$/m);
  assert.equal(board.match(/^## Next$/gm).length, 1);
  assert.match(board, /All nodes done/);
});

test("the board always ends with exactly one Next section (nothing-ready state)", () => {
  const graph = graphWith([makeNode("NODE-001", "proposed")]);
  const board = renderStatus(graph);
  assert.equal(board.match(/^## Next$/gm).length, 1);
});
