#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const graphPath = process.argv[2];

if (!graphPath) {
  console.error("Usage: node scripts/validate-graph.mjs <graph.json>");
  process.exit(2);
}

const graph = readJson(graphPath);
const errors = validateGraph(graph);

if (errors.length > 0) {
  console.error(`Delivery graph validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Delivery graph valid: ${graph.graph.id} - ${graph.graph.title}`);

function readJson(filePath) {
  const absolute = path.resolve(filePath);
  try {
    return JSON.parse(fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    throw new Error(`Could not read JSON graph at ${absolute}: ${error.message}`);
  }
}

function validateGraph(graph) {
  const errors = [];

  requireObject(graph, "root", errors);
  requireObject(graph.graph, "graph", errors);
  requireArray(graph.demands, "demands", errors);
  requireArray(graph.requirements, "requirements", errors);
  requireArray(graph.tracks, "tracks", errors);
  requireArray(graph.nodes, "nodes", errors);

  if (errors.length > 0) return errors;

  requirePattern(graph.graph.id, /^DGE-\d{3,}$/, "graph.id", errors);
  requireText(graph.graph.title, "graph.title", errors);

  const demandIds = new Set();
  const requirementIds = new Set();
  const trackIds = new Set();
  const nodeIds = new Set();

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
  }

  for (const gap of graph.gaps ?? []) {
    requirePattern(gap.id, /^GAP-\d{3,}$/, "gap.id", errors);
    requireText(gap.question, `${gap.id}.question`, errors);
    requireNonEmptyArray(gap.blocks, `${gap.id}.blocks`, errors);
    if (gap.severity === "blocker" && !gap.resolution) {
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
    if (!trackIds.has(node.track)) {
      errors.push(`${node.id} references missing track ${node.track}`);
    }
    requireNonEmptyArray(node.requirement_ids, `${node.id}.requirement_ids`, errors);
    for (const requirementId of node.requirement_ids ?? []) {
      if (!requirementIds.has(requirementId)) {
        errors.push(`${node.id} references missing requirement ${requirementId}`);
      }
    }
    requireArray(node.depends_on, `${node.id}.depends_on`, errors);
    requireObject(node.validation, `${node.id}.validation`, errors);
    requireNonEmptyArray(node.validation?.required, `${node.id}.validation.required`, errors);
    requireText(node.validation?.evidence_path, `${node.id}.validation.evidence_path`, errors);
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

function findCycles(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(nodeId, stack) {
    if (visiting.has(nodeId)) {
      cycles.push([...stack.slice(stack.indexOf(nodeId)), nodeId]);
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

function addUnique(set, id, type, errors) {
  if (set.has(id)) {
    errors.push(`Duplicate ${type} id ${id}`);
  }
  set.add(id);
}

