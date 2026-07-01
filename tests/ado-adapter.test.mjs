import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdoSyncPlan,
  defaultAdoSyncPath,
  mapNodeStatusToAdoState,
  nodeToAdoPayload
} from "../src/adapters/ado.mjs";

test("maps node status to Azure DevOps state names", () => {
  assert.equal(mapNodeStatusToAdoState("proposed"), "To Do");
  assert.equal(mapNodeStatusToAdoState("ready"), "To Do");
  assert.equal(mapNodeStatusToAdoState("in_progress"), "In Progress");
  assert.equal(mapNodeStatusToAdoState("blocked"), "In Progress");
  assert.equal(mapNodeStatusToAdoState("review"), "In Progress");
  assert.equal(mapNodeStatusToAdoState("verified"), "In Progress");
  assert.equal(mapNodeStatusToAdoState("done"), "Done");
});

test("builds Azure DevOps task payload from a graph node", () => {
  const graph = makeGraph();
  const node = graph.nodes[0];
  const payload = nodeToAdoPayload(graph, node, {
    organization: "ORG",
    project: "PROJECT",
    areaPath: "PROJECT\\Area",
    iterationPath: "PROJECT\\Sprint 1",
    nodeTaskIds: new Map()
  });

  assert.equal(payload.work_item_type, "Task");
  assert.equal(payload.organization, "ORG");
  assert.equal(payload.project, "PROJECT");
  assert.equal(payload.fields["System.Title"], "[NODE-001] Build adapter");
  assert.equal(payload.fields["System.AreaPath"], "PROJECT\\Area");
  assert.equal(payload.fields["System.IterationPath"], "PROJECT\\Sprint 1");
  assert.equal(payload.external_id, "DGE-001:NODE-001");
  assert.match(payload.fields["System.Description"], /Validation contract/);
  assert.deepEqual(payload.dge.requirement_ids, ["REQ-001"]);
  assert.equal(payload.json_patch.find((operation) => operation.path === "/fields/System.Title").value, "[NODE-001] Build adapter");
});

test("creates Azure DevOps dry-run sync operations for unmapped nodes", () => {
  const plan = createAdoSyncPlan(makeGraph(), {
    organization: "ORG",
    project: "PROJECT",
    areaPath: "PROJECT\\Area",
    iterationPath: "PROJECT\\Sprint 1",
    updatedAt: "2026-07-01T00:00:00Z"
  });

  assert.equal(plan.target, "ado");
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.operations.length, 2);
  assert.equal(plan.nodes["NODE-001"].action, "create");
  assert.equal(plan.nodes["NODE-001"].ado_task_id, "dry-run:NODE-001");
  assert.equal(plan.organization, "ORG");
  assert.equal(plan.project, "PROJECT");
});

test("updates nodes with real existing Azure DevOps task ids", () => {
  const plan = createAdoSyncPlan(makeGraph(), {
    existingSync: {
      nodes: {
        "NODE-001": {
          ado_task_id: 123
        }
      }
    }
  });

  assert.equal(plan.nodes["NODE-001"].action, "update");
  assert.equal(plan.nodes["NODE-001"].ado_task_id, 123);
  assert.deepEqual(plan.nodes["NODE-002"].payload.dependency_task_ids, [123]);
});

test("does not treat prior Azure DevOps dry-run ids as real task ids", () => {
  const plan = createAdoSyncPlan(makeGraph(), {
    existingSync: {
      nodes: {
        "NODE-001": {
          ado_task_id: "dry-run:NODE-001"
        }
      }
    }
  });

  assert.equal(plan.nodes["NODE-001"].action, "create");
  assert.equal(plan.nodes["NODE-001"].ado_task_id, "dry-run:NODE-001");
});

test("uses sync directory next to graph by default", () => {
  assert.match(
    defaultAdoSyncPath("/tmp/example/delivery-graph/graph.json"),
    /\/tmp\/example\/delivery-graph\/sync\/ado\.json$/
  );
});

function makeGraph() {
  return {
    graph: {
      id: "DGE-001",
      title: "Azure DevOps adapter",
      status: "active"
    },
    demands: [
      {
        id: "DEM-001",
        title: "Sync to Azure DevOps",
        source: "test",
        outcome: "Nodes become Azure DevOps tasks."
      }
    ],
    requirements: [
      {
        id: "REQ-001",
        demand_id: "DEM-001",
        statement: "Nodes sync to Azure DevOps.",
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
          evidence_path: "delivery-graph/evidence/NODE-001/"
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
          evidence_path: "delivery-graph/evidence/NODE-002/"
        },
        sync: {
          linear_issue_id: null,
          ado_task_id: null
        }
      }
    ]
  };
}
