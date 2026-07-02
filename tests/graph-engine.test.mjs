import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getNextReadyNode,
  getReadyNodes,
  readGraph,
  transitionNode,
  validateGraph,
  writeGraph
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
          evidence_path: "delivery-graph/demands/DEM-001/evidence/NODE-001/"
        }
      })
    ]
  });

  assert.match(validateGraph(graph).join("\n"), /NODE-002\.validation\.evidence_path must be delivery-graph\/demands\/DEM-001\/evidence\/NODE-002\//);
});

test("flags a node whose requirements span multiple demands", () => {
  const graph = makeGraph({
    demands: [
      { id: "DEM-001", title: "Demand A", source: "test", outcome: "A" },
      { id: "DEM-002", title: "Demand B", source: "test", outcome: "B" }
    ],
    requirements: [
      {
        id: "REQ-001",
        demand_id: "DEM-001",
        statement: "req a",
        acceptance: ["acc"],
        validation: { method: "automated-test", required_evidence: ["out"] }
      },
      {
        id: "REQ-002",
        demand_id: "DEM-002",
        statement: "req b",
        acceptance: ["acc"],
        validation: { method: "automated-test", required_evidence: ["out"] }
      }
    ],
    nodes: [makeNode("NODE-001", { requirement_ids: ["REQ-001", "REQ-002"] })]
  });

  assert.match(
    validateGraph(graph).join("\n"),
    /NODE-001 requirements span multiple demands \(DEM-001, DEM-002\); a node must belong to exactly one demand/
  );
});

test("accepts a node whose requirements all share one demand", () => {
  const graph = makeGraph({
    requirements: [
      {
        id: "REQ-001",
        demand_id: "DEM-001",
        statement: "req a",
        acceptance: ["acc"],
        validation: { method: "automated-test", required_evidence: ["out"] }
      },
      {
        id: "REQ-002",
        demand_id: "DEM-001",
        statement: "req b",
        acceptance: ["acc"],
        validation: { method: "automated-test", required_evidence: ["out"] }
      }
    ],
    nodes: [makeNode("NODE-001", { requirement_ids: ["REQ-001", "REQ-002"] })]
  });

  assert.deepEqual(validateGraph(graph), []);
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

test("reports the cycle path without duplicating the closing node", () => {
  const graph = makeGraph({
    nodes: [
      makeNode("NODE-001", { depends_on: ["NODE-002"] }),
      makeNode("NODE-002", { depends_on: ["NODE-003"] }),
      makeNode("NODE-003", { depends_on: ["NODE-001"] })
    ]
  });

  const cycleError = validateGraph(graph).find((error) => error.startsWith("Dependency cycle detected"));
  assert.equal(cycleError, "Dependency cycle detected: NODE-001 -> NODE-002 -> NODE-003 -> NODE-001");
});

test("getReadyNodes tolerates a node missing depends_on", () => {
  const graph = makeGraph({
    nodes: [
      { ...makeNode("NODE-001", { status: "ready" }), depends_on: undefined }
    ]
  });

  assert.doesNotThrow(() => getReadyNodes(graph));
  assert.deepEqual(getReadyNodes(graph).map((node) => node.id), ["NODE-001"]);
});

test("writeGraph writes atomically and round-trips through readGraph", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-atomic-"));
  const graphPath = path.join(dir, "delivery-graph", "graph.json");
  try {
    const graph = makeGraph();
    writeGraph(graphPath, graph);
    // No leftover temp file beside the target.
    const siblings = fs.readdirSync(path.dirname(graphPath));
    assert.deepEqual(siblings.filter((name) => name.endsWith(".tmp")), []);
    assert.deepEqual(readGraph(graphPath), graph);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

test("transitionNode refuses to mint verified (evidence gate lives in verifyNode)", () => {
  const graph = makeGraph({ nodes: [makeNode("NODE-001", { status: "review" })] });

  // review -> verified is a valid lifecycle edge, but transitionNode cannot read
  // the evidence manifest, so it must reject the move and point at `dge verify`
  // rather than silently mark a node verified without proof.
  assert.throws(
    () => transitionNode(graph, "NODE-001", "verified"),
    /cannot be moved to verified via transition/
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
      evidence_path: `delivery-graph/demands/DEM-001/evidence/${id}/`
    },
    sync: {
      linear_issue_id: null,
      ado_task_id: null
    },
    ...overrides
  };
}
