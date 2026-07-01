import { NODE_STATUSES, summarizeGraph } from "./graph-engine.mjs";

export function renderStatus(graph) {
  const summary = summarizeGraph(graph);
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
