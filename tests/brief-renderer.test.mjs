import assert from "node:assert/strict";
import test from "node:test";
import { buildGraphBrief, renderGraphBrief, renderMermaidDag } from "../src/brief-renderer.mjs";

function makeNode(id, demandId, requirementIds, status, dependsOn = []) {
  return {
    id,
    title: `${id} title`,
    type: "implementation",
    track: "TRK-x",
    requirement_ids: requirementIds,
    depends_on: dependsOn,
    status,
    validation: { required: [`${id} validated`], evidence_path: `delivery-graph/demands/${demandId}/evidence/${id}/` },
    sync: { linear_issue_id: null, ado_task_id: null }
  };
}

function makeGraph() {
  return {
    graph: { id: "DGE-001", title: "Brief", status: "active" },
    demands: [
      { id: "DEM-001", title: "Target demand", source: "test", outcome: "outcome one" },
      { id: "DEM-002", title: "Other demand", source: "test", outcome: "outcome two" }
    ],
    requirements: [
      { id: "REQ-001", demand_id: "DEM-001", statement: "req one", priority: "must", acceptance: ["a"], validation: { method: "automated-test", required_evidence: ["e"] } },
      { id: "REQ-002", demand_id: "DEM-001", statement: "req two", priority: "must", acceptance: ["a"], validation: { method: "automated-test", required_evidence: ["e"] } },
      { id: "REQ-050", demand_id: "DEM-002", statement: "other req", priority: "must", acceptance: ["a"], validation: { method: "automated-test", required_evidence: ["e"] } }
    ],
    gaps: [],
    tracks: [{ id: "TRK-x", title: "X" }],
    nodes: [
      makeNode("NODE-001", "DEM-001", ["REQ-001"], "done"),
      // NODE-002 depends on the done NODE-001, so it is ready; NODE-003 depends on
      // NODE-002 (not done), so it is NOT ready.
      makeNode("NODE-002", "DEM-001", ["REQ-002"], "ready", ["NODE-001"]),
      makeNode("NODE-003", "DEM-001", ["REQ-002"], "proposed", ["NODE-002"]),
      makeNode("NODE-050", "DEM-002", ["REQ-050"], "ready")
    ]
  };
}

test("buildGraphBrief scopes nodes to the demand and derives ready-queue from graph.json", () => {
  const graph = makeGraph();
  const brief = buildGraphBrief("/tmp/x/delivery-graph/graph.json", graph, "DEM-001");

  assert.equal(brief.scope, "DEM-001");
  assert.equal(brief.node_count, 3); // NODE-050 (other demand) excluded
  assert.deepEqual(brief.nodes.map((n) => n.id), ["NODE-001", "NODE-002", "NODE-003"]);
  // Ready queue is derived, not stored: only NODE-002 (deps done) is ready here.
  assert.deepEqual(brief.ready_queue, ["NODE-002"]);
});

test("renderMermaidDag draws only edges whose target is inside the rendered node set", () => {
  const graph = makeGraph();
  const brief = buildGraphBrief("/tmp/x/delivery-graph/graph.json", graph, "DEM-001");
  const mermaid = renderMermaidDag(brief.nodes);

  assert.match(mermaid, /flowchart TD/);
  assert.match(mermaid, /NODE-001 --> NODE-002/);
  assert.match(mermaid, /NODE-002 --> NODE-003/);
  // No edge to the excluded other-demand node.
  assert.doesNotMatch(mermaid, /NODE-050/);
});

test("renderGraphBrief emits the DAG, per-node table, and ready-queue order", () => {
  const graph = makeGraph();
  const brief = buildGraphBrief("/tmp/x/delivery-graph/graph.json", graph, "DEM-001");
  const md = renderGraphBrief(brief);

  assert.match(md, /## Dependency graph/);
  assert.match(md, /```mermaid/);
  assert.match(md, /## Per-node change summary/);
  assert.match(md, /NODE-002 validated/); // validation contract rendered
  assert.match(md, /## Ready-queue order/);
  assert.match(md, /1\. NODE-002/);
});

test("a demand-scoped graph brief only shows blocker gaps that block its own requirements", () => {
  const graph = makeGraph();
  // A blocker gap on DEM-002's REQ-050 must NOT appear in DEM-001's brief. (F2.)
  graph.gaps = [
    { id: "GAP-001", type: "scope", severity: "blocker", question: "other demand's blocker", blocks: ["REQ-050"], resolution: null },
    { id: "GAP-002", type: "scope", severity: "blocker", question: "this demand's blocker", blocks: ["REQ-001"], resolution: null }
  ];

  const dem1 = buildGraphBrief("/tmp/x/g.json", graph, "DEM-001");
  assert.deepEqual(dem1.blocker_gaps.map((g) => g.id), ["GAP-002"], "only DEM-001's blocker shows");

  const dem2 = buildGraphBrief("/tmp/x/g.json", graph, "DEM-002");
  assert.deepEqual(dem2.blocker_gaps.map((g) => g.id), ["GAP-001"], "only DEM-002's blocker shows");

  // Whole-graph scope (no demandId) still shows all blocker gaps.
  const whole = buildGraphBrief("/tmp/x/g.json", graph, null);
  assert.equal(whole.blocker_gaps.length, 2);
});

test("mermaid labels with quotes or newlines cannot break the diagram", () => {
  const nodes = [{ id: "NODE-001", title: 'has "quotes"\nand a newline', depends_on: [] }];
  const mermaid = renderMermaidDag(nodes);
  assert.doesNotMatch(mermaid, /"quotes"/); // inner quotes escaped to single quotes
  assert.doesNotMatch(mermaid, /\n +and a newline/); // newline collapsed
  assert.match(mermaid, /NODE-001 · has 'quotes' and a newline/);
});
