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

function writeDemandArtifact(graphPath, demand) {
  const artifactPath = resolveRuntimePath(graphPath, `delivery-graph/demands/${demand.id}.md`);
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
  const artifactPath = resolveRuntimePath(graphPath, `delivery-graph/requirements/${requirement.id}.md`);
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

