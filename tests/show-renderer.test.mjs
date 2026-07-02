import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDemandView, renderDemandView } from "../src/show-renderer.mjs";

function setup() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-show-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = {
    graph: { id: "DGE-001", title: "Show", status: "active" },
    demands: [
      { id: "DEM-001", title: "Target demand", source: "test", outcome: "outcome one" },
      { id: "DEM-002", title: "Other demand", source: "test", outcome: "outcome two" }
    ],
    requirements: [
      {
        id: "REQ-001",
        demand_id: "DEM-001",
        statement: "req one",
        priority: "must",
        acceptance: ["a"],
        validation: { method: "automated-test", required_evidence: ["e"] }
      },
      {
        id: "REQ-050",
        demand_id: "DEM-002",
        statement: "other req",
        priority: "must",
        acceptance: ["a"],
        validation: { method: "automated-test", required_evidence: ["e"] }
      }
    ],
    gaps: [],
    tracks: [{ id: "TRK-x", title: "X" }],
    nodes: [
      makeNode("NODE-001", "DEM-001", ["REQ-001"], "done"),
      makeNode("NODE-050", "DEM-002", ["REQ-050"], "ready")
    ]
  };
  return { graphPath, graph };
}

function makeNode(id, demandId, requirementIds, status) {
  return {
    id,
    title: `${id} title`,
    type: "implementation",
    track: "TRK-x",
    requirement_ids: requirementIds,
    depends_on: [],
    status,
    validation: { required: ["x"], evidence_path: `delivery-graph/demands/${demandId}/evidence/${id}/` },
    sync: { linear_issue_id: null, ado_task_id: null }
  };
}

test("buildDemandView scopes requirements and nodes to the demand", () => {
  const { graphPath, graph } = setup();
  const view = buildDemandView(graphPath, graph, "DEM-001");

  assert.equal(view.demand.id, "DEM-001");
  assert.deepEqual(view.requirements.map((r) => r.id), ["REQ-001"]);
  assert.deepEqual(view.nodes.map((n) => n.id), ["NODE-001"]);
  // NODE-050 / REQ-050 belong to DEM-002 and must not appear.
  assert.equal(view.nodes.some((n) => n.id === "NODE-050"), false);
  assert.deepEqual(view.orphan_requirement_ids, []);
});

test("buildDemandView reports evidence presence (no manifest = false)", () => {
  const { graphPath, graph } = setup();
  const view = buildDemandView(graphPath, graph, "DEM-001");
  assert.equal(view.nodes[0].has_evidence, false); // no evidence dir written in this fixture
});

test("buildDemandView throws for an unknown demand", () => {
  const { graphPath, graph } = setup();
  assert.throws(() => buildDemandView(graphPath, graph, "DEM-999"), /DEM-999 not found/);
});

test("renderDemandView lists requirements and nodes with status", () => {
  const { graphPath, graph } = setup();
  const out = renderDemandView(buildDemandView(graphPath, graph, "DEM-001"), { ascii: true });
  assert.match(out, /DEM-001/);
  assert.match(out, /REQ-001/);
  assert.match(out, /NODE-001/);
  assert.match(out, /\[done\]/);
  assert.doesNotMatch(out, /REQ-050|NODE-050/);
});
