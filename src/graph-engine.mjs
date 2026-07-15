import fs from "node:fs";
import path from "node:path";
import { validateGraphSchema } from "./schema-validator.mjs";

export const NODE_STATUSES = [
  "proposed",
  "ready",
  "in_progress",
  "blocked",
  "review",
  "verified",
  "done",
  "done-waived"
];

export const GRAPH_STATUSES = ["draft", "active", "blocked", "review", "done"];

export const NODE_TRANSITIONS = new Map([
  ["proposed", new Set(["ready", "blocked"])],
  ["ready", new Set(["in_progress", "blocked"])],
  ["in_progress", new Set(["review", "blocked"])],
  ["blocked", new Set(["ready", "in_progress"])],
  ["review", new Set(["in_progress", "verified", "blocked", "done-waived"])],
  ["verified", new Set(["done", "in_progress"])],
  ["done", new Set([])],
  // `done-waived` is a terminal status like `done`, minted only through the
  // waiver path (a review node with no evidence, whose deps are complete). It is
  // deliberately reachable ONLY from `review`, never from `verified` — the whole
  // point is a proof-free exit for un-provable work, kept distinct from `done`.
  ["done-waived", new Set([])]
]);

export function readGraph(graphPath) {
  const absolutePath = path.resolve(graphPath);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read JSON graph at ${absolutePath}: ${error.message}`);
  }
}

// Raised when an optimistic write loses the compare-and-swap race: another
// process committed a new revision between our read and our write. runMutation
// catches this and retries (re-read, re-apply, re-write).
export class ConcurrentModificationError extends Error {
  constructor(expectedRev, actualRev) {
    super(
      `Store changed under us (expected rev ${expectedRev}, found ${actualRev}); another writer committed concurrently.`
    );
    this.name = "ConcurrentModificationError";
    this.expectedRev = expectedRev;
    this.actualRev = actualRev;
  }
}

// Run `fn` while holding an exclusive lock on the store, so a full read-modify-write
// cycle is atomic across processes. The optimistic rev check narrows the lost-update
// window but cannot close it alone: two processes can both pass the rev check and then
// both rename, the second silently clobbering the first. An OS-level exclusive create
// (open with "wx" — fails if the lock exists) is the only primitive that serializes the
// check-and-commit. Lock is released in finally; a stale lock older than the timeout is
// broken so a killed holder cannot deadlock the store.
export function withStoreLock(graphPath, fn, { timeoutMs = 5000, staleMs = 30000 } = {}) {
  const lockPath = `${path.resolve(graphPath)}.lock`;
  const deadline = Date.now() + timeoutMs;
  let fd;
  for (;;) {
    try {
      fd = fs.openSync(lockPath, "wx");
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      // Break a stale lock left by a crashed holder.
      try {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age > staleMs) {
          fs.rmSync(lockPath, { force: true });
          continue;
        }
      } catch {
        continue; // lock vanished between open and stat — retry immediately
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out acquiring store lock at ${lockPath}`);
      }
      sleepBusy(15);
    }
  }
  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lockPath, { force: true });
  }
}

// Synchronous short spin — the lock is held only for the duration of one
// read-modify-write, so contention waits are milliseconds.
function sleepBusy(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // busy-wait; keeps the lock protocol fully synchronous like the rest of the CLI
  }
}

// The on-disk revision counter, or 0 for a store that predates rev (or is absent).
export function readGraphRev(graphPath) {
  try {
    const onDisk = JSON.parse(fs.readFileSync(path.resolve(graphPath), "utf8"));
    return onDisk?.graph?.rev ?? 0;
  } catch {
    return 0; // no file yet → first write starts the sequence
  }
}

