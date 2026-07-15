import assert from "node:assert/strict";
import test from "node:test";
import { buildViewerModel, renderViewerHtml } from "../src/viewer-renderer.mjs";

test("viewer renders the requested three-panel semantic workspace", () => {
  const model = buildViewerModel(fixture());
  const html = renderViewerHtml(model);

  assert.match(html, /class="workspace"/);
  assert.match(html, /<aside class="rail" aria-label="Demands">/);
  assert.match(html, /<section class="canvas-panel" aria-label="Execution graph">/);
  assert.match(html, /<aside class="inspector" aria-label="Selected work details" hidden>/);
  assert.match(html, /\.workspace \{ display: grid; grid-template-columns: 280px minmax\(560px, 1fr\);/);
  assert.match(html, /\.workspace\.has-inspector \{ grid-template-columns: 280px minmax\(560px, 1fr\) 380px; \}/);
  assert.match(html, /class="edge-layer"/);
  assert.match(html, /class="node-layer"/);
});

test("viewer model scopes executable nodes to their demand", () => {
  const model = buildViewerModel(fixture());
  assert.equal(model.nodes[0].demand_id, "DEM-001");
  assert.ok(model.layouts["DEM-001"].positions["NODE-001"]);
});

function fixture() {
  return {
    graph: { id: "DGE-001", title: "Viewer", status: "active", rev: 1 },
    demands: [{ id: "DEM-001", title: "Demand", source: "test", outcome: "Visible" }],
    requirements: [{ id: "REQ-001", demand_id: "DEM-001", statement: "See work", acceptance: ["visible"], validation: { method: "test", required_evidence: ["test"] } }],
    gaps: [], tracks: [{ id: "TRK-main", title: "Main" }],
    nodes: [{ id: "NODE-001", title: "Start", type: "implementation", track: "TRK-main", requirement_ids: ["REQ-001"], depends_on: [], status: "ready", validation: { required: ["npm test"], evidence_path: "delivery-graph/evidence/NODE-001/" } }]
  };
}
