import assert from "node:assert/strict";
import test from "node:test";
import { buildViewerModel, deriveTruthState, renderViewerHtml } from "../src/viewer-renderer.mjs";

const html = renderViewerHtml(buildViewerModel({ graph: { id: "DGE-001", title: "Viewer", rev: 1 }, demands: [], requirements: [], gaps: [], tracks: [], nodes: [] }));

test("workspace landmarks and dynamic regions have accessible names", () => {
  assert.match(html, /<main class="workspace" aria-label="Delivery Graph workspace">/);
  assert.match(html, /<aside class="rail" aria-label="Demands">/);
  assert.match(html, /<section class="canvas-panel" aria-label="Execution graph">/);
  assert.match(html, /<aside class="inspector" aria-label="Selected work details" hidden>/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-label="Graph minimap" role="img"/);
});

test("all interactions use native controls with visible focus", () => {
  for (const id of ["zoom-out", "zoom-in", "fit-view", "reset-view", "theme-toggle", "refresh-now"]) {
    assert.match(html, new RegExp('<button[^>]+id="' + id + '"[^>]+type="button"'));
  }
  assert.match(html, /<label class="refresh-control" for="refresh-interval">Auto-refresh/);
  assert.match(html, /<select class="refresh-select" id="refresh-interval" aria-label="Auto-refresh interval">/);
  for (const [value, label] of [["0", "Off"], ["5000", "5 seconds"], ["10000", "10 seconds"], ["15000", "15 seconds"], ["30000", "30 seconds"]]) {
    assert.match(html, new RegExp('<option value="' + value + '">' + label + '</option>'));
  }
  assert.match(html, /id="refresh-status" role="status" aria-live="polite"/);
  assert.match(html, /button:focus-visible \{ outline: 2px solid var\(--focus\)/);
  assert.match(html, /\.refresh-select:focus-visible \{ outline: 2px solid var\(--focus\)/);
  assert.doesNotMatch(html, /tabindex=/);
  assert.doesNotMatch(html, /setAttribute\("role", "listitem"\)/);
});

test("theme and motion preferences are explicit", () => {
  assert.match(html, /\[data-theme="light"\]/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(html, /animation: none !important/);
  assert.match(html, /<meta name="color-scheme" content="dark light">/);
});

test("ongoing work is highlighted without relying on motion", () => {
  assert.match(html, /work-node\.is-active/);
  const truth = deriveTruthState({ status: "in_progress", validation: { required: ["test"] } }, { items: [], complete: false });
  assert.equal(truth.label, "Working · proof pending");
  assert.equal(truth.healthy, false);
});

test("demand activity is communicated with a textual running count", () => {
  const graph = {
    graph: { id: "DGE-001", title: "Running demand", rev: 1 },
    demands: [{ id: "DEM-001", title: "Active delivery" }],
    requirements: [{ id: "REQ-001", demand_id: "DEM-001", statement: "Ship" }],
    gaps: [], tracks: [{ id: "TRK-main", title: "Main" }],
    nodes: [
      { id: "NODE-001", title: "Build", track: "TRK-main", requirement_ids: ["REQ-001"], depends_on: [], status: "in_progress", validation: { required: ["test"] } },
      { id: "NODE-002", title: "Review", track: "TRK-main", requirement_ids: ["REQ-001"], depends_on: [], status: "review", validation: { required: ["review"] } }
    ]
  };
  const rendered = renderViewerHtml(buildViewerModel(graph));
  const staticMarkup = rendered.slice(0, rendered.indexOf('<script id="dge-viewer-data"'));
  assert.match(staticMarkup, /class="demand is-running"/);
  assert.match(staticMarkup, /data-running="true"/);
  assert.match(staticMarkup, /class="demand-running">2 running/);
  assert.match(staticMarkup, /<span class="sr-only">Selected demand<\/span>/);
  assert.match(rendered, /\.demand\[aria-selected="true"\].*box-shadow/);
  assert.match(rendered, /\.demand\.is-running \.demand-running::before/);
});

test("completed demand graphs are pre-rendered before JavaScript enhancement", () => {
  const completed = {
    graph: { id: "DGE-001", title: "Completed graph", rev: 2 },
    demands: [{ id: "DEM-001", title: "Finished demand", outcome: "Done" }],
    requirements: [{ id: "REQ-001", demand_id: "DEM-001", statement: "Finished work remains visible" }],
    gaps: [], tracks: [{ id: "TRK-main", title: "Main" }],
    nodes: [
      { id: "NODE-001", title: "Finished first node", type: "implementation", track: "TRK-main", requirement_ids: ["REQ-001"], depends_on: [], status: "done", validation: { required: ["proof one"], evidence_path: "delivery-graph/evidence/NODE-001/" } },
      { id: "NODE-002", title: "Finished second node", type: "test", track: "TRK-main", requirement_ids: ["REQ-001"], depends_on: ["NODE-001"], status: "done", validation: { required: ["proof two"], evidence_path: "delivery-graph/evidence/NODE-002/" } }
    ]
  };
  const rendered = renderViewerHtml(buildViewerModel(completed, { evidenceStatuses: [
    { node_id: "NODE-001", required: ["proof one"], satisfied: ["proof one"], missing: [], complete: true, items: [] },
    { node_id: "NODE-002", required: ["proof two"], satisfied: ["proof two"], missing: [], complete: true, items: [] }
  ] }));
  const applicationScript = rendered.indexOf('<script id="dge-viewer-data"');
  const staticMarkup = rendered.slice(0, applicationScript);
  assert.match(staticMarkup, /Finished first node/);
  assert.match(staticMarkup, /Finished second node/);
  assert.match(staticMarkup, /<path class="edge" data-from="NODE-001" data-to="NODE-002"/);
  assert.match(staticMarkup, /Proven done/);
  assert.match(staticMarkup, /<noscript>/);
});

test("every demand has a pre-rendered graph view for reliable switching", () => {
  const multiDemand = {
    graph: { id: "DGE-001", title: "All graphs", rev: 3 },
    demands: [
      { id: "DEM-001", title: "First", outcome: "Done" },
      { id: "DEM-002", title: "Second", outcome: "Done" }
    ],
    requirements: [
      { id: "REQ-001", demand_id: "DEM-001", statement: "First visible" },
      { id: "REQ-002", demand_id: "DEM-002", statement: "Second visible" }
    ],
    gaps: [], tracks: [{ id: "TRK-main", title: "Main" }],
    nodes: [
      { id: "NODE-001", title: "First finished node", type: "implementation", track: "TRK-main", requirement_ids: ["REQ-001"], depends_on: [], status: "done", validation: { required: ["proof"], evidence_path: "one" } },
      { id: "NODE-002", title: "Second finished node", type: "implementation", track: "TRK-main", requirement_ids: ["REQ-002"], depends_on: [], status: "done", validation: { required: ["proof"], evidence_path: "two" } }
    ]
  };
  const rendered = renderViewerHtml(buildViewerModel(multiDemand));
  assert.match(rendered, /data-demand-graph-view="DEM-001"[\s\S]*First finished node/);
  assert.match(rendered, /data-demand-graph-view="DEM-002"[\s\S]*Second finished node/);
  assert.match(rendered, /view\.hidden = view\.dataset\.demandGraphView !== selectedDemand/);
});

test("toolbar controls reserve their own space instead of overlaying the canvas", () => {
  assert.match(html, /\.toolbar-copy \{ flex: 1 1 auto; min-width: 0; overflow: hidden; \}/);
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 480px\)/);
  assert.match(html, /\.toolbar-actions \{ display: flex; flex: 1 1 100%; flex-wrap: wrap; justify-content: flex-end; width: 100%; min-width: 0;/);
  assert.match(html, /\.icon-button \{ flex: 0 0 auto;/);
});

test("demand rail owns the remaining height and scrolls independently", () => {
  assert.match(html, /\.rail \{ display: flex; flex-direction: column; overflow: hidden;/);
  assert.match(html, /\.demand-list \{ display: flex; flex: 1 1 auto; min-height: 0;/);
  assert.match(html, /overflow-y: auto; scrollbar-gutter: stable/);
});

test("hidden empty and inactive graph states cannot override visibility", () => {
  assert.match(html, /\[hidden\] \{ display: none !important; \}/);
});
