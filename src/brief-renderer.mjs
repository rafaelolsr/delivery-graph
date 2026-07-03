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

// Render each node as an indented dependency tree with its approval facts (type,
// the requirements it serves, and how it's validated) inline. This is the default
// Gate 2 body because it renders in every surface — terminal, CLI, harness chat —
// while a Mermaid fence only renders where a Mermaid engine exists. The tree's
// indentation carries dependency shape for the common tree/fan-out case; the
// `--mermaid` opt-in (renderMermaidDag) is for large multi-edge graphs in a
// rendering surface where a picture beats indentation.
function renderDependencyTree(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inSetDeps = (node) => node.depends_on.filter((d) => byId.has(d));
  const childrenOf = new Map(nodes.map((n) => [n.id, []]));
  const roots = [];
  for (const node of nodes) {
    // Attach each node under the first of its in-set dependencies; a node with no
    // in-set dependency is a root. Extra parents are noted inline as "also needs".
    const parents = inSetDeps(node);
    if (parents.length === 0) roots.push(node);
    else childrenOf.get(parents[0]).push(node.id);
  }

  const lines = [];
  const emit = (node, prefix, isLast, isRoot) => {
    const branch = isRoot ? "" : isLast ? "└─ " : "├─ ";
    const ready = node.ready ? " 🟢" : "";
    const extraDeps = inSetDeps(node).slice(1);
    const also = extraDeps.length ? ` (also needs ${extraDeps.join(", ")})` : "";
    lines.push(`${prefix}${branch}${node.id}${ready}  ${node.title}  [${node.type}]${also}`);

    const detailPrefix = prefix + (isRoot ? "" : isLast ? "   " : "│  ");
    lines.push(`${detailPrefix}   serves ${node.requirement_ids.join(", ") || "—"}`);
    lines.push(`${detailPrefix}   proven by: ${node.validation.join("; ") || "—"}`);

    const kids = childrenOf.get(node.id);
    kids.forEach((childId, i) => emit(byId.get(childId), detailPrefix, i === kids.length - 1, false));
  };
  roots.forEach((root, i) => emit(root, "", i === roots.length - 1, true));
  return lines.join("\n");
}

export function renderGraphBrief(brief, options = {}) {
  const lines = [];
  const title = brief.demand ? `${brief.demand.id}  ${brief.demand.title}` : brief.scope;
  lines.push(`# Graph Brief — ${title}`);
  lines.push("");
  lines.push(`${brief.node_count} nodes · ${brief.ready_queue.length} ready · ${brief.blocker_gaps.length} blocker gaps`);
  lines.push("");

  lines.push("## Plan");
  lines.push("");
  lines.push(renderDependencyTree(brief.nodes));
  lines.push("");

  // Mermaid is opt-in: only useful in a rendering surface and only worth the
  // ceremony for graphs whose shape the tree can't show at a glance.
  if (options.mermaid) {
    lines.push("## Dependency graph (Mermaid)");
    lines.push("");
    lines.push(renderMermaidDag(brief.nodes));
    lines.push("");
  }

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
