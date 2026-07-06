import fs from "node:fs";
import path from "node:path";
import { assertValidGraph, isNodeComplete, writeFileAtomic } from "./graph-engine.mjs";
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

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.node_id !== node.id) {
    throw new Error(`${node.id} evidence manifest belongs to ${manifest.node_id}`);
  }
  return manifest;
}

export function writeEvidenceManifest(graphPath, node, manifest) {
  const manifestPath = evidenceManifestPath(graphPath, node);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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

  const result = normalizeResult(input.result);

  const manifest = readEvidenceManifest(graphPath, node);
  const evidenceId = input.id ?? nextEvidenceId(manifest.items);
  const artifact = input.artifact ? copyArtifact(graphPath, node, evidenceId, input.artifact) : null;
  const item = {
    id: evidenceId,
    kind,
    summary,
    satisfies,
    result,
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

// Remove one evidence item by id so a mistaken/superseded record can be
// corrected through the CLI instead of hand-editing evidence.json. Artifact
// files are left in place (harmless; only the manifest gates completeness).
export function removeEvidence(graphPath, graph, nodeId, evidenceId) {
  assertValidGraph(graph);
  const node = findNode(graph, nodeId);
  const id = requireText(evidenceId, "evidence id");

  const manifest = readEvidenceManifest(graphPath, node);
  const removed = manifest.items.find((item) => item.id === id);
  if (!removed) {
    throw new Error(`${node.id} has no evidence item ${id}`);
  }

  const nextManifest = {
    node_id: node.id,
    items: manifest.items.filter((item) => item.id !== id)
  };

  writeEvidenceManifest(graphPath, node, nextManifest);
  return { manifest: nextManifest, record: removed };
}

// Manual evidence carries an explicit result. Missing/legacy result is treated
// as "pass" for backward compatibility. "fail" and "ambiguous" are both
// non-passing: "fail" is a known failure; "ambiguous" is a judgment call the
// agent could not self-certify (e.g. present-but-wrong content), so it must not
// silently satisfy a contract item — it forces a human decision instead.
function normalizeResult(result) {
  if (result === undefined || result === null) return "pass";
  const value = String(result).toLowerCase();
  if (value !== "pass" && value !== "fail" && value !== "ambiguous") {
    throw new Error(`evidence result must be "pass", "fail", or "ambiguous", got: ${result}`);
  }
  return value;
}

// An evidence item counts toward completeness only when it is a clean pass.
// Legacy items (no result field) and command evidence (recorded only on success)
// count as passing; "fail" and "ambiguous" do not, so a node cannot reach done
// on the strength of a failure note or an unresolved judgment call.
function isPassing(item) {
  return item.result !== "fail" && item.result !== "ambiguous";
}

export function addCommandEvidence(graphPath, graph, nodeId, input) {
  assertValidGraph(graph);
  const node = findNode(graph, nodeId);
  const satisfies = requireText(input.satisfies, "satisfies");
  const command = requireCommand(input.command);
  const exitCode = Number(input.exitCode);
  const kind = input.kind ?? "command";

  if (exitCode !== 0) {
    throw new Error(`${node.id} command evidence failed with exit code ${exitCode}`);
  }

  if (!node.validation.required.includes(satisfies)) {
    throw new Error(`${node.id} validation contract does not include: ${satisfies}`);
  }

  const manifest = readEvidenceManifest(graphPath, node);
  const evidenceId = input.id ?? nextEvidenceId(manifest.items);
  const copiedArtifacts = copyEvidenceArtifacts(graphPath, node, evidenceId, kind, splitList(input.artifacts), {
    requireAll: true
  });
  const artifact = writeCommandArtifact(graphPath, node, evidenceId, {
    kind,
    command,
    exitCode,
    stdout: input.stdout ?? "",
    stderr: input.stderr ?? "",
    createdAt: input.createdAt ?? new Date().toISOString(),
    metadata: input.metadata,
    artifacts: copiedArtifacts
  });
  const item = {
    id: evidenceId,
    kind,
    summary: input.summary ?? `${command.join(" ")} passed`,
    satisfies,
    artifact,
    command,
    exit_code: exitCode,
    created_at: input.createdAt ?? new Date().toISOString()
  };
  if (copiedArtifacts.length > 0) item.artifacts = copiedArtifacts;
  if (input.metadata) item.metadata = input.metadata;

  const nextManifest = {
    node_id: node.id,
    items: [...manifest.items, item]
  };

  writeEvidenceManifest(graphPath, node, nextManifest);
  return { manifest: nextManifest, record: item };
}

export function writeCommandAttemptArtifact(graphPath, graph, nodeId, input) {
  assertValidGraph(graph);
  const node = findNode(graph, nodeId);
  const satisfies = requireText(input.satisfies, "satisfies");
  const command = requireCommand(input.command);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const kind = input.kind ?? "command";

  if (!node.validation.required.includes(satisfies)) {
    throw new Error(`${node.id} validation contract does not include: ${satisfies}`);
  }

  const evidenceDir = resolveRuntimePath(graphPath, node.validation.evidence_path);
  const artifactDir = path.join(evidenceDir, "artifacts");
  const artifactFileName = `ATTEMPT-${safeFilePart(createdAt)}-${safeFilePart(kind)}.json`;
  const artifactPath = path.join(artifactDir, artifactFileName);
  const copiedArtifacts = copyEvidenceArtifacts(graphPath, node, `ATTEMPT-${safeFilePart(createdAt)}`, kind, splitList(input.artifacts), {
    requireAll: false
  });
  const artifact = {
    kind,
    command,
    satisfies,
    exit_code: input.exitCode,
    stdout: input.stdout ?? "",
    stderr: input.stderr ?? "",
    created_at: createdAt,
    artifacts: copiedArtifacts
  };
  if (input.metadata) artifact.metadata = input.metadata;

  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  return { artifact: `artifacts/${artifactFileName}`, artifactPath };
}

export function getEvidenceStatus(graphPath, graph, node) {
  const manifest = readEvidenceManifest(graphPath, node);

  // A contract key is satisfied only when it has a passing item AND no UNRESOLVED
  // ambiguous item. Evidence is append-only, so after adjudication the corrected
  // pass is added alongside the ambiguous record — but the ambiguity must be
  // explicitly cleared (dge evidence remove) before the key counts as satisfied.
  // Otherwise an unresolved judgment call would slip through the moment any pass
  // exists for the same key, silently reaching done on an open question.
  const ambiguousKeys = new Set(
    manifest.items.filter((item) => item.result === "ambiguous").map((item) => item.satisfies)
  );
  const passedKeys = new Set(manifest.items.filter(isPassing).map((item) => item.satisfies));
  const satisfied = new Set([...passedKeys].filter((key) => !ambiguousKeys.has(key)));
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

  // Verification is only meaningful for a node that is actually being worked.
  // Reject terminal/not-started states so a node cannot jump straight from
  // `proposed` (never implemented) to `verified` -> `done`, bypassing the
  // work/review states the lifecycle guarantees. `blocked` needs a human
  // decision before it can move at all.
  const VERIFIABLE_STATUSES = new Set(["ready", "in_progress", "review"]);
  if (!VERIFIABLE_STATUSES.has(node.status)) {
    throw new Error(
      `${node.id} cannot be verified from status "${node.status}"; it must be ready, in_progress, or review`
    );
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
  const verificationPath = writeVerificationReport(graphPath, node, evidenceStatus, {
    verifiedAt: options.updatedAt ?? nextGraph.graph.updated_at
  });
  return { graph: nextGraph, evidenceStatus, verificationPath };
}

// waiveNode is the escape hatch for un-provable work: it mints the terminal
// `done-waived` status WITHOUT evidence, but only through four hard guardrails so
// the waiver can never become a way to dodge the real evidence gate. Every rule
// lives here in the engine (not a skill) so a raw CLI call is governed identically.
export function waiveNode(graphPath, graph, nodeId, options = {}) {
  assertValidGraph(graph);
  const node = findNode(graph, nodeId);

  // 1. Reason is mandatory — a blank waiver is an unsigned exception. requireText
  //    throws on empty/whitespace.
  const reason = requireText(options.reason, "waiver reason");

  // 2. A waiver is a proof-free `review -> done-waived` move only. Any other
  //    source status (including `blocked`, which needs a human decision, and
  //    `verified`, which should go to real `done`) is rejected.
  if (node.status !== "review") {
    throw new Error(
      `${node.id} cannot be waived from status "${node.status}"; a waiver applies only to a node in review`
    );
  }

  // 3. Ordering still holds — the waiver skips proof, not the dependency line.
  const incompleteDependencies = (node.depends_on ?? []).filter(
    (dependencyId) => !isNodeComplete(graph.nodes.find((candidate) => candidate.id === dependencyId))
  );
  if (incompleteDependencies.length > 0) {
    throw new Error(
      `${node.id} cannot be waived; incomplete dependencies: ${incompleteDependencies.join(", ")}`
    );
  }

  // 4. A waiver is ONLY for "nothing to prove." If any evidence exists (pass, fail,
  //    or ambiguous), the node is not un-provable — it must go through `dge verify`,
  //    not around it. This is the rule that keeps done-waived honest.
  const manifest = readEvidenceManifest(graphPath, node);
  if ((manifest.items ?? []).length > 0) {
    throw new Error(
      `${node.id} has evidence recorded; waivers are only for nodes with no evidence — run \`dge verify ${node.id}\` and \`dge done ${node.id}\` instead`
    );
  }

  const waivedAt = options.updatedAt ?? new Date().toISOString();
  const nextGraph = {
    ...graph,
    graph: {
      ...graph.graph,
      updated_at: waivedAt
    },
    nodes: graph.nodes.map((candidate) =>
      candidate.id === node.id
        ? { ...candidate, status: "done-waived", waiver: { reason, waived_at: waivedAt } }
        : candidate
    )
  };

  assertValidGraph(nextGraph);
  return { graph: nextGraph, reason };
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

function writeCommandArtifact(graphPath, node, evidenceId, result) {
  const evidenceDir = resolveRuntimePath(graphPath, node.validation.evidence_path);
  const artifactDir = path.join(evidenceDir, "artifacts");
  const artifactFileName = `${evidenceId}-${safeFilePart(result.kind ?? "command")}.json`;
  const artifact = {
    kind: result.kind ?? "command",
    command: result.command,
    exit_code: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    created_at: result.createdAt,
    artifacts: result.artifacts ?? []
  };
  if (result.metadata) artifact.metadata = result.metadata;

  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, artifactFileName), `${JSON.stringify(artifact, null, 2)}\n`);
  return `artifacts/${artifactFileName}`;
}

function copyEvidenceArtifacts(graphPath, node, evidenceId, kind, artifactPaths, options = {}) {
  if (artifactPaths.length === 0) return [];

  const evidenceDir = resolveRuntimePath(graphPath, node.validation.evidence_path);
  const artifactDir = path.join(evidenceDir, "artifacts");
  const collectionDirName = `${safeFilePart(evidenceId)}-${safeFilePart(kind)}-artifacts`;
  const collectionDir = path.join(artifactDir, collectionDirName);
  const copied = [];

  for (const artifactPath of artifactPaths) {
    const absoluteArtifactPath = path.resolve(artifactPath);
    if (!fs.existsSync(absoluteArtifactPath)) {
      if (options.requireAll) {
        throw new Error(`Artifact not found: ${artifactPath}`);
      }
      continue;
    }

    const destination = path.join(collectionDir, path.basename(absoluteArtifactPath));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(absoluteArtifactPath, destination, { recursive: true });
    copied.push(path.relative(evidenceDir, destination));
  }

  return copied;
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

function writeVerificationReport(graphPath, node, evidenceStatus, options = {}) {
  const evidenceDir = resolveRuntimePath(graphPath, node.validation.evidence_path);
  const reportPath = path.join(evidenceDir, "verification.md");
  const lines = [
    `# ${node.id} Verification`,
    "",
    `Node: ${node.title}`,
    `Verified: ${options.verifiedAt}`,
    "",
    "## Required evidence",
    ""
  ];

  for (const required of evidenceStatus.required) {
    const matchingItems = evidenceStatus.items.filter((item) => item.satisfies === required);
    lines.push(`- ${required}: ${matchingItems.length > 0 ? "satisfied" : "missing"}`);
    for (const item of matchingItems) {
      lines.push(`  - ${item.id} [${item.kind}]: ${item.summary}`);
      if (item.artifact) lines.push(`    - Artifact: ${item.artifact}`);
    }
  }

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
  return reportPath;
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function requireCommand(command) {
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== "string" || part === "")) {
    throw new Error("command is required");
  }
  return command;
}

function safeFilePart(value) {
  return String(value).replace(/[^A-Za-z0-9-]/g, "-");
}

function splitList(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(splitList).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
