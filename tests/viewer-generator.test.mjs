import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createGraph, addDemand } from "../src/graph-authoring.mjs";
import {
  buildViewerModel,
  defaultViewerPath,
  renderViewerHtml,
  writeViewer
} from "../src/viewer-renderer.mjs";

test("viewer is a self-contained offline HTML document at one stable path", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dge-viewer-"));
  const graphPath = path.join(root, "delivery-graph", "graph.json");
  const { graph } = addDemand(createGraph({ title: "Local <graph>" }), {
    title: "Viewer <safety>",
    source: "test",
    outcome: "Visible work"
  });

  const outputPath = writeViewer(graphPath, graph);
  const html = fs.readFileSync(outputPath, "utf8");

  assert.equal(outputPath, path.join(root, "delivery-graph", "view", "index.html"));
  assert.equal(outputPath, defaultViewerPath(graphPath));
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /id="dge-viewer-data" type="application\/json"/);
  assert.match(html, /Local &lt;graph&gt;/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/);
  assert.doesNotMatch(html, /Local <graph>|Viewer <safety>/);
});

test("viewer model carries every canonical collection without becoming a second store", () => {
  const graph = createGraph({ title: "Graph" });
  const model = buildViewerModel(graph);
  const html = renderViewerHtml(model);

  assert.deepEqual(Object.keys(model), ["generated_at", "graph", "demands", "requirements", "gaps", "tracks", "nodes", "layouts"]);
  assert.match(html, /Delivery Graph/);
  assert.equal(JSON.parse(html.match(/<script id="dge-viewer-data" type="application\/json">(.*?)<\/script>/s)[1]).graph.title, "Graph");
});
