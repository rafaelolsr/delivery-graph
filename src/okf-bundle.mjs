// OKF v0.2 bundle generator (DEM-021 / REQ-091, NODE-087).
//
// Projects a DGE graph.json into an OKF v0.2 knowledge bundle. This is a PURE,
// one-way projection: graphToBundle(graph) returns an in-memory map of
// { relativePath -> fileContent }; it never reads or writes graph.json. Per ADR-001,
// graph.json is the sole canonical writer and the bundle is a derived projection.
//
// Concept mapping (see docs/architecture/dge-okf-mapping.md):
//   demand      -> concept  type: Intent
//   requirement -> concept  type: Requirement
//   node        -> concept  type: Task
//   node.validation -> concept  type: Attested Computation (executor.receipt + attester)
//   depends_on  -> markdown links in the Task body (SPEC §6.1)
//   bundle root -> index.md carrying okf_version (SPEC §8, §12)
//
// DGE-only attributes live under the versioned x-dge extension key so native OKF
// fields are never overloaded (ADR-001 D3).

import fs from "node:fs";
import path from "node:path";
import { resolveRuntimePath } from "./path-utils.mjs";
import {
  makeConcept,
  serializeConcept,
  OKF_VERSION
} from "./okf-concept.mjs";

// Bundle-relative concept ids (SPEC §2: id = path minus `.md`).
const INTENTS_DIR = "intents";
const REQUIREMENTS_DIR = "requirements";
const TASKS_DIR = "tasks";
const COMPUTATIONS_DIR = "computations";

function intentPath(id) {
  return `${INTENTS_DIR}/${id}.md`;
}
function requirementPath(id) {
  return `${REQUIREMENTS_DIR}/${id}.md`;
}
function taskPath(id) {
  return `${TASKS_DIR}/${id}.md`;
}
function computationPath(nodeId) {
  return `${COMPUTATIONS_DIR}/${nodeId}-contract.md`;
}

// A DGE node status is complete when done or done-waived (mirrors graph-engine).
function isComplete(status) {
  return status === "done" || status === "done-waived";
}

