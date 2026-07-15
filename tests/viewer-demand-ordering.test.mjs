import assert from "node:assert/strict";
import test from "node:test";
import { buildViewerModel, projectDemandRail, renderViewerHtml, resolveInitialViewerSelection } from "../src/viewer-renderer.mjs";

test("demand projection sorts numeric identifiers newest first", () => {
  const projected = projectDemandRail([
    { id: "DEM-2" },
    { id: "DEM-10" },
    { id: "DEM-9" }
  ], []);

  assert.deepEqual(projected.map((demand) => demand.id), ["DEM-10", "DEM-9", "DEM-2"]);
});

test("only in-progress and review nodes make a demand running", () => {
  const projected = projectDemandRail([{ id: "DEM-001" }], [
    { id: "NODE-001", demand_id: "DEM-001", status: "in_progress" },
    { id: "NODE-002", demand_id: "DEM-001", status: "review" },
    { id: "NODE-003", demand_id: "DEM-001", status: "ready" },
    { id: "NODE-004", demand_id: "DEM-001", status: "blocked" },
    { id: "NODE-005", demand_id: "DEM-001", status: "done" },
    { id: "NODE-006", demand_id: "DEM-001", status: "verified" }
  ]);

  assert.equal(projected[0].running_count, 2);
  assert.equal(projected[0].running, true);
});

test("static and enhanced demand renderers consume the same ordered projection", () => {
  const graph = fixture();
  const model = buildViewerModel(graph);
  const html = renderViewerHtml(model);
  const applicationScript = html.indexOf('<script id="dge-viewer-data"');
  const staticMarkup = html.slice(0, applicationScript);

  assert.deepEqual(model.demands.map((demand) => demand.id), ["DEM-010", "DEM-002", "DEM-001"]);
  assert.ok(staticMarkup.indexOf('data-demand-id="DEM-010"') < staticMarkup.indexOf('data-demand-id="DEM-002"'));
  assert.ok(staticMarkup.indexOf('data-demand-id="DEM-002"') < staticMarkup.indexOf('data-demand-id="DEM-001"'));
  assert.match(html, /model\.demands\.forEach\(\(demand\) =>/);
  assert.match(staticMarkup, /2 running/);
});

test("newest running demand is the default without URL or session state", () => {
  const model = buildViewerModel(fixture());
  assert.deepEqual(resolveInitialViewerSelection(model), { selectedDemand: "DEM-010", selectedNode: null });
});

function fixture() {
  const demands = ["001", "010", "002"].map((id) => ({ id: `DEM-${id}`, title: `Demand ${id}` }));
  const requirements = demands.map((demand, index) => ({ id: `REQ-00${index + 1}`, demand_id: demand.id, statement: "Visible" }));
  return {
    graph: { id: "DGE-001", title: "Ordering", rev: 1 },
    demands,
    requirements,
    gaps: [],
    tracks: [{ id: "TRK-main", title: "Main" }],
    nodes: [
      { id: "NODE-001", title: "Working", track: "TRK-main", requirement_ids: ["REQ-002"], depends_on: [], status: "in_progress", validation: { required: ["proof"] } },
      { id: "NODE-002", title: "Reviewing", track: "TRK-main", requirement_ids: ["REQ-002"], depends_on: [], status: "review", validation: { required: ["proof"] } }
    ]
  };
}
