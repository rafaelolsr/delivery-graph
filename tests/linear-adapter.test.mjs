import assert from "node:assert/strict";
import test from "node:test";
import {
  createLinearSyncPlan,
  defaultLinearSyncPath,
  mapNodeStatusToLinearState,
  nodeToLinearPayload
} from "../src/adapters/linear.mjs";

test("maps node status to Linear state names", () => {
  assert.equal(mapNodeStatusToLinearState("proposed"), "backlog");
  assert.equal(mapNodeStatusToLinearState("ready"), "todo");
  assert.equal(mapNodeStatusToLinearState("in_progress"), "in_progress");
  assert.equal(mapNodeStatusToLinearState("review"), "in_review");
  assert.equal(mapNodeStatusToLinearState("verified"), "done");
});

test("builds Linear payload from a graph node", () => {
  const graph = makeGraph();
  const node = graph.nodes[0];
  const payload = nodeToLinearPayload(graph, node, {
    teamId: "TEAM",
    projectId: "PROJECT",
    nodeIssueIds: new Map()
  });

  assert.equal(payload.title, "[NODE-001] Build adapter");
  assert.equal(payload.team_id, "TEAM");
  assert.equal(payload.project_id, "PROJECT");
  assert.equal(payload.external_id, "DGE-001:NODE-001");
  assert.ok(payload.labels.includes("track:TRK-sync"));
  assert.match(payload.description, /Validation contract/);
  assert.deepEqual(payload.dge.requirement_ids, ["REQ-001"]);
});

test("creates dry-run sync operations for unmapped nodes", () => {
  const plan = createLinearSyncPlan(makeGraph(), {
    teamId: "TEAM",
    projectId: "PROJECT",
    updatedAt: "2026-06-30T00:00:00Z"
  });

  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.operations.length, 2);
  assert.equal(plan.nodes["NODE-001"].action, "create");
  assert.equal(plan.nodes["NODE-001"].linear_issue_id, "dry-run:NODE-001");
  assert.equal(plan.team_id, "TEAM");
});

test("updates nodes with real existing Linear ids", () => {
  const plan = createLinearSyncPlan(makeGraph(), {
    existingSync: {
      nodes: {
        "NODE-001": {
          linear_issue_id: "DGE-12"
        }
      }
    }
  });

  assert.equal(plan.nodes["NODE-001"].action, "update");
  assert.equal(plan.nodes["NODE-001"].linear_issue_id, "DGE-12");
  assert.deepEqual(plan.nodes["NODE-002"].payload.dependency_issue_ids, ["DGE-12"]);
});

test("does not treat prior dry-run ids as real Linear ids", () => {
  const plan = createLinearSyncPlan(makeGraph(), {
    existingSync: {
      nodes: {
        "NODE-001": {
          linear_issue_id: "dry-run:NODE-001"
        }
      }
    }
  });

  assert.equal(plan.nodes["NODE-001"].action, "create");
  assert.equal(plan.nodes["NODE-001"].linear_issue_id, "dry-run:NODE-001");
});

test("uses sync directory next to graph by default", () => {
  assert.match(
    defaultLinearSyncPath("/tmp/example/delivery-graph/graph.json"),
    /\/tmp\/example\/delivery-graph\/sync\/linear\.json$/
  );
});

function makeGraph() {
  return {
    graph: {
      id: "DGE-001",
      title: "Linear adapter",
      status: "active"
    },
    demands: [
      {
        id: "DEM-001",
        title: "Sync to Linear",
        source: "test",
        outcome: "Nodes become Linear issues."
      }
    ],
    requirements: [
      {
        id: "REQ-001",
        demand_id: "DEM-001",
        statement: "Nodes sync to Linear.",
        acceptance: ["Dry-run sync plan exists."],
        validation: {
          method: "automated-test",
          required_evidence: ["node --test output"]
        }
      }
    ],
    gaps: [],
    tracks: [
      {
        id: "TRK-sync",
        title: "Sync"
      }
    ],
    nodes: [
      {
        id: "NODE-001",
        title: "Build adapter",
        type: "implementation",
        track: "TRK-sync",
        requirement_ids: ["REQ-001"],
        depends_on: [],
        status: "ready",
        validation: {
          required: ["npm test"],
          evidence_path: "delivery-graph/demands/DEM-001/evidence/NODE-001/"
        },
        sync: {
          linear_issue_id: null,
          ado_task_id: null
        }
      },
      {
        id: "NODE-002",
        title: "Use adapter",
        type: "implementation",
        track: "TRK-sync",
        requirement_ids: ["REQ-001"],
        depends_on: ["NODE-001"],
        status: "ready",
        validation: {
          required: ["npm test"],
          evidence_path: "delivery-graph/demands/DEM-001/evidence/NODE-002/"
        },
        sync: {
          linear_issue_id: null,
          ado_task_id: null
        }
      }
    ]
  };
}
