import assert from "node:assert/strict";
import test from "node:test";
import { renderViewerHtml, buildViewerModel } from "../src/viewer-renderer.mjs";

test("inspector exposes requirements, complete contract, evidence, verdict, repairs, and blockers", () => {
  const graph = {
    graph: { id: "DGE-001", title: "Viewer", rev: 1 },
    demands: [{ id: "DEM-001", title: "D", outcome: "O" }],
    requirements: [{ id: "REQ-001", demand_id: "DEM-001", statement: "Truth is visible" }],
    gaps: [{ id: "GAP-001", question: "Who decides?", blocks: ["REQ-001"], resolution: null }], tracks: [],
    nodes: [{ id: "NODE-001", title: "Work", type: "implementation", status: "blocked", requirement_ids: ["REQ-001"], depends_on: [], track: "TRK-main", validation: { required: ["test"], evidence_path: "delivery-graph/evidence/NODE-001/" } }]
  };
  const html = renderViewerHtml(buildViewerModel(graph));
  for (const heading of ["Verification verdict", "Requirements", "Dependency boundary", "Validation contract", "Evidence", "Blockers and repairs"]) {
    assert.match(html, new RegExp(heading));
  }
  assert.match(html, /No evidence recorded\. This work is not proven\./);
  assert.match(html, /Repair the implementation/);
});

test("inspector is hidden unless the selected node is valid for the selected demand", () => {
  const html = renderViewerHtml(buildViewerModel({
    graph: { id: "DGE-001", title: "Viewer", rev: 1 },
    demands: [{ id: "DEM-001", title: "D", outcome: "O" }],
    requirements: [], gaps: [], tracks: [], nodes: []
  }));
  assert.match(html, /<aside class="inspector" aria-label="Selected work details" hidden>/);
  assert.match(html, /inspector\.hidden = !node/);
  assert.match(html, /workspace\.classList\.toggle\("has-inspector", Boolean\(node\)\)/);
  assert.doesNotMatch(html, /Nothing selected|Choose a work node to inspect it/);
});
