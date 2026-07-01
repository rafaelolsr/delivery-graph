import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextReadyNode,
  getReadyNodes,
  transitionNode,
  validateGraph
} from "../src/graph-engine.mjs";

test("validates the example graph", () => {
  assert.deepEqual(validateGraph(makeGraph()), []);
});

test("enforces the delivery graph JSON schema", () => {
  const graph = makeGraph({
    graph: {
      id: "DGE-001",
      title: "Example graph",
      status: "active",
      unexpected: true
    }
  });

  assert.match(validateGraph(graph).join("\n"), /schema \/graph: must NOT have additional properties/);
});

test("requires node evidence paths to match the owning node", () => {
  const graph = makeGraph({
    nodes: [
      makeNode("NODE-001"),
      makeNode("NODE-002", {
        validation: {
          required: ["npm test"],
          evidence_path: "delivery-graph/evidence/NODE-001/"
        }
      })
    ]
  });

  assert.match(validateGraph(graph).join("\n"), /NODE-002\.validation\.evidence_path must be delivery-graph\/evidence\/NODE-002\//);
});

test("blocks unresolved blocker gaps", () => {
  const graph = makeGraph({
    gaps: [
      {
        id: "GAP-001",
        type: "validation",
        severity: "blocker",
        question: "What evidence is required?",
        blocks: ["REQ-001"],
        resolution: null
      }
    ]
  });

  assert.match(validateGraph(graph).join("\n"), /GAP-001 is a blocker/);
});

test("detects dependency cycles", () => {
  const graph = makeGraph({
    nodes: [
      makeNode("NODE-001", { depends_on: ["NODE-002"] }),
      makeNode("NODE-002", { depends_on: ["NODE-001"] })
    ]
  });

  assert.match(validateGraph(graph).join("\n"), /Dependency cycle detected/);
});

test("returns only ready nodes whose dependencies are done", () => {
  const graph = makeGraph({
    nodes: [
      makeNode("NODE-001", { status: "done" }),
      makeNode("NODE-002", { status: "ready", depends_on: ["NODE-001"] }),
      makeNode("NODE-003", { status: "ready", depends_on: ["NODE-004"] }),
      makeNode("NODE-004", { status: "review" })
    ]
  });

  assert.deepEqual(getReadyNodes(graph).map((node) => node.id), ["NODE-002"]);
});

test("getNextReadyNode returns the first ready node in graph order", () => {
  const graph = makeGraph({
    nodes: [
      makeNode("NODE-001", { status: "done" }),
      makeNode("NODE-002", { status: "ready", depends_on: ["NODE-001"] }),
      makeNode("NODE-003", { status: "ready" })
    ]
  });

  assert.equal(getNextReadyNode(graph).id, "NODE-002");
});

test("getNextReadyNode skips nodes whose dependencies are not done", () => {
  const graph = makeGraph({
    nodes: [
      makeNode("NODE-001", { status: "review" }),
      makeNode("NODE-002", { status: "ready", depends_on: ["NODE-001"] })
    ]
  });

  assert.equal(getNextReadyNode(graph), null);
});

test("getNextReadyNode returns null when no node is ready", () => {
  const graph = makeGraph({
    nodes: [
      makeNode("NODE-001", { status: "done" }),
      makeNode("NODE-002", { status: "in_progress" })
    ]
  });

  assert.equal(getNextReadyNode(graph), null);
});

test("transitions a ready node to in progress", () => {
  const graph = makeGraph();
  const nextGraph = transitionNode(graph, "NODE-001", "in_progress", {
    updatedAt: "2026-06-30T00:00:00Z"
  });

  assert.equal(nextGraph.nodes[0].status, "in_progress");
  assert.equal(nextGraph.graph.updated_at, "2026-06-30T00:00:00Z");
});

test("rejects invalid lifecycle transitions", () => {
  const graph = makeGraph();

  assert.throws(
    () => transitionNode(graph, "NODE-001", "done"),
    /Invalid node transition/
  );
});

test("requires dependencies to be done before starting work", () => {
  const graph = makeGraph({
    nodes: [
      makeNode("NODE-001", { status: "review" }),
      makeNode("NODE-002", { status: "ready", depends_on: ["NODE-001"] })
    ]
  });

  assert.throws(
    () => transitionNode(graph, "NODE-002", "in_progress"),
    /incomplete dependencies: NODE-001/
  );
});

function makeGraph(overrides = {}) {
  return {
    graph: {
      id: "DGE-001",
      title: "Example graph",
      status: "active"
    },
    demands: [
      {
        id: "DEM-001",
        title: "Example demand",
        source: "test",
        outcome: "Prove the engine works."
      }
    ],
    requirements: [
      {
        id: "REQ-001",
        demand_id: "DEM-001",
        statement: "The graph engine validates and transitions nodes.",
        acceptance: ["Validation returns no errors."],
        validation: {
          method: "automated-test",
          required_evidence: ["node --test output"]
        }
      }
    ],
    gaps: [],
    tracks: [
      {
        id: "TRK-engine",
        title: "Engine"
      }
    ],
    nodes: [makeNode("NODE-001")],
    ...overrides
  };
}

function makeNode(id, overrides = {}) {
  return {
    id,
    title: `${id} title`,
    type: "implementation",
    track: "TRK-engine",
    requirement_ids: ["REQ-001"],
    depends_on: [],
    status: "ready",
    validation: {
      required: ["npm test"],
      evidence_path: `delivery-graph/evidence/${id}/`
    },
    sync: {
      linear_issue_id: null,
      ado_task_id: null
    },
    ...overrides
  };
}