// Persist the graph, bumping graph.rev on every write.
//
// The write is atomic (temp + rename) so it can never leave a torn file. When
// `opts.expectedRev` is supplied, the write is ALSO concurrency-safe: it refuses
// to overwrite if the on-disk rev has moved since the caller read it, throwing
// ConcurrentModificationError instead of silently clobbering a concurrent update
// (the lost-update race in runMutation's read-modify-write cycle). Callers that
// omit expectedRev keep the previous unconditional behavior — preserving every
// existing single-writer flow unchanged.
export function writeGraph(graphPath, graph, opts = {}) {
  const absolutePath = path.resolve(graphPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

  if (opts.expectedRev !== undefined) {
    const actualRev = readGraphRev(absolutePath);
    if (actualRev !== opts.expectedRev) {
      throw new ConcurrentModificationError(opts.expectedRev, actualRev);
    }
  }

  graph.graph = { ...graph.graph, rev: (graph.graph?.rev ?? 0) + 1 };
  writeFileAtomic(absolutePath, `${JSON.stringify(graph, null, 2)}\n`);
  return graph.graph.rev;
}

// Write to a sibling temp file, then rename onto the target. Rename is atomic on
// the same filesystem, so an interrupted write (crash, SIGKILL, full disk) can
// never leave a torn/unparseable canonical file — the old contents survive intact.
export function writeFileAtomic(targetPath, contents) {
  const tmpPath = `${targetPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, contents);
  fs.renameSync(tmpPath, targetPath);
}

export function validateGraph(graph, options = {}) {
  const errors = validateGraphSchema(graph);

  requireObject(graph, "root", errors);
  requireObject(graph?.graph, "graph", errors);
  requireArray(graph?.demands, "demands", errors);
  requireArray(graph?.requirements, "requirements", errors);
  requireArray(graph?.tracks, "tracks", errors);
  requireArray(graph?.nodes, "nodes", errors);

  if (errors.length > 0) return errors;

  requirePattern(graph.graph.id, /^DGE-\d{3,}$/, "graph.id", errors);
  requireText(graph.graph.title, "graph.title", errors);
  requireEnum(graph.graph.status, GRAPH_STATUSES, "graph.status", errors);

  const demandIds = new Set();
  const requirementIds = new Set();
  const trackIds = new Set();
  const nodeIds = new Set();
  const evidencePaths = new Set();
  // requirement_id -> demand_id, so a node's owning demand can be derived and the
  // one-demand-per-node rule enforced (all of a node's requirements share a demand).
  const requirementDemand = new Map();

  for (const demand of graph.demands) {
    requirePattern(demand.id, /^DEM-\d{3,}$/, "demand.id", errors);
    requireText(demand.title, `${demand.id}.title`, errors);
    requireText(demand.source, `${demand.id}.source`, errors);
    requireText(demand.outcome, `${demand.id}.outcome`, errors);
    addUnique(demandIds, demand.id, "demand", errors);
  }

  for (const requirement of graph.requirements) {
    requirePattern(requirement.id, /^REQ-\d{3,}$/, "requirement.id", errors);
    requirePattern(requirement.demand_id, /^DEM-\d{3,}$/, `${requirement.id}.demand_id`, errors);
    if (!demandIds.has(requirement.demand_id)) {
      errors.push(`${requirement.id} references missing demand ${requirement.demand_id}`);
    }
    requireText(requirement.statement, `${requirement.id}.statement`, errors);
    requireNonEmptyArray(requirement.acceptance, `${requirement.id}.acceptance`, errors);
    requireObject(requirement.validation, `${requirement.id}.validation`, errors);
    requireText(requirement.validation?.method, `${requirement.id}.validation.method`, errors);
    requireNonEmptyArray(requirement.validation?.required_evidence, `${requirement.id}.validation.required_evidence`, errors);
    addUnique(requirementIds, requirement.id, "requirement", errors);
    requirementDemand.set(requirement.id, requirement.demand_id);
  }

  for (const gap of graph.gaps ?? []) {
    requirePattern(gap.id, /^GAP-\d{3,}$/, "gap.id", errors);
    requireText(gap.question, `${gap.id}.question`, errors);
    requireNonEmptyArray(gap.blocks, `${gap.id}.blocks`, errors);
    if (options.requireResolvedBlockers !== false && gap.severity === "blocker" && !gap.resolution) {
      errors.push(`${gap.id} is a blocker and must be resolved before graph planning is ready`);
    }
  }

  for (const track of graph.tracks) {
    requirePattern(track.id, /^TRK-[a-z0-9-]+$/, "track.id", errors);
    requireText(track.title, `${track.id}.title`, errors);
    addUnique(trackIds, track.id, "track", errors);
  }

  for (const node of graph.nodes) {
    requirePattern(node.id, /^NODE-\d{3,}$/, "node.id", errors);
    requireText(node.title, `${node.id}.title`, errors);
    requireEnum(node.status, NODE_STATUSES, `${node.id}.status`, errors);
    if (!trackIds.has(node.track)) {
      errors.push(`${node.id} references missing track ${node.track}`);
    }
    requireNonEmptyArray(node.requirement_ids, `${node.id}.requirement_ids`, errors);
    const nodeDemands = new Set();
    for (const requirementId of node.requirement_ids ?? []) {
      if (!requirementIds.has(requirementId)) {
        errors.push(`${node.id} references missing requirement ${requirementId}`);
      } else {
        nodeDemands.add(requirementDemand.get(requirementId));
      }
    }
    // A node belongs to exactly one demand: all its requirements must resolve to
    // the same demand, so the demand folder can scope everything it generates.
    if (nodeDemands.size > 1) {
      errors.push(
        `${node.id} requirements span multiple demands (${[...nodeDemands].sort().join(", ")}); a node must belong to exactly one demand`
      );
    }
    requireArray(node.depends_on, `${node.id}.depends_on`, errors);
    requireObject(node.validation, `${node.id}.validation`, errors);
    requireNonEmptyArray(node.validation?.required, `${node.id}.validation.required`, errors);
    requireText(node.validation?.evidence_path, `${node.id}.validation.evidence_path`, errors);
    // Evidence is scoped under the node's owning demand. Only enforce the exact path
    // when the demand is unambiguous (single-demand rule already checked above).
    if (nodeDemands.size === 1) {
      const expectedEvidencePath = demandEvidencePath([...nodeDemands][0], node.id);
      if (node.validation?.evidence_path !== expectedEvidencePath) {
        errors.push(`${node.id}.validation.evidence_path must be ${expectedEvidencePath}`);
      }
    }
    addUnique(evidencePaths, node.validation?.evidence_path, "node evidence path", errors);
    requireObject(node.sync, `${node.id}.sync`, errors);
    addUnique(nodeIds, node.id, "node", errors);
  }

  for (const node of graph.nodes) {
    for (const dependency of node.depends_on ?? []) {
      if (!nodeIds.has(dependency)) {
        errors.push(`${node.id} depends on missing node ${dependency}`);
      }
      if (dependency === node.id) {
        errors.push(`${node.id} cannot depend on itself`);
      }
    }
  }

  for (const cycle of findCycles(graph.nodes)) {
    errors.push(`Dependency cycle detected: ${cycle.join(" -> ")}`);
  }

  return errors;
}

export function assertValidGraph(graph, options = {}) {
  const errors = validateGraph(graph, options);
  if (errors.length > 0) {
    throw new Error(`Delivery graph validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
}

// Derive a node's owning demand from its requirements. A valid graph guarantees
// all of a node's requirement_ids share one demand (the one-demand-per-node rule),
// so this is unambiguous; returns null if no requirement resolves to a demand.
export function nodeDemandId(graph, node) {
  const requirementDemand = new Map((graph.requirements ?? []).map((r) => [r.id, r.demand_id]));
  for (const requirementId of node.requirement_ids ?? []) {
    const demandId = requirementDemand.get(requirementId);
    if (demandId) return demandId;
  }
  return null;
}

// The one canonical location of a node's evidence: scoped under its owning demand
// as a flat sibling list (demands/DEM-###/evidence/NODE-###/), so retiring a demand
// is a single-folder delete. Authoring and validation both go through this.
export function demandEvidencePath(demandId, nodeId) {
  return `delivery-graph/demands/${demandId}/evidence/${nodeId}/`;
}

export function summarizeGraph(graph) {
  const statuses = new Map(NODE_STATUSES.map((status) => [status, []]));

  for (const node of graph.nodes ?? []) {
    if (!statuses.has(node.status)) statuses.set(node.status, []);
    statuses.get(node.status).push(node);
  }

  return {
    graph: graph.graph,
    statuses,
    readyNodes: getReadyNodes(graph),
    blockerGaps: (graph.gaps ?? []).filter((gap) => gap.severity === "blocker" && !gap.resolution),
    missingEvidenceNodes: getMissingEvidenceNodes(graph)
  };
}

export function getReadyNodes(graph) {
  const nodesById = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  return (graph.nodes ?? []).filter((node) => {
    if (node.status !== "ready") return false;
    // A dependency is satisfied when it is complete — `done` OR `done-waived`.
    // A waived node unblocks its dependents exactly like a proven one.
    return (node.depends_on ?? []).every((dependencyId) => isNodeComplete(nodesById.get(dependencyId)));
  });
}

export function getNextReadyNode(graph) {
  return getReadyNodes(graph)[0] ?? null;
}

export function getMissingEvidenceNodes(graph) {
  return (graph.nodes ?? []).filter((node) => {
    if (!["verified", "done"].includes(node.status)) return false;
    return !node.validation?.evidence_path;
  });
}

export function transitionNode(graph, nodeId, nextStatus, options = {}) {
  assertValidGraph(graph, { requireResolvedBlockers: options.requireResolvedBlockers });

  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} not found`);
  }

  if (!NODE_STATUSES.includes(nextStatus)) {
    throw new Error(`nextStatus must be one of: ${NODE_STATUSES.join(", ")}`);
  }

  const allowed = NODE_TRANSITIONS.get(node.status) ?? new Set();
  if (!allowed.has(nextStatus)) {
    throw new Error(`Invalid node transition: ${node.id} ${node.status} -> ${nextStatus}`);
  }

  if (nextStatus === "in_progress") {
    const incompleteDependencies = getIncompleteDependencies(graph, node);
    if (incompleteDependencies.length > 0) {
      throw new Error(`${node.id} cannot start; incomplete dependencies: ${incompleteDependencies.join(", ")}`);
    }
  }

  if (nextStatus === "verified") {
    // `verified` is an evidence-gated status: reaching it requires proving the
    // validation contract is satisfied, which needs the evidence manifest on
    // disk. transitionNode has no graphPath and cannot read the manifest, so it
    // must not mint `verified` itself — that would bypass the evidence gate.
    // Route verification through verifyNode (evidence-engine), which checks
    // completeness before setting the status.
    throw new Error(`${node.id} cannot be moved to verified via transition; run \`dge verify ${node.id}\` so the evidence gate applies`);
  }

  if (nextStatus === "done") {
    assertEvidencePath(node);
    if (node.status !== "verified") {
      throw new Error(`${node.id} must be verified before it can be done`);
    }
  }

  return {
    ...graph,
    graph: {
      ...graph.graph,
      updated_at: options.updatedAt ?? new Date().toISOString()
    },
    nodes: graph.nodes.map((candidate) =>
      candidate.id === node.id ? { ...candidate, status: nextStatus } : candidate
    )
  };
}

