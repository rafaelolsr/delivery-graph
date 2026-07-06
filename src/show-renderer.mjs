import { nodeDemandId } from "./graph-engine.mjs";
import { readEvidenceManifest } from "./evidence-engine.mjs";
import { demandLead, glyph, renderNextSteps } from "./output.mjs";

// Build the structured view of everything a demand generated: the demand, its
// requirements, and the nodes that serve those requirements (with status and
// whether any evidence has been recorded). graph.json is the single source of
// truth; this is a derived projection scoped to one demand.
export function buildDemandView(graphPath, graph, demandId) {
  const demand = (graph.demands ?? []).find((d) => d.id === demandId);
  if (!demand) {
    throw new Error(`${demandId} not found`);
  }

  const requirements = (graph.requirements ?? []).filter((r) => r.demand_id === demandId);
  const requirementIds = new Set(requirements.map((r) => r.id));

  const nodes = (graph.nodes ?? [])
    .filter((node) => nodeDemandId(graph, node) === demandId)
    .map((node) => ({
      id: node.id,
      title: node.title,
      status: node.status,
      requirement_ids: node.requirement_ids ?? [],
      has_evidence: nodeHasEvidence(graphPath, node),
      waiver: node.waiver ?? null
    }));

  // Unresolved blocker gaps that block one of this demand's requirements. Gate 1
  // (the Demand Brief) must show these so an edit that reintroduces a blocker is
  // visible and blocks approval, rather than sliding silently into planning.
  const blockerGaps = (graph.gaps ?? [])
    .filter((gap) => gap.severity === "blocker" && !gap.resolution)
    .filter((gap) => (gap.blocks ?? []).some((id) => requirementIds.has(id)))
    .map((gap) => ({ id: gap.id, question: gap.question, blocks: gap.blocks ?? [] }));

  return {
    // Gate 1 (the Demand Brief) is the human's approve/reject artifact, so it must
    // carry the problem, outcome, and non-goals — not just the title/outcome.
    demand: {
      id: demand.id,
      title: demand.title,
      summary: demand.summary ?? null,
      problem: demand.problem ?? null,
      outcome: demand.outcome,
      non_goals: demand.non_goals ?? []
    },
    requirements: requirements.map((r) => ({ id: r.id, statement: r.statement, priority: r.priority })),
    nodes,
    blocker_gaps: blockerGaps,
    // Any node whose requirement is not one of this demand's is a data error; surface it.
    orphan_requirement_ids: nodes
      .flatMap((n) => n.requirement_ids)
      .filter((id) => !requirementIds.has(id))
  };
}

function nodeHasEvidence(graphPath, node) {
  try {
    return (readEvidenceManifest(graphPath, node).items ?? []).length > 0;
  } catch {
    return false;
  }
}

// Emoji-forward, scannable rendering (DEM-002 convention). ASCII fallback via options.
export function renderDemandView(view, options = {}) {
  const g = (name) => glyph(name, options);
  const lines = [];
  lines.push(`${view.demand.id}  ${view.demand.title}`);
  // Bold TL;DR lead: the captured summary, else the first sentence of outcome, so
  // the reader gets the point before the supporting problem/outcome detail.
  const lead = demandLead(view.demand);
  if (lead) {
    lines.push("");
    lines.push(lead);
  }
  lines.push("");
  if (view.demand.problem) {
    lines.push(`${g("blocked")} problem: ${view.demand.problem}`);
  }
  lines.push(`${g("reports")} outcome: ${view.demand.outcome}`);
  const nonGoals = view.demand.non_goals ?? [];
  if (nonGoals.length > 0) {
    lines.push(`${g("fail")} non-goals:`);
    for (const goal of nonGoals) lines.push(`  - ${goal}`);
  }
  lines.push("");

  lines.push(`${g("requirements")} requirements (${view.requirements.length})`);
  for (const req of view.requirements) {
    lines.push(`  ${req.id} [${req.priority}] ${req.statement}`);
  }
  lines.push("");

  lines.push(`${g("progress")} nodes (${view.nodes.length})`);
  for (const node of view.nodes) {
    const statusGlyph = node.status === "done" ? g("done") : `[${node.status}]`;
    const evidence = node.has_evidence ? g("pass") : g("fail");
    lines.push(`  ${statusGlyph} ${node.id} ${node.title}`);
    lines.push(`      serves ${node.requirement_ids.join(", ")} · evidence ${evidence}`);
  }

  const blockerGaps = view.blocker_gaps ?? [];
  if (blockerGaps.length > 0) {
    lines.push("");
    lines.push(`${g("blocked")} unresolved blocker gaps (${blockerGaps.length}) — must resolve before approval:`);
    for (const gap of blockerGaps) {
      lines.push(`  ${gap.id} blocks ${gap.blocks.join(", ")}: ${gap.question}`);
    }
  }

  if (view.orphan_requirement_ids.length > 0) {
    lines.push("");
    lines.push(`${g("blocked")} nodes reference requirements outside this demand: ${view.orphan_requirement_ids.join(", ")}`);
  }

  // Always end with the shared Next block. Blocker gaps must be resolved before
  // this gate can be approved, so they take precedence as the next action.
  const nextItems = blockerGaps.length > 0
    ? [`Resolve ${blockerGaps.map((gap) => gap.id).join(", ")} before approval`]
    : ["Approve to plan the graph", "or tell me what to change (e.g. drop or reprioritize a requirement)"];
  lines.push("");
  lines.push(renderNextSteps(nextItems, options));

  return lines.join("\n");
}
