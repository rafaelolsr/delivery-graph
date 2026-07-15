import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./graph-engine.mjs";
import { resolveRuntimePath } from "./path-utils.mjs";
import { getAllEvidenceStatuses } from "./evidence-engine.mjs";

export const VIEWER_RUNTIME_PATH = "delivery-graph/view/index.html";
export const VIEWER_LAYOUT = Object.freeze({ nodeWidth: 272, nodeHeight: 216, columnGap: 100, rowGap: 44, margin: 64 });
export const VIEWER_REFRESH_INTERVALS = Object.freeze([0, 5000, 10000, 15000, 30000]);
export const DEFAULT_VIEWER_REFRESH_INTERVAL = 15000;

export function defaultViewerPath(graphPath) {
  return resolveRuntimePath(graphPath, VIEWER_RUNTIME_PATH);
}

export function buildViewerModel(graph, options = {}) {
  const requirementDemand = new Map((graph.requirements ?? []).map((requirement) => [requirement.id, requirement.demand_id]));
  const evidenceByNode = new Map((options.evidenceStatuses ?? []).map((status) => [status.node_id, status]));
  const nodes = (graph.nodes ?? []).map((node) => ({
    ...node,
    demand_id: requirementDemand.get(node.requirement_ids?.[0]) ?? null,
    evidence: evidenceByNode.get(node.id) ?? emptyEvidence(node),
    truth: deriveTruthState(node, evidenceByNode.get(node.id) ?? emptyEvidence(node))
  }));
  const demands = projectDemandRail(graph.demands ?? [], nodes);
  const layouts = Object.fromEntries(demands.map((demand) => [
    demand.id,
    layoutDemandGraph(nodes.filter((node) => node.demand_id === demand.id))
  ]));

  return {
    generated_at: new Date().toISOString(),
    graph: graph.graph,
    demands,
    requirements: graph.requirements ?? [],
    gaps: graph.gaps ?? [],
    tracks: graph.tracks ?? [],
    nodes,
    layouts
  };
}

export function projectDemandRail(demands, nodes) {
  const originalIndex = new Map(demands.map((demand, index) => [demand.id, index]));
  const numericId = (id) => {
    const match = String(id).match(/(\d+)$/);
    return match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
  };

  return demands
    .map((demand) => {
      const runningCount = nodes.filter((node) =>
        node.demand_id === demand.id && ["in_progress", "review"].includes(node.status)
      ).length;
      return { ...demand, running_count: runningCount, running: runningCount > 0 };
    })
    .sort((left, right) => {
      const numericDifference = numericId(right.id) - numericId(left.id);
      return numericDifference || originalIndex.get(left.id) - originalIndex.get(right.id);
    });
}

export function deriveTruthState(node, evidence) {
  if (!node.validation || !Array.isArray(node.validation.required) || node.validation.required.length === 0) {
    return { key: "malformed", label: "Contract missing", tone: "danger", healthy: false };
  }
  if ((evidence.items ?? []).some((item) => item.result === "ambiguous")) {
    return { key: "ambiguous", label: "Needs judgment", tone: "warning", healthy: false };
  }
  if ((evidence.items ?? []).some((item) => item.result === "fail")) {
    return { key: "failed", label: "Validation failed", tone: "danger", healthy: false };
  }
  if (node.status === "blocked") return { key: "blocked", label: "Blocked", tone: "danger", healthy: false };
  if (["done", "verified"].includes(node.status) && evidence.complete) {
    return { key: "proven", label: node.status === "done" ? "Proven done" : "Verified", tone: "complete", healthy: true };
  }
  if (node.status === "done-waived") return { key: "waived", label: "Done · proof waived", tone: "warning", healthy: false };
  if (node.status === "in_progress") return { key: "active", label: "Working · proof pending", tone: "active", healthy: false };
  return { key: "pending", label: "Proof pending", tone: "neutral", healthy: false };
}

function emptyEvidence(node) {
  return { node_id: node.id, required: node.validation?.required ?? [], satisfied: [], missing: node.validation?.required ?? [], complete: false, items: [] };
}

export function layoutDemandGraph(nodes, metrics = VIEWER_LAYOUT) {
  const scoped = new Map(nodes.map((node) => [node.id, node]));
  const depthMemo = new Map();
  const visiting = new Set();

  function depth(node) {
    if (depthMemo.has(node.id)) return depthMemo.get(node.id);
    if (visiting.has(node.id)) return 0;
    visiting.add(node.id);
    const dependencies = (node.depends_on ?? []).map((id) => scoped.get(id)).filter(Boolean);
    const value = dependencies.length === 0 ? 0 : Math.max(...dependencies.map(depth)) + 1;
    visiting.delete(node.id);
    depthMemo.set(node.id, value);
    return value;
  }

  const columns = new Map();
  for (const node of nodes) {
    const column = depth(node);
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(node);
  }

  const positions = {};
  for (const [column, columnNodes] of [...columns].sort(([a], [b]) => a - b)) {
    columnNodes.sort((a, b) => a.id.localeCompare(b.id));
    columnNodes.forEach((node, row) => {
      positions[node.id] = {
        x: metrics.margin + column * (metrics.nodeWidth + metrics.columnGap),
        y: metrics.margin + row * (metrics.nodeHeight + metrics.rowGap),
        depth: column
      };
    });
  }

  const maxDepth = Math.max(0, ...Object.values(positions).map((position) => position.depth));
  const maxRows = Math.max(1, ...[...columns.values()].map((column) => column.length));
  return {
    positions,
    width: metrics.margin * 2 + (maxDepth + 1) * metrics.nodeWidth + maxDepth * metrics.columnGap,
    height: metrics.margin * 2 + maxRows * metrics.nodeHeight + (maxRows - 1) * metrics.rowGap
  };
}