// A node is "complete" — it satisfies a dependency and unblocks dependents — when
// it is either `done` (proven) or `done-waived` (proof waived for un-provable work).
// This is the single definition of completion; readiness and the dependency checks
// both route through it so a waived node counts exactly like a done one.
export const COMPLETE_STATUSES = new Set(["done", "done-waived"]);

export function isNodeComplete(node) {
  return COMPLETE_STATUSES.has(node?.status);
}

// The demand lifecycle, coarser than node status: where a demand sits across
// design -> plan -> execute -> verify -> done. Always derived live from the
// graph's requirements/nodes for this demand — never stored — so it can never
// drift from the data it summarizes.
export const DEMAND_STAGES = ["design", "plan", "execute", "verify", "done"];

// One demand's stage plus the counts a renderer needs alongside it. `stage` is
// the first matching rule, in order:
//   - no requirements yet                              -> design
//   - requirements, but no nodes yet                    -> plan
//   - nodes exist, all complete (done/done-waived)       -> done
//   - nodes exist, all incomplete ones are in `review`   -> verify
//   - otherwise (some node still pre-review)             -> execute
// `blockedNodes` and `reviewNodes` are reported as annotations on whichever
// stage is active, not stages of their own — a blocked or in-review node is
// still "pre-complete" work in progress, just at a more specific point.
export function demandProgress(graph, demandId) {
  const demand = (graph.demands ?? []).find((candidate) => candidate.id === demandId);
  if (!demand) {
    throw new Error(`${demandId} not found`);
  }

  const requirementCount = (graph.requirements ?? []).filter((r) => r.demand_id === demandId).length;
  const nodes = (graph.nodes ?? []).filter((node) => nodeDemandId(graph, node) === demandId);
  const totalNodes = nodes.length;
  const completeNodes = nodes.filter(isNodeComplete).length;
  const blockedNodes = nodes.filter((node) => node.status === "blocked").length;
  const reviewNodes = nodes.filter((node) => node.status === "review").length;

  let stage;
  if (requirementCount === 0) {
    stage = "design";
  } else if (totalNodes === 0) {
    stage = "plan";
  } else if (completeNodes === totalNodes) {
    stage = "done";
  } else {
    const incomplete = nodes.filter((node) => !isNodeComplete(node));
    stage = incomplete.every((node) => node.status === "review") ? "verify" : "execute";
  }

  return { stage, requirementCount, totalNodes, completeNodes, blockedNodes, reviewNodes };
}

