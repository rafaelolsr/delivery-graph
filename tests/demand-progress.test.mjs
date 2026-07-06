import assert from "node:assert/strict";
import test from "node:test";
import { demandProgress, deriveDemandStage } from "../src/graph-engine.mjs";

test("no requirements yet -> intake", () => {
  const graph = makeGraph({ requirements: [], nodes: [] });
  assert.deepEqual(demandProgress(graph, "DEM-001"), {
    stage: "intake",
    requirementCount: 0,
    totalNodes: 0,
    completeNodes: 0,
    blockedNodes: 0,
    reviewNodes: 0
  });
});

test("requirements exist but no nodes yet -> plan", () => {
  const graph = makeGraph({ nodes: [] });
  const progress = demandProgress(graph, "DEM-001");
  assert.equal(progress.stage, "plan");
  assert.equal(progress.requirementCount, 1);
  assert.equal(progress.totalNodes, 0);
});

test("nodes exist, none complete, still pre-review -> execute", () => {
  const graph = makeGraph({
    nodes: [makeNode("NODE-001", { status: "proposed" }), makeNode("NODE-002", { status: "in_progress" })]
  });
  assert.equal(deriveDemandStage(graph, "DEM-001"), "execute");
});

test("some nodes done, others still in_progress -> execute (not verify)", () => {
  const graph = makeGraph({
    nodes: [makeNode("NODE-001", { status: "done" }), makeNode("NODE-002", { status: "in_progress" })]
  });
  assert.equal(deriveDemandStage(graph, "DEM-001"), "execute");
});

test("one node reaches review while another is still ready -> execute, reviewNodes counted", () => {
  const graph = makeGraph({
    nodes: [makeNode("NODE-001", { status: "review" }), makeNode("NODE-002", { status: "ready" })]
  });
  const progress = demandProgress(graph, "DEM-001");
  assert.equal(progress.stage, "execute");
  assert.equal(progress.reviewNodes, 1);
});

test("all incomplete nodes sitting in review -> verify", () => {
  const graph = makeGraph({
    nodes: [makeNode("NODE-001", { status: "done" }), makeNode("NODE-002", { status: "review" })]
  });
  const progress = demandProgress(graph, "DEM-001");
  assert.equal(progress.stage, "verify");
  assert.equal(progress.completeNodes, 1);
  assert.equal(progress.totalNodes, 2);
  assert.equal(progress.reviewNodes, 1);
});

test("all nodes done -> done", () => {
  const graph = makeGraph({
    nodes: [makeNode("NODE-001", { status: "done" }), makeNode("NODE-002", { status: "done" })]
  });
  assert.equal(deriveDemandStage(graph, "DEM-001"), "done");
});

test("all nodes done-waived -> done (waiver parity)", () => {
  const graph = makeGraph({
    nodes: [
      makeNode("NODE-001", { status: "done-waived", waiver: { reason: "cannot automate", waived_at: "2026-01-01T00:00:00.000Z" } }),
      makeNode("NODE-002", { status: "done-waived", waiver: { reason: "cannot automate", waived_at: "2026-01-01T00:00:00.000Z" } })
    ]
  });
  assert.equal(deriveDemandStage(graph, "DEM-001"), "done");
});

test("mix of done and done-waived -> done", () => {
  const graph = makeGraph({
    nodes: [
      makeNode("NODE-001", { status: "done" }),
      makeNode("NODE-002", { status: "done-waived", waiver: { reason: "cannot automate", waived_at: "2026-01-01T00:00:00.000Z" } })
    ]
  });
  assert.equal(deriveDemandStage(graph, "DEM-001"), "done");
});

test("a blocked node among in_progress nodes stays execute and is counted", () => {
  const graph = makeGraph({
    nodes: [makeNode("NODE-001", { status: "blocked" }), makeNode("NODE-002", { status: "in_progress" })]
  });
  const progress = demandProgress(graph, "DEM-001");
  assert.equal(progress.stage, "execute");
  assert.equal(progress.blockedNodes, 1);
});

test("nonexistent demand throws", () => {
  const graph = makeGraph();
  assert.throws(() => demandProgress(graph, "DEM-999"), /DEM-999 not found/);
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
        statement: "The graph engine derives a demand's lifecycle stage.",
        acceptance: ["Stage matches the documented rule."],
        validation: {
          method: "automated-test",
          required_evidence: ["node --test output"]
        }
      }
    ],
    gaps: [],
    tracks: [{ id: "TRK-engine", title: "Engine" }],
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