// Map a DGE node status onto an OKF lifecycle `status` (SPEC §5.4). Only three
// native values exist (draft|stable|deprecated); the precise DGE status is kept
// under x-dge, so this is a coarse, non-lossy native hint, not the source of truth.
function nativeLifecycle(nodeStatus) {
  if (isComplete(nodeStatus)) return "stable";
  return "draft";
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

// graphToBundle(graph) -> { "relative/path.md": "content", ... }
// Deterministic: iteration order follows graph arrays, and okf-concept serialization
// is insertion-order stable, so the same graph always yields byte-identical output.
export function graphToBundle(graph) {
  const files = {};
  const demands = graph.demands ?? [];
  const requirements = graph.requirements ?? [];
  const nodes = graph.nodes ?? [];

  for (const demand of demands) {
    files[intentPath(demand.id)] = serializeConcept(demandToIntent(demand));
  }
  for (const requirement of requirements) {
    files[requirementPath(requirement.id)] = serializeConcept(
      requirementToConcept(requirement)
    );
  }
  for (const node of nodes) {
    files[taskPath(node.id)] = serializeConcept(nodeToTask(node));
    // Every executable node's validation contract becomes an Attested Computation.
    if (node.validation?.required?.length) {
      files[computationPath(node.id)] = serializeConcept(nodeToComputation(node));
    }
  }

  files["index.md"] = renderRootIndex(graph, { demands, requirements, nodes });
  return files;
}

function demandToIntent(demand) {
  const bodyLines = [];
  if (demand.outcome) bodyLines.push("# Outcome", "", demand.outcome, "");
  if (demand.constraints?.length) {
    bodyLines.push("# Constraints", "", ...demand.constraints.map((c) => `- ${c}`), "");
  }
  if (demand.non_goals?.length) {
    bodyLines.push("# Non-goals", "", ...demand.non_goals.map((g) => `- ${g}`), "");
  }
  return makeConcept({
    type: "Intent",
    title: demand.title,
    description: demand.summary ?? undefined,
    body: bodyLines.join("\n").trim(),
    ext: {
      kind: "Demand",
      id: demand.id,
      source: demand.source ?? undefined
    }
  });
}

function requirementToConcept(requirement) {
  const bodyLines = ["# Statement", "", requirement.statement ?? "", ""];
  if (requirement.acceptance?.length) {
    bodyLines.push("# Acceptance", "", ...requirement.acceptance.map((a) => `- ${a}`), "");
  }
  // Link back to the owning demand's Intent concept (SPEC §6.1 bundle-relative link).
  if (requirement.demand_id) {
    bodyLines.push(
      "# Intent",
      "",
      `Serves [${requirement.demand_id}](/${intentPath(requirement.demand_id)}).`,
      ""
    );
  }
  return makeConcept({
    type: "Requirement",
    title: requirement.id,
    description: requirement.statement ?? undefined,
    body: bodyLines.join("\n").trim(),
    ext: {
      kind: "Requirement",
      id: requirement.id,
      demand_id: requirement.demand_id ?? undefined,
      priority: requirement.priority ?? undefined
    }
  });
}

function nodeToTask(node) {
  const bodyLines = [];
  // Dependencies as bundle-relative links (SPEC §6.1). Kind ("depends-on") is
  // conveyed by the surrounding heading, per §6.1's untyped-edge model.
  if (node.depends_on?.length) {
    bodyLines.push("# Depends on", "");
    for (const dep of node.depends_on) {
      bodyLines.push(`- [${dep}](/${taskPath(dep)})`);
    }
    bodyLines.push("");
  }
  // Requirements served, as links.
  if (node.requirement_ids?.length) {
    bodyLines.push("# Serves", "");
    for (const req of node.requirement_ids) {
      bodyLines.push(`- [${req}](/${requirementPath(req)})`);
    }
    bodyLines.push("");
  }
  // Link to this task's validation contract (Attested Computation), when present.
  if (node.validation?.required?.length) {
    bodyLines.push(
      "# Validation",
      "",
      `Gated by [its validation contract](/${computationPath(node.id)}).`,
      ""
    );
  }
  return makeConcept({
    type: "Task",
    title: node.title,
    status: nativeLifecycle(node.status),
    body: bodyLines.join("\n").trim(),
    ext: {
      kind: "Task",
      id: node.id,
      node_type: node.type ?? undefined,
      track: node.track ?? undefined,
      status: node.status,
      requirement_ids: node.requirement_ids ?? [],
      depends_on: node.depends_on ?? []
    }
  });
}

// A node's validation contract -> Attested Computation (SPEC §10.2). The DGE
// validation command is the sanctioned computation; `executor.receipt` declares the
// evidence a run must return; `attester` names the independent, deterministic check.
function nodeToComputation(node) {
  const bodyLines = ["# Computation", ""];
  bodyLines.push("The sanctioned validation for this task is its contract items:", "");
  for (const item of node.validation.required) {
    bodyLines.push(`- ${item}`);
  }
  return makeConcept({
    type: "Attested Computation",
    title: `${node.id} validation contract`,
    runtime: "dge-evidence",
    status: nativeLifecycle(node.status),
    executor: {
      resource: node.validation.evidence_path ?? undefined,
      receipt: ["satisfies", "command", "result", "artifact"]
    },
    attester: {
      resource: "dge verify (independent verifier)"
    },
    body: bodyLines.join("\n").trim(),
    ext: {
      kind: "ValidationContract",
      node_id: node.id,
      required: node.validation.required,
      evidence_path: node.validation.evidence_path ?? undefined
    }
  });
}

// The bundle-root index.md (SPEC §8). This is the ONLY file permitted to carry an
// okf_version frontmatter key (SPEC §12). It references the canonical graph so a
// consumer that reaches the bundle knows graph.json is the authoritative entry.
function renderRootIndex(graph, { demands, requirements, nodes }) {
  const meta = graph.graph ?? {};
  const lines = [];
  lines.push("---");
  lines.push(`okf_version: "${OKF_VERSION}"`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${meta.title ?? "Delivery Graph"}`);
  lines.push("");
  lines.push(
    "OKF v0.2 projection of the canonical `delivery-graph/graph.json`. " +
      "graph.json is the authoritative entry and sole writer; this bundle is a " +
      "generated, read-only projection (see ADR-001)."
  );
  lines.push("");
  if (demands.length) {
    lines.push("# Intents");
    lines.push("");
    for (const d of demands) {
      lines.push(`* [${d.id}](${intentPath(d.id)}) - ${d.summary ?? d.title}`);
    }
    lines.push("");
  }
  if (requirements.length) {
    lines.push("# Requirements");
    lines.push("");
    for (const r of requirements) {
      lines.push(`* [${r.id}](${requirementPath(r.id)}) - ${r.statement ?? r.id}`);
    }
    lines.push("");
  }
  if (nodes.length) {
    lines.push("# Tasks");
    lines.push("");
    for (const n of nodes) {
      lines.push(`* [${n.id}](${taskPath(n.id)}) - ${n.title}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

// ---------------------------------------------------------------------------
// Writing (explicit; callers gate this behind a confirm — see dge migrate, NODE-090)
// ---------------------------------------------------------------------------

// Write the projection under `<repo>/delivery-graph/okf/`. Returns the list of
// absolute paths written. Never touches graph.json.
export function writeBundle(graphPath, graph, { subdir = "delivery-graph/okf" } = {}) {
  const files = graphToBundle(graph);
  const root = resolveRuntimePath(graphPath, subdir);
  const written = [];
  for (const [relative, content] of Object.entries(files)) {
    const abs = path.join(root, relative);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    written.push(abs);
  }
  return written;
}

export const OKF_BUNDLE_SUBDIR = "delivery-graph/okf";