export function deriveDemandStage(graph, demandId) {
  return demandProgress(graph, demandId).stage;
}

function getIncompleteDependencies(graph, node) {
  const nodesById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  return node.depends_on.filter((dependencyId) => !isNodeComplete(nodesById.get(dependencyId)));
}

function assertEvidencePath(node) {
  if (!node.validation?.evidence_path) {
    throw new Error(`${node.id} cannot be completed without validation.evidence_path`);
  }
}

function findCycles(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(nodeId, stack) {
    if (visiting.has(nodeId)) {
      // stack already starts at the seed node, so slicing from the first
      // occurrence of nodeId yields the full cycle path (...-> nodeId) without
      // re-appending it — appending again would duplicate the closing node.
      cycles.push([...stack.slice(stack.indexOf(nodeId))]);
      return;
    }
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    for (const dependency of byId.get(nodeId)?.depends_on ?? []) {
      if (byId.has(dependency)) visit(dependency, [...stack, dependency]);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const node of nodes) visit(node.id, [node.id]);
  return cycles;
}

function requireObject(value, field, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${field} must be an object`);
  }
}

function requireArray(value, field, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
  }
}

function requireNonEmptyArray(value, field, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${field} must be a non-empty array`);
  }
}

function requireText(value, field, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty text`);
  }
}

function requirePattern(value, pattern, field, errors) {
  if (typeof value !== "string" || !pattern.test(value)) {
    errors.push(`${field} must match ${pattern}`);
  }
}

function requireEnum(value, values, field, errors) {
  if (!values.includes(value)) {
    errors.push(`${field} must be one of: ${values.join(", ")}`);
  }
}

function addUnique(set, id, type, errors) {
  if (set.has(id)) {
    errors.push(`Duplicate ${type} id ${id}`);
  }
  set.add(id);
}
