// OKF bundle compatibility reader + round-trip (DEM-021 / REQ-092, NODE-088).
//
// bundleToGraph() is the inverse of graphToBundle() (src/okf-bundle.mjs): it
// reconstructs the DGE graph structure from an OKF bundle's concept files. The DGE
// canonical fields live under each concept's x-dge extension (ADR-001 D3), so
// reconstruction reads them back from there — native OKF fields were never
// overloaded, so nothing DGE-specific has to be inferred from a native field.
//
// The round-trip contract (NODE-088): for any graph, bundleToGraph(graphToBundle(g))
// preserves every task, dependency, validation contract, evidence reference, and
// state, with identifiers stable. This module also exposes roundTrip() and a
// structural diff so the migration preview (NODE-090) can render "no semantic loss".

import { parseConcept, splitFrontmatter } from "./okf-concept.mjs";
import { graphToBundle } from "./okf-bundle.mjs";

// Reconstruct a DGE graph projection from a bundle map { path -> content }.
// Returns { graph, demands, requirements, nodes } — the subset the bundle carries.
// (Tracks/gaps are not projected into concepts in this milestone; they remain in
// graph.json, the canonical store. The round-trip asserts loss only over what the
// bundle is responsible for.)
export function bundleToGraph(bundle) {
  const demands = [];
  const requirements = [];
  const nodes = [];

  for (const [name, content] of Object.entries(bundle)) {
    if (name === "index.md") continue; // reserved index (§8), not a concept
    const concept = parseConcept(content);
    const ext = concept["x-dge"] ?? {};
    if (name.startsWith("intents/")) {
      demands.push(intentToDemand(concept, ext));
    } else if (name.startsWith("requirements/")) {
      requirements.push(conceptToRequirement(concept, ext));
    } else if (name.startsWith("tasks/")) {
      nodes.push(taskToNode(concept, ext, bundle));
    }
    // computations/* are the Attested Computation projection of a node's contract;
    // the contract is reconstructed from the Task's linked computation below.
  }

  const graphMeta = readIndexMeta(bundle);
  return { graph: graphMeta, demands, requirements, nodes };
}

function intentToDemand(concept, ext) {
  const demand = { id: ext.id, title: concept.title };
  if (concept.description !== undefined) demand.summary = concept.description;
  if (ext.source !== undefined) demand.source = ext.source;
  // Body sections (outcome/constraints/non-goals) are reconstructed from the body.
  const sections = parseBodySections(concept.body);
  if (sections.Outcome) demand.outcome = sections.Outcome.join("\n").trim();
  if (sections.Constraints) demand.constraints = sections.Constraints.filter(Boolean).map(stripBullet);
  if (sections["Non-goals"]) demand.non_goals = sections["Non-goals"].filter(Boolean).map(stripBullet);
  return demand;
}

function conceptToRequirement(concept, ext) {
  const req = { id: ext.id };
  if (ext.demand_id !== undefined) req.demand_id = ext.demand_id;
  const sections = parseBodySections(concept.body);
  if (sections.Statement) req.statement = sections.Statement.join("\n").trim();
  if (sections.Acceptance) req.acceptance = sections.Acceptance.filter(Boolean).map(stripBullet);
  if (ext.priority !== undefined) req.priority = ext.priority;
  return req;
}

function taskToNode(concept, ext, bundle) {
  const node = {
    id: ext.id,
    title: concept.title,
    type: ext.node_type,
    track: ext.track,
    requirement_ids: ext.requirement_ids ?? [],
    depends_on: ext.depends_on ?? [],
    status: ext.status
  };
  // Reconstruct the validation contract from the linked Attested Computation concept.
  const contractPath = `computations/${ext.id}-contract.md`;
  if (bundle[contractPath]) {
    const contract = parseConcept(bundle[contractPath]);
    const cext = contract["x-dge"] ?? {};
    node.validation = {
      required: cext.required ?? [],
      evidence_path: cext.evidence_path
    };
  }
  return node;
}

function readIndexMeta(bundle) {
  const index = bundle["index.md"];
  if (!index) return {};
  try {
    const { frontmatter } = splitFrontmatter(index);
    const meta = {};
    const m = frontmatter.match(/okf_version:\s*"?([^"\n]+)"?/);
    if (m) meta.okf_version = m[1];
    return meta;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Round-trip + structural diff
// ---------------------------------------------------------------------------

// roundTrip(graph) -> the graph as reconstructed through the bundle. Used by tests
// and by the migration preview to assert no semantic loss.
export function roundTrip(graph) {
  return bundleToGraph(graphToBundle(graph));
}

// Compare the bundle-responsible subset of two graphs for semantic loss. Returns a
// list of human-readable differences (empty = lossless). Order-insensitive per id.
export function diffGraphs(before, after) {
  const diffs = [];
  compareCollection("demand", before.demands ?? [], after.demands ?? [], demandFields, diffs);
  compareCollection("requirement", before.requirements ?? [], after.requirements ?? [], requirementFields, diffs);
  compareCollection("node", before.nodes ?? [], after.nodes ?? [], nodeFields, diffs);
  return diffs;
}

function compareCollection(kind, beforeList, afterList, fieldsOf, diffs) {
  const afterById = new Map(afterList.map((x) => [x.id, x]));
  for (const b of beforeList) {
    const a = afterById.get(b.id);
    if (!a) {
      diffs.push(`${kind} ${b.id} lost in round trip`);
      continue;
    }
    for (const field of fieldsOf(b)) {
      if (!deepEqual(b[field], a[field])) {
        diffs.push(`${kind} ${b.id}: field "${field}" changed`);
      }
    }
    afterById.delete(b.id);
  }
  for (const leftover of afterById.keys()) {
    diffs.push(`${kind} ${leftover} appeared but was not in the source`);
  }
}

// The fields the bundle is responsible for preserving (its round-trip contract).
function demandFields() {
  return ["id", "title", "summary", "outcome", "constraints", "non_goals"];
}
function requirementFields() {
  return ["id", "demand_id", "statement", "acceptance", "priority"];
}
function nodeFields() {
  return ["id", "title", "type", "track", "requirement_ids", "depends_on", "status", "validation"];
}

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------

// "empty-ish" = a value that carries no information: undefined, null, or [].
function isEmptyish(value) {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

function stripBullet(line) {
  return line.replace(/^-\s+/, "").trim();
}

// Parse `# Heading` sections of a markdown body into { Heading: [lines] }.
function parseBodySections(body = "") {
  const sections = {};
  let current = null;
  for (const line of body.split("\n")) {
    const h = line.match(/^#\s+(.+)$/);
    if (h) {
      current = h[1].trim();
      sections[current] = [];
    } else if (current) {
      if (line.trim() !== "") sections[current].push(line);
    }
  }
  return sections;
}

function deepEqual(a, b) {
  if (a === b) return true;
  // An empty list and an absent field are the same claim ("none"): the bundle omits
  // empty collections rather than emitting `[]`, so treat them as equal on round trip.
  if (isEmptyish(a) && isEmptyish(b)) return true;
  if (a === undefined || b === undefined || a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
