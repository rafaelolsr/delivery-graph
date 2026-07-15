import assert from "node:assert/strict";
import test from "node:test";
import { buildViewerModel, renderViewerHtml, resolveInitialViewerSelection, revealSelectedDemand, transitionViewerSelection } from "../src/viewer-renderer.mjs";

const html = renderViewerHtml(buildViewerModel({ graph: { id: "DGE-001", title: "Viewer", rev: 1 }, demands: [], requirements: [], gaps: [], tracks: [], nodes: [] }));

test("viewer exposes pan, zoom, fit, reset, and minimap navigation", () => {
  for (const id of ["zoom-out", "zoom-in", "fit-view", "reset-view", "minimap"]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /pointerdown/);
  assert.match(html, /pointermove/);
  assert.match(html, /setZoom/);
  assert.match(html, /fitView/);
  assert.match(html, /resetView/);
});

test("hash restores shareable demand and node selection", () => {
  assert.match(html, /new URLSearchParams\(location\.hash\.slice\(1\)\)/);
  assert.match(html, /values\.set\("demand", selectedDemand\)/);
  assert.match(html, /values\.set\("node", selectedNode\)/);
  assert.match(html, /history\.replaceState/);
  assert.match(html, /transitionViewerSelection\(model/);
});

test("selection fixtures execute every node and demand transition", () => {
  const model = selectionModel();
  assert.deepEqual(transitionViewerSelection(model, { selectedDemand: "DEM-001", selectedNode: null }, { type: "select-node", nodeId: "NODE-001" }), { selectedDemand: "DEM-001", selectedNode: "NODE-001" });
  assert.deepEqual(transitionViewerSelection(model, { selectedDemand: "DEM-001", selectedNode: "NODE-001" }, { type: "select-node", nodeId: "NODE-001" }), { selectedDemand: "DEM-001", selectedNode: null });
  assert.deepEqual(transitionViewerSelection(model, { selectedDemand: "DEM-001", selectedNode: "NODE-001" }, { type: "clear-node" }), { selectedDemand: "DEM-001", selectedNode: null });
  assert.deepEqual(transitionViewerSelection(model, { selectedDemand: "DEM-001", selectedNode: "NODE-001" }, { type: "select-demand", demandId: "DEM-002" }), { selectedDemand: "DEM-002", selectedNode: null });
  assert.match(html, /applySelection\(\{ type: "select-node", nodeId \}\)/);
  assert.match(html, /applySelection\(\{ type: "clear-node" \}\)/);
  assert.match(html, /applySelection\(\{ type: "select-demand", demandId: demand\.id \}\)/);
});

test("restoration fixtures accept valid state and reject stale or cross-demand nodes", () => {
  const model = selectionModel();
  assert.deepEqual(transitionViewerSelection(model, { selectedDemand: "DEM-001", selectedNode: "NODE-001" }, { type: "restore" }), { selectedDemand: "DEM-001", selectedNode: "NODE-001" });
  assert.deepEqual(transitionViewerSelection(model, { selectedDemand: "DEM-001", selectedNode: "NODE-404" }, { type: "restore" }), { selectedDemand: "DEM-001", selectedNode: null });
  assert.deepEqual(transitionViewerSelection(model, { selectedDemand: "DEM-001", selectedNode: "NODE-002" }, { type: "restore" }), { selectedDemand: "DEM-001", selectedNode: null });
  assert.deepEqual(transitionViewerSelection(model, { selectedDemand: "DEM-404", selectedNode: "NODE-002" }, { type: "restore" }), { selectedDemand: "DEM-001", selectedNode: null });
});

test("initial selection follows URL, session, newest-running, then newest-demand precedence", () => {
  const model = {
    demands: [
      { id: "DEM-004", running: false },
      { id: "DEM-003", running: true },
      { id: "DEM-002", running: true },
      { id: "DEM-001", running: false }
    ],
    nodes: [
      { id: "NODE-004", demand_id: "DEM-004" },
      { id: "NODE-003", demand_id: "DEM-003" }
    ]
  };

  assert.deepEqual(resolveInitialViewerSelection(model, { url: { demand: "DEM-004", node: "NODE-004" }, session: { demand: "DEM-003", node: "NODE-003" } }), { selectedDemand: "DEM-004", selectedNode: "NODE-004" });
  assert.deepEqual(resolveInitialViewerSelection(model, { url: { demand: "DEM-404" }, session: { demand: "DEM-003", node: "NODE-003" } }), { selectedDemand: "DEM-003", selectedNode: "NODE-003" });
  assert.deepEqual(resolveInitialViewerSelection(model), { selectedDemand: "DEM-003", selectedNode: null });
  assert.deepEqual(resolveInitialViewerSelection({ ...model, demands: model.demands.map((demand) => ({ ...demand, running: false })) }), { selectedDemand: "DEM-004", selectedNode: null });
});

test("refresh preserves valid session selection and the rail reveals it without reordering", () => {
  const model = {
    demands: [{ id: "DEM-003", running: true }, { id: "DEM-002", running: false }, { id: "DEM-001", running: false }],
    nodes: []
  };
  assert.deepEqual(resolveInitialViewerSelection(model, { session: { demand: "DEM-001" } }), { selectedDemand: "DEM-001", selectedNode: null });
  const orderBeforeReveal = model.demands.map((demand) => demand.id);
  const buttons = model.demands.map((demand, index) => ({
    dataset: { demandId: demand.id },
    top: index * 60,
    bottom: index * 60 + 48,
    scrollIntoView(options) {
      this.scrollOptions = options;
      this.top = 52;
      this.bottom = 100;
    }
  }));
  const demandList = { querySelectorAll: () => buttons };
  const selected = buttons[2];
  assert.ok(selected.top >= 100, "selected demand begins below the visible rail");

  assert.equal(revealSelectedDemand(demandList, "DEM-001"), selected);
  assert.deepEqual(selected.scrollOptions, { block: "nearest" });
  assert.ok(selected.top >= 0 && selected.bottom <= 100, "selected demand is revealed inside the rail");
  assert.deepEqual(model.demands.map((demand) => demand.id), orderBeforeReveal);
  assert.match(html, /revealSelectedDemand\(demandList, selectedDemand\)/);
});

test("selected nodes highlight their dependency paths", () => {
  assert.match(html, /edge\.dataset\.from === selectedNode \|\| edge\.dataset\.to === selectedNode/);
  assert.match(html, /is-active/);
  assert.match(html, /is-muted/);
});

function selectionModel() {
  return {
    demands: [{ id: "DEM-001" }, { id: "DEM-002" }],
    nodes: [{ id: "NODE-001", demand_id: "DEM-001" }, { id: "NODE-002", demand_id: "DEM-002" }]
  };
}
