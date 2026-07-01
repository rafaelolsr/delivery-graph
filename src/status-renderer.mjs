import { NODE_STATUSES, summarizeGraph } from "./graph-engine.mjs";

export function renderStatus(graph, options = {}) {
  const summary = summarizeGraph(graph);
  const evidenceStatuses = options.evidenceStatuses ?? [];
  const lines = [];

  lines.push(`# ${summary.graph.id}: ${summary.graph.title}`);
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

  return `${lines.join("\n")}\n`;
}