export function transitionViewerSelection(model, state, action) {
  const firstDemandId = model.demands?.[0]?.id ?? null;
  const normalize = (demandId, nodeId) => {
    const selectedDemand = model.demands?.some((demand) => demand.id === demandId) ? demandId : firstDemandId;
    const selectedNode = model.nodes?.some((node) => node.id === nodeId && node.demand_id === selectedDemand) ? nodeId : null;
    return { selectedDemand, selectedNode };
  };

  if (action.type === "restore") return normalize(state.selectedDemand, state.selectedNode);
  if (action.type === "select-demand") return normalize(action.demandId, null);
  if (action.type === "clear-node") return normalize(state.selectedDemand, null);
  if (action.type === "select-node") {
    const normalized = normalize(state.selectedDemand, state.selectedNode);
    const validNode = model.nodes?.some((node) => node.id === action.nodeId && node.demand_id === normalized.selectedDemand);
    if (!validNode) return { ...normalized, selectedNode: null };
    return { ...normalized, selectedNode: normalized.selectedNode === action.nodeId ? null : action.nodeId };
  }
  return normalize(state.selectedDemand, state.selectedNode);
}

export function resolveInitialViewerSelection(model, sources = {}) {
  const validSelection = (source) => {
    const selectedDemand = model.demands?.find((demand) => demand.id === source?.demand)?.id;
    if (!selectedDemand) return null;
    const selectedNode = model.nodes?.find((node) => node.id === source?.node && node.demand_id === selectedDemand)?.id ?? null;
    return { selectedDemand, selectedNode };
  };

  return validSelection(sources.url)
    ?? validSelection(sources.session)
    ?? {
      selectedDemand: model.demands?.find((demand) => demand.running)?.id ?? model.demands?.[0]?.id ?? null,
      selectedNode: null
  };
}

export function revealSelectedDemand(demandList, selectedDemand) {
  const selectedButton = Array.from(demandList.querySelectorAll("[data-demand-id]"))
    .find((button) => button.dataset.demandId === selectedDemand);
  selectedButton?.scrollIntoView({ block: "nearest" });
  return selectedButton ?? null;
}

export function normalizeViewerRefreshInterval(value) {
  const interval = Number(value);
  return VIEWER_REFRESH_INTERVALS.includes(interval) ? interval : DEFAULT_VIEWER_REFRESH_INTERVAL;
}

export function createViewerRefreshController({ initialInterval, isHidden, schedule, cancel, onRefresh }) {
  let interval = normalizeViewerRefreshInterval(initialInterval);
  let timer = null;

  const clear = () => {
    if (timer === null) return;
    cancel(timer);
    timer = null;
  };
  const arm = () => {
    clear();
    if (interval === 0 || isHidden()) return;
    timer = schedule(() => { timer = null; onRefresh(); }, interval);
  };

  return {
    get interval() { return interval; },
    setInterval(nextInterval) { interval = normalizeViewerRefreshInterval(nextInterval); arm(); return interval; },
    visibilityChanged() { arm(); },
    refreshNow() { clear(); onRefresh(); },
    start() { arm(); },
    stop() { clear(); }
  };
}

