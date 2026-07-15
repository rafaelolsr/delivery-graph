import assert from "node:assert/strict";
import test from "node:test";
import { deriveTruthState, renderViewerHtml, buildViewerModel } from "../src/viewer-renderer.mjs";

const contract = { required: ["unit tests", "visual proof"], evidence_path: "delivery-graph/evidence/NODE-001/" };
const node = { id: "NODE-001", title: "Work", type: "implementation", status: "in_progress", validation: contract };

test("uncertainty is never classified as healthy", () => {
  const cases = [
    [node, evidence({ items: [{ result: "ambiguous" }] }), "ambiguous"],
    [node, evidence({ items: [{ result: "fail" }] }), "failed"],
    [{ ...node, status: "blocked" }, evidence(), "blocked"],
    [{ ...node, status: "done-waived" }, evidence(), "waived"],
    [node, evidence(), "active"]
  ];
  for (const [candidate, proof, key] of cases) {
    const truth = deriveTruthState(candidate, proof);
    assert.equal(truth.key, key);
    assert.equal(truth.healthy, false);
    assert.notEqual(truth.tone, "complete");
  }
});

test("only completed work with complete evidence is healthy", () => {
  assert.deepEqual(deriveTruthState({ ...node, status: "done" }, evidence({ complete: true, satisfied: contract.required })), {
    key: "proven", label: "Proven done", tone: "complete", healthy: true
  });
});

test("task cards show at most two criteria plus a remainder", () => {
  const graph = fixture();
  graph.nodes[0].validation.required = ["one", "two", "three", "four"];
  const html = renderViewerHtml(buildViewerModel(graph));
  assert.match(html, /<ul class="criteria"><li>one<\/li><li>two<\/li><li>\+2 more criteria<\/li><\/ul>/);
  assert.doesNotMatch(html, /<li>three<\/li>|<li>four<\/li>/);
});

function evidence(overrides = {}) { return { required: contract.required, satisfied: [], missing: contract.required, complete: false, items: [], ...overrides }; }
function fixture() { return { graph: { id: "DGE-001", title: "Viewer", rev: 1 }, demands: [{ id: "DEM-001", title: "D", outcome: "O" }], requirements: [{ id: "REQ-001", demand_id: "DEM-001", statement: "S" }], gaps: [], tracks: [], nodes: [{ ...node, requirement_ids: ["REQ-001"], depends_on: [], track: "TRK-main" }] }; }
