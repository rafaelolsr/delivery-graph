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

test("renderDemandView leads with the bold summary when set", () => {
  const { graphPath, graph } = setup();
  graph.demands.find((d) => d.id === "DEM-001").summary = "One-line TL;DR of the demand.";
  const out = renderDemandView(buildDemandView(graphPath, graph, "DEM-001"), {});
  const lines = out.split("\n");
  // title, blank, bold lead
  assert.equal(lines[0].startsWith("DEM-001"), true);
  assert.equal(lines[2], "**One-line TL;DR of the demand.**");
});

test("renderDemandView falls back to the first sentence of outcome when no summary", () => {
  const { graphPath, graph } = setup();
  const demand = graph.demands.find((d) => d.id === "DEM-001");
  delete demand.summary;
  demand.outcome = "First sentence stands alone. Second sentence is detail.";
  const out = renderDemandView(buildDemandView(graphPath, graph, "DEM-001"), {});
  assert.match(out, /^\*\*First sentence stands alone\.\*\*$/m);
  assert.doesNotMatch(out.split("\n")[2] ?? "", /Second sentence/);
});

test("renderDemandView always ends with exactly one Next section", () => {
  const { graphPath, graph } = setup();
  const out = renderDemandView(buildDemandView(graphPath, graph, "DEM-001"), {});
  assert.equal(out.match(/^## Next$/gm).length, 1);
  assert.match(out, /Approve to plan/);
});

test("buildDemandView includes the derived progress for the demand", () => {
  const { graphPath, graph } = setup();
  const view = buildDemandView(graphPath, graph, "DEM-001");
  // DEM-001 has one node in `done`, so it is fully complete -> done stage.
  assert.deepEqual(view.progress, {
    stage: "done",
    requirementCount: 1,
    totalNodes: 1,
    completeNodes: 1,
    blockedNodes: 0,
    reviewNodes: 0
  });
});

test("renderDemandView includes the progress line in emoji mode", () => {
  const { graphPath, graph } = setup();
  const out = renderDemandView(buildDemandView(graphPath, graph, "DEM-001"), {});
  assert.match(out, /Design ✅ → Plan ✅ → Execute ✅ → Verify ✅ → Done 🎯/);
});

test("renderDemandView includes the progress line in ascii mode with no raw emoji", () => {
  const { graphPath, graph } = setup();
  const out = renderDemandView(buildDemandView(graphPath, graph, "DEM-001"), { ascii: true });
  assert.match(out, /Design \[x\] -> Plan \[x\] -> Execute \[x\] -> Verify \[x\] -> Done \[done\]/);
});

test("renderDemandView renders each node's status as a glyph plus its status word in emoji mode", () => {
  const { graphPath, graph } = setup();
  graph.nodes.push(makeNode("NODE-002", "DEM-001", ["REQ-001"], "review"));
  const out = renderDemandView(buildDemandView(graphPath, graph, "DEM-001"), {});
  assert.match(out, /🟠 review NODE-002/);
});

test("renderDemandView renders the proposed status glyph in ascii mode", () => {
  const { graphPath, graph } = setup();
  graph.nodes.push(makeNode("NODE-002", "DEM-001", ["REQ-001"], "proposed"));
  const out = renderDemandView(buildDemandView(graphPath, graph, "DEM-001"), { ascii: true });
  assert.match(out, /\[proposed\] NODE-002/);
});
