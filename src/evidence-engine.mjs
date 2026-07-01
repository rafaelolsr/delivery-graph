import fs from "node:fs";
import path from "node:path";
import { assertValidGraph } from "./graph-engine.mjs";
import { resolveRuntimePath } from "./path-utils.mjs";

export function evidenceManifestPath(graphPath, node) {
  return path.join(resolveRuntimePath(graphPath, node.validation.evidence_path), "evidence.json");
}

export function readEvidenceManifest(graphPath, node) {
  const manifestPath = evidenceManifestPath(graphPath, node);
  if (!fs.existsSync(manifestPath)) {
    return {
      node_id: node.id,
      items: []
    };
  }

  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function writeEvidenceManifest(graphPath, node, manifest) {
  const manifestPath = evidenceManifestPath(graphPath, node);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeEvidenceSummary(graphPath, node, manifest);
}

export function addEvidence(graphPath, graph, nodeId, input) {
  assertValidGraph(graph);
  const node = findNode(graph, nodeId);
  const satisfies = requireText(input.satisfies, "satisfies");
  const summary = requireText(input.summary, "summary");
  const kind = input.kind ?? "manual";

  if (!node.validation.required.includes(satisfies)) {
    throw new Error(`${node.id} validation contract does not include: ${satisfies}`);
  }

  const manifest = readEvidenceManifest(graphPath, node);
  const evidenceId = input.id ?? nextEvidenceId(manifest.items);
  const artifact = input.artifact ? copyArtifact(graphPath, node, evidenceId, input.artifact) : null;
  const item = {
    id: evidenceId,
    kind,
    summary,
    satisfies,
    artifact,
    created_at: input.createdAt ?? new Date().toISOString()
  };

  const nextManifest = {
    node_id: node.id,
    items: [...manifest.items, item]
  };

  writeEvidenceManifest(graphPath, node, nextManifest);
  return { manifest: nextManifest, record: item };
}

export function getEvidenceStatus(graphPath, graph, node) {
  const manifest = readEvidenceManifest(graphPath, node);
  const satisfied = new Set(manifest.items.map((item) => item.satisfies));
  const missing = node.validation.required.filter((required) => !satisfied.has(required));

  return {
    node_id: node.id,
    evidence_path: node.validation.evidence_path,
    manifest_path: evidenceManifestPath(graphPath, node),
    required: node.validation.required,
    satisfied: [...satisfied].filter((item) => node.validation.required.includes(item)),
    missing,
    complete: missing.length === 0,
    items: manifest.items
  };
}

export function getAllEvidenceStatuses(graphPath, graph) {
  return graph.nodes.map((node) => getEvidenceStatus(graphPath, graph, node));
}

export function verifyNode(graphPath, graph, nodeId, options = {}) {
  assertValidGraph(graph);
  const node = findNode(graph, nodeId);
  const evidenceStatus = getEvidenceStatus(graphPath, graph, node);

  if (!evidenceStatus.complete) {
    throw new Error(`${node.id} is missing validation evidence: ${evidenceStatus.missing.join(", ")}`);
  }

  if (node.status === "blocked") {
    throw new Error(`${node.id} is blocked and cannot be verified`);
  }

  const nextGraph = {
    ...graph,
    graph: {
      ...graph.graph,
      updated_at: options.updatedAt ?? new Date().toISOString()
    },
    nodes: graph.nodes.map((candidate) =>
      candidate.id === node.id ? { ...candidate, status: "verified" } : candidate
    )
  };

  assertValidGraph(nextGraph);
  return { graph: nextGraph, evidenceStatus };
}

export function findNode(graph, nodeId) {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} not found`);
  }
  return node;
}

function nextEvidenceId(items) {
  const nextNumber = items.reduce((max, item) => {
    const match = String(item.id ?? "").match(/^EVD-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `EVD-${String(nextNumber).padStart(3, "0")}`;
}

function copyArtifact(graphPath, node, evidenceId, artifactPath) {
  const absoluteArtifactPath = path.resolve(artifactPath);
  if (!fs.existsSync(absoluteArtifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}`);
  }

  const artifactFileName = `${evidenceId}-${path.basename(artifactPath)}`;
  const evidenceDir = resolveRuntimePath(graphPath, node.validation.evidence_path);
  const artifactDir = path.join(evidenceDir, "artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.copyFileSync(absoluteArtifactPath, path.join(artifactDir, artifactFileName));
  return `artifacts/${artifactFileName}`;
}

function writeEvidenceSummary(graphPath, node, manifest) {
  const evidenceDir = resolveRuntimePath(graphPath, node.validation.evidence_path);
  const lines = [
    `# ${node.id} Evidence`,
    "",
    `Node: ${node.title}`,
    "",
    "## Items",
    ""
  ];

  if (manifest.items.length === 0) {
    lines.push("- none");
  } else {
    for (const item of manifest.items) {
      lines.push(`- ${item.id} [${item.kind}] satisfies \`${item.satisfies}\`: ${item.summary}`);
      if (item.artifact) lines.push(`  - Artifact: ${item.artifact}`);
    }
  }

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "summary.md"), `${lines.join("\n")}\n`);
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

