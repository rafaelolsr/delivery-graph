import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildViewerModel, createViewerRefreshController, DEFAULT_VIEWER_REFRESH_INTERVAL, normalizeViewerRefreshInterval, renderViewerHtml, VIEWER_REFRESH_INTERVALS } from "../src/viewer-renderer.mjs";

const CLI = fileURLToPath(new URL("../bin/dge.mjs", import.meta.url));

test("offline refresh persists viewer context and defaults to a fifteen-second refresh policy", () => {
  const html = renderViewerHtml(buildViewerModel(emptyGraph()));
  assert.match(html, /sessionStorage\.setItem/);
  assert.match(html, /const VIEWER_REFRESH_INTERVALS = \[0,5000,10000,15000,30000\];/);
  assert.match(html, /const DEFAULT_VIEWER_REFRESH_INTERVAL = 15000;/);
  assert.match(html, /demand: selectedDemand, node: selectedNode, zoom/);
  assert.match(html, /left: viewport\.scrollLeft, top: viewport\.scrollTop, theme: document\.documentElement\.dataset\.theme, refreshInterval, lastRefreshAt/);
  assert.match(html, /document\.addEventListener\("visibilitychange"/);
  assert.match(html, /refreshController\.start\(\)/);
  assert.doesNotMatch(html, /setInterval\(\(\) =>/);
  assert.doesNotMatch(html, /\}, 2000\)/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|WebSocket|<script[^>]+src=|<link[^>]+href=/);
});

test("offline refresh exposes its setting, status, and manual action in the toolbar", () => {
  const html = renderViewerHtml(buildViewerModel(emptyGraph()));
  assert.match(html, /id="refresh-interval"/);
  assert.match(html, /id="refresh-now"/);
  assert.match(html, /id="refresh-status" role="status" aria-live="polite"/);
  assert.match(html, /refreshIntervalSelect\.addEventListener\("change"/);
  assert.match(html, /refreshController\.refreshNow\(\)/);
  assert.match(html, /Auto-refresh: /);
  assert.match(html, /Updated just now/);
});

test("refresh policy supports every approved interval and rejects stale saved values", () => {
  assert.deepEqual(VIEWER_REFRESH_INTERVALS, [0, 5000, 10000, 15000, 30000]);
  assert.equal(DEFAULT_VIEWER_REFRESH_INTERVAL, 15000);
  for (const interval of VIEWER_REFRESH_INTERVALS) assert.equal(normalizeViewerRefreshInterval(interval), interval);
  assert.equal(normalizeViewerRefreshInterval(2000), 15000);
  assert.equal(normalizeViewerRefreshInterval("invalid"), 15000);
});

test("refresh policy pauses while hidden and resumes only the selected interval", () => {
  const scheduled = [];
  const cancelled = [];
  let hidden = false;
  let refreshes = 0;
  const controller = createViewerRefreshController({
    initialInterval: 15000,
    isHidden: () => hidden,
    schedule: (callback, delay) => { const timer = { callback, delay }; scheduled.push(timer); return timer; },
    cancel: (timer) => cancelled.push(timer),
    onRefresh: () => { refreshes += 1; }
  });

  controller.start();
  assert.equal(scheduled.at(-1).delay, 15000);
  controller.setInterval(0);
  assert.equal(controller.interval, 0);
  assert.equal(cancelled.length, 1);
  hidden = true;
  controller.setInterval(30000);
  assert.equal(scheduled.at(-1).delay, 15000, "hidden documents do not schedule a new refresh");
  hidden = false;
  controller.visibilityChanged();
  assert.equal(scheduled.at(-1).delay, 30000);
  scheduled.at(-1).callback();
  assert.equal(refreshes, 1);
});

test("manual refresh cancels the pending refresh before reloading", () => {
  const timer = {};
  let cancelled = null;
  let refreshes = 0;
  const controller = createViewerRefreshController({
    initialInterval: 5000,
    isHidden: () => false,
    schedule: () => timer,
    cancel: (value) => { cancelled = value; },
    onRefresh: () => { refreshes += 1; }
  });
  controller.start();
  controller.refreshNow();
  assert.equal(cancelled, timer);
  assert.equal(refreshes, 1);
});

test("graph and evidence mutations refresh the same viewer file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dge-viewer-refresh-"));
  const graphPath = path.join(root, "delivery-graph", "graph.json");
  run(root, "init", "--graph", graphPath, "--title", "Refresh");
  run(root, "add-demand", "--graph", graphPath, "--title", "D", "--source", "test", "--outcome", "O");
  run(root, "add-requirement", "--graph", graphPath, "--demand", "DEM-001", "--statement", "R", "--acceptance", "A", "--evidence", "E");
  run(root, "add-track", "--graph", graphPath, "--title", "Main");
  run(root, "add-node", "--graph", graphPath, "--title", "N", "--type", "implementation", "--track", "TRK-main", "--requirements", "REQ-001", "--validation", "proof");
  const viewer = path.join(root, "delivery-graph", "view", "index.html");
  run(root, "transition", "--graph", graphPath, "NODE-001", "in_progress");
  assert.match(fs.readFileSync(viewer, "utf8"), /Working · proof pending/);
  run(root, "evidence", "add", "NODE-001", "--graph", graphPath, "--satisfies", "proof", "--summary", "Proof passed");
  assert.match(fs.readFileSync(viewer, "utf8"), /Proof passed/);
});

function run(cwd, ...args) { const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); return result; }
function emptyGraph() { return { graph: { id: "DGE-001", title: "Viewer", rev: 1 }, demands: [], requirements: [], gaps: [], tracks: [], nodes: [] }; }
