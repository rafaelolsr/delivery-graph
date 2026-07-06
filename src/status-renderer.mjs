import fs from "node:fs";
import path from "node:path";
import { NODE_STATUSES, summarizeGraph } from "./graph-engine.mjs";
import { resolveRuntimePath } from "./path-utils.mjs";
import { renderNextSteps } from "./output.mjs";

export function renderStatus(graph, options = {}) {
  const summary = summarizeGraph(graph);
  const evidenceStatuses = options.evidenceStatuses ?? [];
  const lines = [];

  lines.push(`# ${summary.graph.id}: ${summary.graph.title}`);

  // Bold headline so the board leads with the state, not the grid. Pure counts
  // over the status map — done/total, ready, blocked.
  const total = (graph.nodes ?? []).length;
  const doneCount = (summary.statuses.get("done") ?? []).length;
  const readyCount = summary.readyNodes.length;
  const blockedCount = (summary.statuses.get("blocked") ?? []).length;
  lines.push("");
  lines.push(`**${doneCount}/${total} done · ${readyCount} ready · ${blockedCount} blocked**`);

  if (options.generatedAt) {
    lines.push("");
    lines.push(`Generated: ${options.generatedAt}`);
  }
  lines.push("");
  lines.push("| Status | Count | Nodes |");
  lines.push("| --- | ---: | --- |");

  for (const status of NODE_STATUSES) {
    const nodes = summary.statuses.get(status) ?? [];
    const names = nodes.map((node) => `${node.id} ${node.title}`).join("<br>");
    lines.push(`| ${status} | ${nodes.length} | ${names || "-"} |`);
  }

  lines.push("");
  lines.push("## Ready nodes");
  if (summary.readyNodes.length === 0) {
    lines.push("- none");
  } else {
    for (const node of summary.readyNodes) {
      lines.push(`- ${node.id}: ${node.title}`);
    }
  }

  lines.push("");
  lines.push("## Missing validation evidence");
  const missingEvidence = evidenceStatuses.filter((status) => !status.complete);
  if (missingEvidence.length === 0) {
    lines.push("- none");
  } else {
    for (const status of missingEvidence) {
      lines.push(`- ${status.node_id}: ${status.missing.join(", ")}`);
    }
  }

  lines.push("");
  lines.push("## Unresolved blocker gaps");
  if (summary.blockerGaps.length === 0) {
    lines.push("- none");
  } else {
    for (const gap of summary.blockerGaps) {
      lines.push(`- ${gap.id}: ${gap.question}`);
    }
  }

  // Always end with the shared Next block. Priority: unblock gaps, else start the
  // ready-queue head, else (nothing ready) note whether the graph is fully done.
  const head = summary.readyNodes[0];
  let nextItems;
  if (summary.blockerGaps.length > 0) {
    nextItems = [`Resolve ${summary.blockerGaps.map((gap) => gap.id).join(", ")}`];
  } else if (head) {
    nextItems = [`Work ${head.id}: ${head.title}`];
  } else if (doneCount === total && total > 0) {
    nextItems = ["All nodes done — run /dge-review"];
  } else {
    nextItems = ["Nothing ready — resolve upstream nodes to unblock the queue"];
  }
  lines.push("");
  lines.push(renderNextSteps(nextItems, options));

  return `${lines.join("\n")}\n`;
}

export function defaultStatusPath(graphPath, generatedAt = new Date()) {
  const safeTimestamp = generatedAt.toISOString().replace(/[:.]/g, "-");
  return resolveRuntimePath(graphPath, `delivery-graph/reports/status-${safeTimestamp}.md`);
}

export function writeStatusReport(reportPath, markdown) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, markdown);
}