export function renderViewerHtml(model) {
  const data = JSON.stringify(model).replaceAll("<", "\\u003c");
  const title = escapeHtml(model.graph?.title ?? "Delivery graph");
  const initialDemandId = resolveInitialViewerSelection(model).selectedDemand;
  const initialGraph = renderStaticGraph(model, initialDemandId);
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>${title} · Delivery Graph</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #090c11; --panel: #0e131b; --panel-2: #121924; --raised: #17202d;
      --text: #edf1f7; --muted: #8491a5; --quiet: #536075; --line: #263142;
      --active: #67e8c2; --active-soft: rgba(103,232,194,.12); --focus: #9bbcff;
      --danger: #ff7d8f; --warning: #f6c76b; --complete: #7dd3a6;
      --shadow: 0 20px 60px rgba(0,0,0,.34);
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    [data-theme="light"] {
      color-scheme: light;
      --bg: #eef1f5; --panel: #f8f9fb; --panel-2: #ffffff; --raised: #f0f3f7;
      --text: #18202d; --muted: #5d6a7c; --quiet: #8a95a4; --line: #d7dde6;
      --active: #087f66; --active-soft: rgba(8,127,102,.1); --focus: #315ea8;
      --danger: #b4233c; --warning: #916515; --complete: #16764d;
      --shadow: 0 18px 45px rgba(35,45,60,.12);
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    html, body { height: 100%; }
    body { margin: 0; overflow: hidden; background: var(--bg); color: var(--text); }
    button { font: inherit; color: inherit; }
    button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .workspace { display: grid; grid-template-columns: 280px minmax(560px, 1fr); height: 100vh; min-width: 1180px; }
    .workspace.has-inspector { grid-template-columns: 280px minmax(560px, 1fr) 380px; }
    .rail, .inspector { min-width: 0; background: var(--panel); }
    .rail { display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--line); }
    .inspector { border-left: 1px solid var(--line); overflow: auto; }
    .brand { padding: 26px 24px 22px; border-bottom: 1px solid var(--line); }
    .brand-mark { display: flex; align-items: center; gap: 10px; color: var(--active); font-size: 12px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
    .brand-mark::before { content: ""; width: 9px; height: 9px; border: 2px solid currentColor; border-radius: 50%; box-shadow: 0 0 0 5px var(--active-soft); }
    .brand h1 { margin: 18px 0 8px; font-size: 20px; line-height: 1.2; font-weight: 650; letter-spacing: -.025em; }
    .brand p, .muted { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
    .rail-heading { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px 10px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .11em; text-transform: uppercase; }
    .demand-list { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; gap: 4px; padding: 0 12px 18px; overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable; }
    .demand { position: relative; flex: 0 0 auto; width: 100%; min-width: 0; overflow: hidden; border: 1px solid transparent; border-radius: 10px; padding: 13px 12px 13px 18px; background: transparent; text-align: left; cursor: pointer; }
    .demand:hover { background: var(--raised); }
    .demand.is-running { border-color: color-mix(in srgb, var(--active) 30%, transparent); background: color-mix(in srgb, var(--active-soft) 52%, transparent); }
    .demand.is-running .demand-running { color: var(--active); font-weight: 700; }
    .demand.is-running .demand-running::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px var(--active-soft); vertical-align: 1px; }
    .demand[aria-selected="true"] { border-color: color-mix(in srgb, var(--active) 68%, var(--line)); background: var(--active-soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--active) 24%, transparent); }
    .demand[aria-selected="true"]::before { content: ""; position: absolute; inset: 10px auto 10px 0; width: 4px; border-radius: 4px; background: var(--active); }
    .demand[aria-selected="true"] .demand-title { color: var(--text); }
    .demand-id { color: var(--muted); font: 600 10px/1 ui-monospace, SFMono-Regular, monospace; letter-spacing: .06em; }
    .demand-title { display: block; min-width: 0; margin-top: 6px; overflow-wrap: anywhere; font-size: 13px; line-height: 1.35; font-weight: 600; }
    .demand-meta { display: flex; min-width: 0; flex-wrap: wrap; justify-content: space-between; gap: 5px 8px; margin-top: 8px; color: var(--muted); font-size: 11px; }
    .demand-meta span { min-width: 0; overflow-wrap: anywhere; }
    .rail-footer { margin-top: auto; padding: 16px 24px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }
    .canvas-panel { display: grid; grid-template-rows: auto 1fr; min-width: 0; background: var(--bg); }
    .toolbar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 480px); align-items: center; gap: 16px; min-width: 0; min-height: 78px; padding: 14px 18px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--bg) 88%, transparent); }
    .toolbar-copy { flex: 1 1 auto; min-width: 0; overflow: hidden; }
    .toolbar-copy h2 { overflow: hidden; margin: 0 0 5px; font-size: 15px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
    .toolbar-copy p { overflow: hidden; margin: 0; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .toolbar-actions { display: flex; flex: 1 1 100%; flex-wrap: wrap; justify-content: flex-end; width: 100%; min-width: 0; gap: 6px; max-width: 100%; white-space: normal; }
    .icon-button { flex: 0 0 auto; border: 1px solid var(--line); border-radius: 8px; padding: 8px 9px; background: var(--panel); color: var(--muted); cursor: pointer; font-size: 11px; }
    .icon-button:hover { color: var(--text); border-color: var(--quiet); }
    .refresh-control { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; white-space: nowrap; }
    .refresh-select { min-width: 72px; border: 1px solid var(--line); border-radius: 8px; padding: 7px 8px; background: var(--panel); color: var(--text); font: inherit; cursor: pointer; }
    .refresh-select:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .refresh-status { flex: 1 0 100%; color: var(--muted); font-size: 10px; line-height: 1.35; text-align: right; }
    .graph-viewport { position: relative; overflow: auto; cursor: grab; background-image: radial-gradient(var(--line) .7px, transparent .7px); background-size: 24px 24px; }
    .graph-viewport.is-panning { cursor: grabbing; user-select: none; }
    .graph-surface { position: relative; min-width: 100%; min-height: 100%; }
    .graph-content { position: absolute; inset: 0; transform-origin: 0 0; }
    .edge-layer, .node-layer { position: absolute; inset: 0; overflow: visible; }
    .edge { fill: none; stroke: var(--quiet); stroke-width: 1.5; transition: stroke .15s, stroke-width .15s, opacity .15s; }
    .edge.is-muted { opacity: .18; }
    .edge.is-active { stroke: var(--active); stroke-width: 2.5; }
    .edge-arrow { fill: var(--quiet); }
    .work-node { position: absolute; width: ${VIEWER_LAYOUT.nodeWidth}px; min-height: ${VIEWER_LAYOUT.nodeHeight}px; border: 1px solid var(--line); border-radius: 13px; padding: 15px 16px; background: var(--panel-2); box-shadow: var(--shadow); text-align: left; cursor: pointer; transition: border-color .15s, transform .15s; }
    .work-node:hover { border-color: var(--quiet); transform: translateY(-2px); }
    .work-node[aria-selected="true"] { border-color: var(--active); box-shadow: 0 0 0 3px var(--active-soft), var(--shadow); }
    .work-node.is-active { border-color: color-mix(in srgb, var(--active) 60%, var(--line)); }
    .work-node.is-active .status::before { animation: activity-pulse 1.8s ease-in-out infinite; box-shadow: 0 0 0 4px var(--active-soft); }
    .node-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .node-id { color: var(--muted); font: 600 10px/1 ui-monospace, SFMono-Regular, monospace; letter-spacing: .06em; }
    .status { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 10px; text-transform: uppercase; }
    .status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .status-in_progress { color: var(--active); }
    .status-blocked, .truth-danger { color: var(--danger); }
    .status-done, .status-verified, .truth-complete { color: var(--complete); }
    .truth-warning { color: var(--warning); }
    .truth-active { color: var(--active); }
    .node-title { margin: 14px 0 11px; font-size: 13px; line-height: 1.35; font-weight: 650; }
    .criteria { display: grid; gap: 6px; margin: 0 0 12px; padding: 0; list-style: none; color: var(--muted); font-size: 10px; line-height: 1.35; }
    .criteria li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .criteria li::before { content: "✓"; margin-right: 6px; color: var(--quiet); }
    .node-foot { display: flex; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; }
    .empty { display: grid; place-items: center; min-height: 100%; padding: 40px; color: var(--muted); text-align: center; }
    .inspector-head { padding: 26px 24px 20px; border-bottom: 1px solid var(--line); }
    .inspector-label { color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .inspector-head h2 { margin: 12px 0 8px; font-size: 18px; line-height: 1.3; letter-spacing: -.02em; }
    .inspector-body { padding: 22px 24px; }
    .inspector-body h3 { margin: 22px 0 9px; color: var(--muted); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
    .inspector-body h3:first-child { margin-top: 0; }
    .inspector-body p { margin: 0 0 7px; color: var(--muted); font-size: 12px; line-height: 1.6; }
    .verdict { border-left: 3px solid currentColor; padding: 9px 11px; background: var(--raised); color: var(--muted); font-size: 12px; }
    .verdict.truth-danger { color: var(--danger); } .verdict.truth-warning { color: var(--warning); } .verdict.truth-active { color: var(--active); } .verdict.truth-complete { color: var(--complete); }
    .evidence-item { margin-bottom: 9px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-2); }
    .evidence-item strong { display: block; margin-bottom: 4px; font-size: 11px; } .evidence-item span { color: var(--muted); font-size: 10px; }
    .code-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .code-list code { border: 1px solid var(--line); border-radius: 6px; padding: 5px 7px; background: var(--raised); color: var(--text); font-size: 10px; }
    .minimap { position: absolute; right: 18px; bottom: 18px; width: 150px; height: 92px; border: 1px solid var(--line); border-radius: 9px; background: color-mix(in srgb, var(--panel) 92%, transparent); box-shadow: var(--shadow); pointer-events: none; }
    .minimap rect { fill: var(--quiet); opacity: .7; } .minimap rect.is-selected { fill: var(--active); opacity: 1; }
    @keyframes activity-pulse { 50% { opacity: .35; transform: scale(.75); } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
  </style>
</head>
<body>
  <main class="workspace" aria-label="Delivery Graph workspace">
    <aside class="rail" aria-label="Demands">
      <header class="brand">
        <div class="brand-mark">Delivery Graph</div>
        <h1>${title}</h1>
        <p>Local truth, backed by evidence.</p>
      </header>
      <div class="rail-heading"><span>Demands</span><span id="demand-count"></span></div>
      <nav id="demand-list" class="demand-list" aria-label="Select a demand">${renderStaticDemands(model, initialDemandId)}</nav>
      <footer class="rail-footer"><span id="graph-revision"></span> · offline</footer>
    </aside>

    <section class="canvas-panel" aria-label="Execution graph">
      <header class="toolbar">
        <div class="toolbar-copy"><h2 id="canvas-title">${escapeHtml(initialGraph.demand?.title ?? "Select a demand")}</h2><p id="canvas-summary">${escapeHtml(initialGraph.demand?.summary || initialGraph.demand?.outcome || "Executable work and dependency flow")}</p></div>
        <div class="toolbar-actions" aria-label="Graph controls">
          <button class="icon-button" id="zoom-out" type="button" aria-label="Zoom out">−</button>
          <button class="icon-button" id="zoom-in" type="button" aria-label="Zoom in">+</button>
          <button class="icon-button" id="fit-view" type="button">Fit graph</button>
          <button class="icon-button" id="reset-view" type="button">Reset</button>
          <button class="icon-button" id="theme-toggle" type="button">Light theme</button>
          <label class="refresh-control" for="refresh-interval">Auto-refresh
            <select class="refresh-select" id="refresh-interval" aria-label="Auto-refresh interval">
              <option value="0">Off</option>
              <option value="5000">5 seconds</option>
              <option value="10000">10 seconds</option>
              <option value="15000">15 seconds</option>
              <option value="30000">30 seconds</option>
            </select>
          </label>
          <button class="icon-button" id="refresh-now" type="button">Refresh now</button>
          <span class="refresh-status" id="refresh-status" role="status" aria-live="polite"></span>
        </div>
      </header>
      <div id="graph-viewport" class="graph-viewport">
        <div id="graph-empty" class="empty"${initialGraph.nodes.length ? " hidden" : ""}>No executable work is planned for this demand yet.</div>
        ${renderGraphViews(model, initialDemandId)}
        <svg id="minimap" class="minimap" aria-label="Graph minimap" role="img" viewBox="0 0 ${initialGraph.width} ${initialGraph.height}">${initialGraph.minimap}</svg>
        <noscript><p class="sr-only">The initial demand graph is fully rendered. Enable JavaScript only for switching demands and navigation.</p></noscript>
      </div>
    </section>

    <aside class="inspector" aria-label="Selected work details" hidden>
      <header class="inspector-head"><div class="inspector-label">Inspector</div><h2 id="inspector-title"></h2><p id="inspector-status" class="muted"></p></header>
      <div id="inspector-body" class="inspector-body" aria-live="polite"></div>
    </aside>
  </main>

  <script id="dge-viewer-data" type="application/json">${data}</script>
  <script>
    (() => {
      const VIEWER_REFRESH_INTERVALS = ${JSON.stringify(VIEWER_REFRESH_INTERVALS)};
      const DEFAULT_VIEWER_REFRESH_INTERVAL = ${DEFAULT_VIEWER_REFRESH_INTERVAL};
      ${transitionViewerSelection.toString()}
      ${resolveInitialViewerSelection.toString()}
      ${revealSelectedDemand.toString()}
      ${normalizeViewerRefreshInterval.toString()}
      ${createViewerRefreshController.toString()}
      const model = JSON.parse(document.getElementById("dge-viewer-data").textContent);
      const demandList = document.getElementById("demand-list");
      const viewport = document.getElementById("graph-viewport");
      const minimap = document.getElementById("minimap");
      const empty = document.getElementById("graph-empty");
      const workspace = document.querySelector(".workspace");
      const inspector = document.querySelector(".inspector");
      let surface = null, content = null, edgeLayer = null, nodeLayer = null;
      const storageKey = "dge-viewer:" + model.graph.id;
      const saved = readSavedState();
      const hashState = readHash();
      const restoredSelection = resolveInitialViewerSelection(model, { url: hashState, session: saved });
      let selectedDemand = restoredSelection.selectedDemand;
      let selectedNode = restoredSelection.selectedNode;
      let zoom = Number(saved.zoom) || 1;
      let refreshInterval = normalizeViewerRefreshInterval(saved.refreshInterval);
      let lastRefreshAt = Number(saved.lastRefreshAt) || Date.now();
      let baseWidth = 760, baseHeight = 520;

      function applySelection(action) {
        const next = transitionViewerSelection(model, { selectedDemand, selectedNode }, action);
        selectedDemand = next.selectedDemand;
        selectedNode = next.selectedNode;
      }

      document.getElementById("demand-count").textContent = model.demands.length;
      document.getElementById("graph-revision").textContent = "rev " + (model.graph.rev ?? 0);

      function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      }

      function readHash() {
        const values = new URLSearchParams(location.hash.slice(1));
        return { demand: values.get("demand"), node: values.get("node") };
      }

      function readSavedState() {
        try { return JSON.parse(sessionStorage.getItem(storageKey) || "{}"); } catch { return {}; }
      }

      function saveState() {
        sessionStorage.setItem(storageKey, JSON.stringify({ demand: selectedDemand, node: selectedNode, zoom, left: viewport.scrollLeft, top: viewport.scrollTop, theme: document.documentElement.dataset.theme, refreshInterval, lastRefreshAt }));
      }

      const refreshController = createViewerRefreshController({
        initialInterval: refreshInterval,
        isHidden: () => document.hidden,
        schedule: (callback, delay) => window.setTimeout(callback, delay),
        cancel: (timer) => window.clearTimeout(timer),
        onRefresh: () => { lastRefreshAt = Date.now(); saveState(); location.reload(); }
      });

      function refreshLabel(interval) { return interval === 0 ? "Off" : interval / 1000 + "s"; }
      function renderRefreshStatus() {
        const secondsAgo = Math.max(0, Math.floor((Date.now() - lastRefreshAt) / 1000));
        const updated = secondsAgo < 2 ? "Updated just now" : "Updated " + secondsAgo + "s ago";
        document.getElementById("refresh-status").textContent = "Auto-refresh: " + refreshLabel(refreshInterval) + " · " + updated;
      }

      function syncHash() {
        const values = new URLSearchParams();
        if (selectedDemand) values.set("demand", selectedDemand);
        if (selectedNode) values.set("node", selectedNode);
        history.replaceState(null, "", "#" + values.toString());
      }

      function renderDemands() {
        demandList.replaceChildren();
        model.demands.forEach((demand) => {
          const nodes = model.nodes.filter((node) => node.demand_id === demand.id);
          const button = element("button", "demand" + (demand.running ? " is-running" : ""));
          button.type = "button";
          button.dataset.demandId = demand.id;
          button.dataset.running = String(demand.running);
          button.setAttribute("aria-selected", String(demand.id === selectedDemand));
          button.append(element("span", "demand-id", demand.id), element("span", "demand-title", demand.title));
          const meta = element("span", "demand-meta");
          meta.append(element("span", "", nodes.length + " nodes"), element("span", demand.running ? "demand-running" : "", demand.running_count ? demand.running_count + " running" : "quiet"));
          button.append(meta);
          if (demand.id === selectedDemand) button.append(element("span", "sr-only", "Selected demand"));
          button.addEventListener("click", () => { applySelection({ type: "select-demand", demandId: demand.id }); render(); resetView(); syncHash(); saveState(); });
          demandList.append(button);
        });
        revealSelectedDemand(demandList, selectedDemand);
      }

      function renderGraph() {
        const demand = model.demands.find((item) => item.id === selectedDemand);
        const nodes = model.nodes.filter((node) => node.demand_id === selectedDemand);
        const layout = model.layouts[selectedDemand] ?? { positions: {}, width: 0, height: 0 };
        document.getElementById("canvas-title").textContent = demand?.title ?? "No demands";
        document.getElementById("canvas-summary").textContent = demand?.summary || demand?.outcome || "Executable work and dependency flow";
        empty.hidden = nodes.length > 0;
        const graphViews = Array.from(document.querySelectorAll("[data-demand-graph-view]"));
        graphViews.forEach((view) => { view.hidden = view.dataset.demandGraphView !== selectedDemand; });
        surface = graphViews.find((view) => view.dataset.demandGraphView === selectedDemand) ?? null;
        if (!surface) return;
        content = surface.querySelector(".graph-content");
        edgeLayer = surface.querySelector(".edge-layer");
        nodeLayer = surface.querySelector(".node-layer");
        baseWidth = Math.max(layout.width, 760); baseHeight = Math.max(layout.height, 520);
        edgeLayer.setAttribute("width", baseWidth); edgeLayer.setAttribute("height", baseHeight);
        nodeLayer.querySelectorAll("[data-node-id]").forEach((button) => {
          const nodeId = button.dataset.nodeId;
          button.setAttribute("aria-selected", String(nodeId === selectedNode));
          button.onclick = () => { applySelection({ type: "select-node", nodeId }); renderGraph(); renderInspector(); syncHash(); saveState(); };
        });
        edgeLayer.querySelectorAll(".edge").forEach((edge) => {
          edge.classList.remove("is-active", "is-muted");
          if (!selectedNode) return;
          const active = edge.dataset.from === selectedNode || edge.dataset.to === selectedNode;
          edge.classList.add(active ? "is-active" : "is-muted");
        });
        renderMinimap(layout, nodes); applyZoom();
      }

      function renderMinimap(layout, nodes) {
        minimap.replaceChildren(); minimap.setAttribute("viewBox", "0 0 " + baseWidth + " " + baseHeight);
        nodes.forEach((node) => {
          const position = layout.positions[node.id]; if (!position) return;
          const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.setAttribute("x", position.x); rect.setAttribute("y", position.y); rect.setAttribute("width", ${VIEWER_LAYOUT.nodeWidth}); rect.setAttribute("height", ${VIEWER_LAYOUT.nodeHeight}); rect.setAttribute("rx", 12);
          if (node.id === selectedNode) rect.setAttribute("class", "is-selected"); minimap.append(rect);
        });
      }

      function applyZoom() {
        zoom = Math.min(1.6, Math.max(.45, zoom));
        content.style.width = baseWidth + "px"; content.style.height = baseHeight + "px"; content.style.transform = "scale(" + zoom + ")";
        surface.style.width = Math.max(viewport.clientWidth, baseWidth * zoom) + "px"; surface.style.height = Math.max(viewport.clientHeight, baseHeight * zoom) + "px";
      }

      function setZoom(next) { zoom = next; applyZoom(); saveState(); }
      function fitView() { setZoom(Math.min(1, (viewport.clientWidth - 48) / baseWidth, (viewport.clientHeight - 48) / baseHeight)); viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" }); }
      function resetView() { setZoom(1); viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" }); }

      function renderInspector() {
        const node = model.nodes.find((item) => item.id === selectedNode);
        const title = document.getElementById("inspector-title");
        const status = document.getElementById("inspector-status");
        const body = document.getElementById("inspector-body");
        body.replaceChildren();
        inspector.hidden = !node;
        workspace.classList.toggle("has-inspector", Boolean(node));
        if (!node) { title.textContent = ""; status.textContent = ""; return; }
        title.textContent = node.title; status.textContent = node.id + " · " + node.status.replaceAll("_", " ");
        body.append(element("h3", "", "Verification verdict"));
        body.append(element("div", "verdict truth-" + node.truth.tone, node.truth.label + ". " + node.evidence.satisfied.length + "/" + node.evidence.required.length + " criteria proven."));
        body.append(element("h3", "", "Work type"), element("p", "", node.type));
        body.append(element("h3", "", "Requirements"));
        const reqs = element("div", "code-list");
        node.requirement_ids.forEach((id) => reqs.append(element("code", "", id))); body.append(reqs);
        node.requirement_ids.map((id) => model.requirements.find((item) => item.id === id)).filter(Boolean).forEach((requirement) => body.append(element("p", "", requirement.statement)));
        body.append(element("h3", "", "Dependency boundary"));
        body.append(element("p", "", node.depends_on.length ? "Waits for " + node.depends_on.join(", ") : "No upstream dependency."));
        body.append(element("h3", "", "Validation contract"));
        (node.validation?.required ?? []).forEach((criterion) => {
          const passed = node.evidence.satisfied.includes(criterion);
          body.append(element("p", passed ? "truth-complete" : "", (passed ? "✓ " : "○ ") + criterion));
        });
        body.append(element("h3", "", "Evidence"));
        if (!node.evidence.items.length) body.append(element("p", "", "No evidence recorded. This work is not proven."));
        node.evidence.items.forEach((item) => {
          const card = element("div", "evidence-item");
          card.append(element("strong", "", (item.result ?? "pass").toUpperCase() + " · " + item.id), element("span", "", item.summary)); body.append(card);
        });
        const blockers = model.gaps.filter((gap) => !gap.resolution && (gap.blocks ?? []).some((id) => node.requirement_ids.includes(id)));
        body.append(element("h3", "", "Blockers and repairs"));
        if (node.status === "blocked") body.append(element("p", "truth-danger", "Node is explicitly blocked."));
        blockers.forEach((gap) => body.append(element("p", "truth-warning", gap.id + " · " + gap.question)));
        if (node.truth.key === "failed") body.append(element("p", "truth-danger", "Repair the implementation, then rerun the failed validation contract."));
        if (!blockers.length && node.status !== "blocked" && node.truth.key !== "failed") body.append(element("p", "", "No explicit blocker or repair recorded."));
      }

      function render() { renderDemands(); renderGraph(); renderInspector(); }
      document.getElementById("fit-view").addEventListener("click", fitView);
      document.getElementById("reset-view").addEventListener("click", resetView);
      document.getElementById("zoom-in").addEventListener("click", () => setZoom(zoom + .1));
      document.getElementById("zoom-out").addEventListener("click", () => setZoom(zoom - .1));
      const refreshIntervalSelect = document.getElementById("refresh-interval");
      refreshIntervalSelect.value = String(refreshInterval);
      refreshIntervalSelect.addEventListener("change", (event) => {
        refreshInterval = refreshController.setInterval(event.currentTarget.value);
        event.currentTarget.value = String(refreshInterval);
        saveState();
        renderRefreshStatus();
      });
      document.getElementById("refresh-now").addEventListener("click", () => refreshController.refreshNow());
      document.getElementById("theme-toggle").addEventListener("click", (event) => {
        const root = document.documentElement; const light = root.dataset.theme !== "light";
        root.dataset.theme = light ? "light" : "dark"; event.currentTarget.textContent = light ? "Dark theme" : "Light theme"; saveState();
      });
      if (saved.theme) document.documentElement.dataset.theme = saved.theme;
      renderRefreshStatus();
      let pan = null;
      viewport.addEventListener("pointerdown", (event) => { if (event.target.closest("button")) return; if (selectedNode) { applySelection({ type: "clear-node" }); renderGraph(); renderInspector(); syncHash(); saveState(); } pan = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }; viewport.classList.add("is-panning"); viewport.setPointerCapture(event.pointerId); });
      viewport.addEventListener("pointermove", (event) => { if (!pan) return; viewport.scrollLeft = pan.left - (event.clientX - pan.x); viewport.scrollTop = pan.top - (event.clientY - pan.y); });
      viewport.addEventListener("pointerup", () => { pan = null; viewport.classList.remove("is-panning"); saveState(); });
      viewport.addEventListener("wheel", (event) => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); setZoom(zoom + (event.deltaY < 0 ? .08 : -.08)); }, { passive: false });
      render();
      syncHash();
      requestAnimationFrame(() => { viewport.scrollLeft = Number(saved.left) || 0; viewport.scrollTop = Number(saved.top) || 0; });
      window.addEventListener("beforeunload", saveState);
      document.addEventListener("visibilitychange", () => refreshController.visibilityChanged());
      refreshController.start();
    })();
  </script>
</body>
</html>
`;
}

export function writeViewer(graphPath, graph) {
  const outputPath = defaultViewerPath(graphPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileAtomic(outputPath, renderViewerHtml(buildViewerModel(graph, { evidenceStatuses: getAllEvidenceStatuses(graphPath, graph) })));
  return outputPath;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function renderStaticDemands(model, selectedDemandId) {
  return model.demands.map((demand) => {
    const nodes = model.nodes.filter((node) => node.demand_id === demand.id);
    return `<button class="demand${demand.running ? " is-running" : ""}" type="button" data-demand-id="${escapeHtml(demand.id)}" data-running="${demand.running}" aria-selected="${demand.id === selectedDemandId}">
  <span class="demand-id">${escapeHtml(demand.id)}</span><span class="demand-title">${escapeHtml(demand.title)}</span>
  <span class="demand-meta"><span>${nodes.length} nodes</span><span${demand.running ? ' class="demand-running"' : ""}>${demand.running_count ? `${demand.running_count} running` : "quiet"}</span></span>
  ${demand.id === selectedDemandId ? '<span class="sr-only">Selected demand</span>' : ""}
</button>`;
  }).join("");
}

function renderGraphViews(model, selectedDemandId) {
  return model.demands.map((demand) => {
    const graph = renderStaticGraph(model, demand.id);
    return `<div class="graph-surface" data-demand-graph-view="${escapeHtml(demand.id)}" style="width:${graph.width}px;height:${graph.height}px"${demand.id === selectedDemandId ? "" : " hidden"}>
  <div class="graph-content" style="width:${graph.width}px;height:${graph.height}px">
    <svg class="edge-layer" width="${graph.width}" height="${graph.height}" aria-hidden="true">${graph.edges}</svg>
    <div class="node-layer" role="group" aria-label="${escapeHtml(demand.title)} work nodes">${graph.cards}</div>
  </div>
</div>`;
  }).join("\n");
}

function renderStaticGraph(model, demandId) {
  const demand = model.demands.find((item) => item.id === demandId);
  const nodes = model.nodes.filter((node) => node.demand_id === demandId);
  const layout = model.layouts[demandId] ?? { positions: {}, width: 0, height: 0 };
  const width = Math.max(layout.width, 760);
  const height = Math.max(layout.height, 520);
  const scopedIds = new Set(nodes.map((node) => node.id));
  const edges = [];

  for (const node of nodes) {
    for (const dependencyId of (node.depends_on ?? []).filter((id) => scopedIds.has(id))) {
      const from = layout.positions[dependencyId];
      const to = layout.positions[node.id];
      if (!from || !to) continue;
      const x1 = from.x + VIEWER_LAYOUT.nodeWidth;
      const y1 = from.y + VIEWER_LAYOUT.nodeHeight / 2;
      const x2 = to.x;
      const y2 = to.y + VIEWER_LAYOUT.nodeHeight / 2;
      const bend = Math.max(44, (x2 - x1) * 0.46);
      edges.push(`<path class="edge" data-from="${escapeHtml(dependencyId)}" data-to="${escapeHtml(node.id)}" d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}"></path>`);
    }
  }

  const cards = nodes.map((node) => {
    const position = layout.positions[node.id];
    const criteria = (node.validation?.required ?? []).slice(0, 2);
    const remainder = Math.max(0, (node.validation?.required?.length ?? 0) - 2);
    return `<button class="work-node${node.status === "in_progress" ? " is-active" : ""}" type="button" data-node-id="${escapeHtml(node.id)}" aria-selected="false" style="left:${position.x}px;top:${position.y}px">
  <span class="node-top"><span class="node-id">${escapeHtml(node.id)}</span><span class="status truth-${escapeHtml(node.truth.tone)}">${escapeHtml(node.truth.label)}</span></span>
  <span class="node-title">${escapeHtml(node.title)}</span>
  <ul class="criteria">${criteria.map((criterion) => `<li>${escapeHtml(criterion)}</li>`).join("")}${remainder ? `<li>+${remainder} more criteria</li>` : ""}</ul>
  <span class="node-foot"><span>${escapeHtml(node.type)}</span><span>${node.validation?.required?.length ?? 0} checks</span></span>
</button>`;
  }).join("");

  const minimap = nodes.map((node) => {
    const position = layout.positions[node.id];
    return `<rect x="${position.x}" y="${position.y}" width="${VIEWER_LAYOUT.nodeWidth}" height="${VIEWER_LAYOUT.nodeHeight}" rx="12"></rect>`;
  }).join("");

  return { demand, nodes, width, height, edges: edges.join(""), cards, minimap };
}
