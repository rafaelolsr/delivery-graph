import fs from "node:fs";
import path from "node:path";
import { resolveRuntimePath } from "./path-utils.mjs";

export function writeRecordArtifact(graphPath, record) {
  if (record.id?.startsWith("DEM-")) {
    return writeDemandArtifact(graphPath, record);
  }
  if (record.id?.startsWith("REQ-")) {
    return writeRequirementArtifact(graphPath, record);
  }
  return null;
}

// Re-emit every demand and requirement markdown artifact from graph.json. Because
// this reuses writeRecordArtifact, a regenerated tree is byte-for-byte identical to
// what add-demand/add-requirement wrote — proving the folder tree is a derived
// projection of graph.json, not a second source of truth.
export function regenerateArtifacts(graphPath, graph) {
  const written = [];
  for (const demand of graph.demands ?? []) {
    written.push(writeRecordArtifact(graphPath, demand));
  }
  for (const requirement of graph.requirements ?? []) {
    written.push(writeRecordArtifact(graphPath, requirement));
  }
  return written.filter(Boolean);
}

function writeDemandArtifact(graphPath, demand) {
  const artifactPath = resolveRuntimePath(graphPath, `delivery-graph/demands/${demand.id}/${demand.id}.md`);
  const lines = [
    `# ${demand.id}: ${demand.title}`,
    "",
    `Source: ${demand.source}`,
    demand.requester ? `Requester: ${demand.requester}` : null,
    "",
    "## Problem",
    "",
    demand.problem ?? "_Not specified._",
    "",
    "## Outcome",
    "",
    demand.outcome,
    "",
    "## Constraints",
    "",
    ...(demand.constraints?.length ? demand.constraints.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Non-goals",
    "",
    ...(demand.non_goals?.length ? demand.non_goals.map((item) => `- ${item}`) : ["- none"])
  ].filter((line) => line !== null);

  writeMarkdown(artifactPath, lines);
  return artifactPath;
}

function writeRequirementArtifact(graphPath, requirement) {
  // Requirements are scoped under their owning demand as a flat list, so everything
  // a demand generates lives under demands/DEM-###/.
  const artifactPath = resolveRuntimePath(
    graphPath,
    `delivery-graph/demands/${requirement.demand_id}/requirements/${requirement.id}.md`
  );
  const lines = [
    `# ${requirement.id}`,
    "",
    `Demand: ${requirement.demand_id}`,
    `Priority: ${requirement.priority}`,
    "",
    "## Statement",
    "",
    requirement.statement,
    "",
    "## Acceptance",
    "",
    ...requirement.acceptance.map((item) => `- ${item}`),
    "",
    "## Validation",
    "",
    `Method: ${requirement.validation.method}`,
    "",
    "Required evidence:",
    "",
    ...requirement.validation.required_evidence.map((item) => `- ${item}`)
  ];

  writeMarkdown(artifactPath, lines);
  return artifactPath;
}

function writeMarkdown(artifactPath, lines) {
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${lines.join("\n")}\n`);
}

