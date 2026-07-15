import assert from "node:assert/strict";
import test from "node:test";
import { buildViewerModel, layoutDemandGraph, renderViewerHtml, VIEWER_LAYOUT } from "../src/viewer-renderer.mjs";

test("DAG layout flows left to right by dependency depth", () => {
  const layout = layoutDemandGraph([
    node("NODE-001"),
    node("NODE-002", ["NODE-001"]),
    node("NODE-003", ["NODE-002"])
  ]);

  assert.ok(layout.positions["NODE-001"].x < layout.positions["NODE-002"].x);
  assert.ok(layout.positions["NODE-002"].x < layout.positions["NODE-003"].x);
  assert.equal(layout.positions["NODE-003"].depth, 2);
  assert.ok(layout.width >= VIEWER_LAYOUT.nodeWidth * 3);
});

test("parallel peers share a column without overlapping", () => {
  const layout = layoutDemandGraph([
    node("NODE-001"),
    node("NODE-002", ["NODE-001"]),
    node("NODE-003", ["NODE-001"])
  ]);
  const second = layout.positions["NODE-002"], third = layout.positions["NODE-003"];
  assert.equal(second.x, third.x);
  assert.ok(Math.abs(second.y - third.y) >= VIEWER_LAYOUT.nodeHeight + VIEWER_LAYOUT.rowGap);
});

test("demand labels and running metadata are contained in the desktop rail", () => {
  const model = buildViewerModel({
    graph: { id: "DGE-001", title: "Desktop viewer", rev: 1 },
    demands: [{ id: "DEM-999", title: "A deliberately long demand title that must wrap safely inside the fixed desktop rail without clipping its running status" }],
    requirements: [{ id: "REQ-999", demand_id: "DEM-999", statement: "Fit" }],
    gaps: [], tracks: [{ id: "TRK-main", title: "Main" }],
    nodes: [{ id: "NODE-999", title: "Run", track: "TRK-main", requirement_ids: ["REQ-999"], depends_on: [], status: "review", validation: { required: ["proof"] } }]
  });
  const html = renderViewerHtml(model);

  assert.match(html, /\.demand \{[^}]*flex: 0 0 auto;[^}]*min-width: 0;[^}]*overflow: hidden;/);
  assert.match(html, /\.demand-title \{[^}]*overflow-wrap: anywhere;/);
  assert.match(html, /\.demand-meta \{[^}]*flex-wrap: wrap;[^}]*justify-content: space-between;/);
  assert.match(html, /class="demand-running">1 running/);
  assert.match(html, /min-width: 1180px/);
});

test("refresh controls wrap inside the desktop toolbar instead of overlaying graph controls", () => {
  const html = renderViewerHtml(buildViewerModel({ graph: { id: "DGE-001", title: "Refresh", rev: 1 }, demands: [], requirements: [], gaps: [], tracks: [], nodes: [] }));
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 480px\)/);
  assert.match(html, /\.toolbar-actions \{[^}]*flex-wrap: wrap;[^}]*justify-content: flex-end;[^}]*width: 100%; min-width: 0;/);
  assert.match(html, /\.refresh-status \{ flex: 1 0 100%;[^}]*text-align: right;/);
  assert.match(html, /\.refresh-control \{[^}]*flex: 0 0 auto;/);
});

function node(id, dependsOn = []) {
  return { id, depends_on: dependsOn };
}
