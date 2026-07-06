import fs from "node:fs";
import path from "node:path";
import { getAllEvidenceStatuses } from "./evidence-engine.mjs";
import { getReadyNodes, validateGraph } from "./graph-engine.mjs";
import { resolveRuntimePath } from "./path-utils.mjs";
import { renderNextSteps } from "./output.mjs";

export function reviewGraph(graphPath, graph, options = {}) {
  const findings = [];
  const validationErrors = validateGraph(graph, { requireResolvedBlockers: false });

  for (const error of validationErrors) {
    findings.push({
      severity: "blocker",
      category: "graph-validation",
      message: error
    });
  }

  for (const gap of graph.gaps ?? []) {
    if (gap.severity === "blocker" && !gap.resolution) {
      findings.push({
        severity: "blocker",
        category: "gap",
        message: `${gap.id}: ${gap.question}`
      });
    }
  }

  const nodesByRequirement = new Map();
  for (const node of graph.nodes) {
    for (const requirementId of node.requirement_ids) {
      if (!nodesByRequirement.has(requirementId)) nodesByRequirement.set(requirementId, []);
      nodesByRequirement.get(requirementId).push(node.id);
    }
  }

  for (const requirement of graph.requirements) {
    if (!nodesByRequirement.has(requirement.id)) {
      findings.push({
        severity: "major",
        category: "coverage",
        message: `${requirement.id} has no delivery nodes`
      });
    }
  }

  for (const status of getAllEvidenceStatuses(graphPath, graph)) {
    const node = graph.nodes.find((candidate) => candidate.id === status.node_id);
    if (["review", "verified", "done"].includes(node.status) && !status.complete) {
      findings.push({
        severity: "blocker",
        category: "evidence",
        message: `${node.id} missing evidence: ${status.missing.join(", ")}`
      });
    }
  }

  const report = {
    graph_id: graph.graph.id,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    ready_nodes: getReadyNodes(graph).map((node) => node.id),
    findings
  };

  return {
    report,
    markdown: renderReviewMarkdown(graph, report, options)
  };
}

export function defaultReviewPath(graphPath, generatedAt = new Date()) {
  const safeTimestamp = generatedAt.toISOString().replace(/[:.]/g, "-");
  return resolveRuntimePath(graphPath, `delivery-graph/reports/review-${safeTimestamp}.md`);
}

export function writeReviewReport(reportPath, markdown) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, markdown);
}

function renderReviewMarkdown(graph, report, options = {}) {
  const blockers = report.findings.filter((finding) => finding.severity === "blocker").length;
  // Bold TL;DR lead: the one-line verdict, so a reader knows pass/attention before
  // scanning the findings list.
  const lead = report.findings.length === 0
    ? "**Clean — no findings.**"
    : blockers > 0
      ? `**${blockers} blocker finding(s) — must resolve before done.**`
      : `**${report.findings.length} finding(s) to review — none blocking.**`;

  const lines = [
    `# DGE Review: ${graph.graph.id}`,
    "",
    lead,
    "",
    `Generated: ${report.generated_at}`,
    "",
    "## Summary",
    "",
    `- Findings: ${report.findings.length}`,
    `- Ready nodes: ${report.ready_nodes.length === 0 ? "none" : report.ready_nodes.join(", ")}`,
    "",
    "## Findings",
    ""
  ];

  if (report.findings.length === 0) {
    lines.push("- none");
  } else {
    for (const finding of report.findings) {
      lines.push(`- **${finding.severity}** [${finding.category}] ${finding.message}`);
    }
  }

  // Always end with the shared Next block.
  const nextItems = blockers > 0
    ? ["Resolve the blocker findings above, then re-run dge done"]
    : report.findings.length > 0
      ? ["Review the non-blocking findings, then proceed"]
      : ["Nothing to address — proceed"];
  lines.push("");
  lines.push(renderNextSteps(nextItems, options));

  return `${lines.join("\n")}\n`;
}

