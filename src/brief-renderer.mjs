import { nodeDemandId, summarizeGraph } from "./graph-engine.mjs";
import { buildDemandView } from "./show-renderer.mjs";

// The Graph Brief is gate #2's artifact: a didactic projection of graph.json a
// human approves before autonomous execution. It renders the dependency DAG as
// Mermaid plus a per-node change/validation summary and the ready-queue order,
// all derived from the canonical graph — never a separate, driftable log.
//
// Scope is one demand when demandId is given (the conductor's case), else the
// whole graph. Both reuse existing projections (buildDemandView, summarizeGraph)
// so this renderer owns only the DAG-and-table shaping, not graph reads.

function demandNodes(graph, demandId) {
  if (!demandId) return graph.nodes ?? [];
  return (graph.nodes ?? []).filter((node) => nodeDemandId(graph, node) === demandId);
}

function sanitizeMermaidLabel(text) {
  // Mermaid node labels are quoted; escape the quote and drop newlines so a
  // node title can't break the diagram.
  return String(text).replace(/"/g, "'").replace(/\s*[\r\n]+\s*/g, " ");
}

// Emit a Mermaid flowchart of the nodes and their depends_on edges. Only edges
// whose target is inside the rendered node set are drawn, so a demand-scoped
// brief stays self-contained.
export function renderMermaidDag(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  const lines = ["```mermaid", "flowchart TD"];
  for (const node of nodes) {
    lines.push(`    ${node.id}["${node.id} · ${sanitizeMermaidLabel(node.title)}"]`);
  }
  for (const node of nodes) {
    for (const dep of node.depends_on ?? []) {
      if (ids.has(dep)) lines.push(`    ${dep} --> ${node.id}`);
    }
  }
  lines.push("```");
  return lines.join("\n");
}

// Build the structured Graph Brief. Returns data the CLI can print as JSON or
// hand to renderGraphBrief for markdown.
export function buildGraphBrief(graphPath, graph, demandId) {
  const nodes = demandNodes(graph, demandId);
  const summary = summarizeGraph(graph);
  const readyIds = new Set(summary.readyNodes.map((n) => n.id));

  const nodeRows = nodes.map((node) => ({
    id: node.id,
    title: node.title,
    type: node.type,
    track: node.track,
    requirement_ids: node.requirement_ids ?? [],
    depends_on: (node.depends_on ?? []).filter((d) => nodes.some((n) => n.id === d)),
    status: node.status,
    ready: readyIds.has(node.id),
    validation: node.validation?.required ?? []
  }));

  // Ready-queue order = ready nodes in graph order (the head is what dge next
  // would return). Scoped to the rendered node set.
  const nodeIds = new Set(nodes.map((n) => n.id));
  const readyQueue = summary.readyNodes.filter((n) => nodeIds.has(n.id)).map((n) => n.id);

  // Blocker gaps must be scoped to the demand too (mirror buildDemandView), or a
  // demand-scoped Gate 2 would show and miscount blockers from unrelated demands.
  const scopedRequirementIds = demandId
    ? new Set((graph.requirements ?? []).filter((r) => r.demand_id === demandId).map((r) => r.id))
    : null;
  const blockerGaps = summary.blockerGaps
    .filter((gap) => !scopedRequirementIds || (gap.blocks ?? []).some((id) => scopedRequirementIds.has(id)))
    .map((gap) => ({ id: gap.id, question: gap.question }));

  return {
    scope: demandId ?? graph.graph?.id ?? "graph",
    demand: demandId
      ? (graph.demands ?? []).find((d) => d.id === demandId) ?? null
      : null,
    node_count: nodeRows.length,
    nodes: nodeRows,
    ready_queue: readyQueue,
    blocker_gaps: blockerGaps
  };
}

export function renderGraphBrief(brief) {
  const lines = [];
  const title = brief.demand ? `${brief.demand.id}  ${brief.demand.title}` : brief.scope;
  lines.push(`# Graph Brief — ${title}`);
  lines.push("");
  lines.push(`${brief.node_count} nodes · ${brief.ready_queue.length} ready · ${brief.blocker_gaps.length} blocker gaps`);
  lines.push("");

  lines.push("## Dependency graph");
  lines.push("");
  lines.push(renderMermaidDag(brief.nodes));
  lines.push("");

  lines.push("## Per-node change summary");
  lines.push("");
  lines.push("| Node | Type | Depends on | Serves | Validated by |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const node of brief.nodes) {
    const ready = node.ready ? " 🟢" : "";
    lines.push(
      `| ${node.id}${ready} | ${node.type} | ${node.depends_on.join(", ") || "—"} ` +
      `| ${node.requirement_ids.join(", ") || "—"} | ${node.validation.join("; ") || "—"} |`
    );
  }
  lines.push("");

  lines.push("## Ready-queue order");
  lines.push(brief.ready_queue.length ? brief.ready_queue.map((id, i) => `${i + 1}. ${id}`).join("\n") : "- none ready");

  if (brief.blocker_gaps.length) {
    lines.push("");
    lines.push("## Unresolved blocker gaps");
    for (const gap of brief.blocker_gaps) lines.push(`- ${gap.id}: ${gap.question}`);
  }

  return `${lines.join("\n")}\n`;
}

// Re-export the demand brief (gate #1) so `dge brief demand` has one home.
// It is exactly the demand view show already builds — reused verbatim.
export { buildDemandView, renderDemandView } from "./show-renderer.mjs";
