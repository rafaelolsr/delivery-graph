import { assertValidGraph, demandEvidencePath, nodeDemandId } from "./graph-engine.mjs";

// A deterministic default so `dge init` needs no --title decision (REQ-040).
// Kept constant (not date/path-derived) so the graph is reproducible and the
// default is overridable with --title.
export const DEFAULT_GRAPH_TITLE = "Delivery graph";

export function createGraph({ id = "DGE-001", title, source = "local", createdAt = new Date().toISOString() }) {
  const resolvedTitle = isNonEmptyText(title) ? title : DEFAULT_GRAPH_TITLE;

  return {
    graph: {
      id,
      title: resolvedTitle,
      status: "draft",
      source,
      created_at: createdAt,
      updated_at: createdAt,
      rev: 0
    },
    demands: [],
    requirements: [],
    gaps: [],
    tracks: [],
    nodes: []
  };
}

export function addDemand(graph, input) {
  requireText(input.title, "title");
  requireText(input.source, "source");
  requireText(input.outcome, "outcome");

  const demand = removeUndefined({
    id: input.id ?? nextNumericId(graph.demands, "DEM"),
    title: input.title,
    source: input.source,
    requester: input.requester,
    // A one-line TL;DR that renderers use as the bold lead. Optional by design
    // (mirrors `problem`): removeUndefined drops it when absent so a summary-less
    // demand round-trips as undefined, never an empty string, and every existing
    // demand stays valid. Never routed through requireText — it is not required.
    summary: input.summary,
    problem: input.problem,
    outcome: input.outcome,
    constraints: splitList(input.constraints),
    non_goals: splitList(input.nonGoals)
  });

  const nextGraph = {
    ...touchGraph(graph),
    demands: [...graph.demands, demand]
  };

  assertValidGraph(nextGraph, { requireResolvedBlockers: false });
  return { graph: nextGraph, record: demand };
}

export function addRequirement(graph, input) {
  requireText(input.demandId, "demand");
  requireText(input.statement, "statement");

  const requirement = {
    id: input.id ?? nextNumericId(graph.requirements, "REQ"),
    demand_id: input.demandId,
    statement: input.statement,
    priority: input.priority ?? "must",
    acceptance: splitRequiredList(input.acceptance, "acceptance"),
    validation: {
      method: input.validationMethod ?? "manual-review",
      required_evidence: splitRequiredList(input.evidence, "evidence")
    }
  };

  const nextGraph = {
    ...touchGraph(graph),
    requirements: [...graph.requirements, requirement]
  };

  assertValidGraph(nextGraph, { requireResolvedBlockers: false });
  return { graph: nextGraph, record: requirement };
}

export function addGap(graph, input) {
  requireText(input.type, "type");
  requireText(input.severity, "severity");
  requireText(input.question, "question");

  const gap = {
    id: input.id ?? nextNumericId(graph.gaps ?? [], "GAP"),
    type: input.type,
    severity: input.severity,
    question: input.question,
    blocks: splitRequiredList(input.blocks, "blocks"),
    resolution: input.resolution ?? null
  };

  const nextGraph = {
    ...touchGraph(graph),
    gaps: [...(graph.gaps ?? []), gap]
  };

  assertValidGraph(nextGraph, { requireResolvedBlockers: false });
  return { graph: nextGraph, record: gap };
}

export function resolveGap(graph, gapId, resolution) {
  requireText(gapId, "gap id");
  requireText(resolution, "resolution");

  let found = false;
  const nextGraph = {
    ...touchGraph(graph),
    gaps: (graph.gaps ?? []).map((gap) => {
      if (gap.id !== gapId) return gap;
      found = true;
      return { ...gap, resolution };
    })
  };

  if (!found) {
    throw new Error(`Gap ${gapId} not found`);
  }

  assertValidGraph(nextGraph, { requireResolvedBlockers: false });
  return { graph: nextGraph, record: nextGraph.gaps.find((gap) => gap.id === gapId) };
}

export function addTrack(graph, input) {
  requireText(input.title, "title");

  const track = removeUndefined({
    id: input.id ?? nextTrackId(graph.tracks, input.title),
    title: input.title,
    description: input.description,
    owner: input.owner
  });

  const nextGraph = {
    ...touchGraph(graph),
    tracks: [...graph.tracks, track]
  };

  assertValidGraph(nextGraph);
  return { graph: nextGraph, record: track };
}

export function addNode(graph, input) {
  requireText(input.title, "title");
  requireText(input.type, "type");
  requireText(input.track, "track");

  const id = input.id ?? nextNumericId(graph.nodes, "NODE");
  const requirementIds = splitRequiredList(input.requirements, "requirements");
  // Evidence lives under the node's owning demand (derived from its requirements).
  // assertValidGraph below rejects the node if those requirements span demands.
  const owningDemand = nodeDemandId(graph, { requirement_ids: requirementIds });
  const node = {
    id,
    title: input.title,
    type: input.type,
    track: input.track,
    requirement_ids: requirementIds,
    depends_on: splitList(input.dependsOn),
    status: input.status ?? "ready",
    validation: {
      required: requiredItems(input.validation, "validation"),
      evidence_path: input.evidencePath ?? demandEvidencePath(owningDemand, id)
    },
    sync: {
      linear_issue_id: input.linearIssueId ?? null,
      ado_task_id: input.adoTaskId ?? null
    }
  };

  const nextGraph = {
    ...touchGraph(graph),
    nodes: [...graph.nodes, node]
  };

  assertValidGraph(nextGraph);
  return { graph: nextGraph, record: node };
}

// Remove a node by id so an authoring mistake is correctable via the CLI.
// Refuses removal when other nodes depend on it (would orphan a dependency).
export function removeNode(graph, nodeId) {
  requireText(nodeId, "node id");
  const id = nodeId;
  const node = (graph.nodes ?? []).find((n) => n.id === id);
  if (!node) {
    throw new Error(`${id} not found`);
  }
  const dependents = (graph.nodes ?? []).filter((n) => (n.depends_on ?? []).includes(id)).map((n) => n.id);
  if (dependents.length > 0) {
    throw new Error(`${id} cannot be removed; these nodes depend on it: ${dependents.join(", ")}`);
  }

  const nextGraph = {
    ...touchGraph(graph),
    nodes: graph.nodes.filter((n) => n.id !== id)
  };
  assertValidGraph(nextGraph);
  return { graph: nextGraph, record: node };
}

// Retire a whole demand: purge the demand, its requirements, its nodes, and any
// gaps scoped entirely to it from graph.json. Refuses when a node in ANOTHER demand
// depends on one of this demand's nodes (that dependency would be orphaned). The
// scoped folder delete is a filesystem side-effect handled by the CLI, not here.
export function removeDemand(graph, demandId) {
  requireText(demandId, "demand id");
  const demand = (graph.demands ?? []).find((d) => d.id === demandId);
  if (!demand) {
    throw new Error(`${demandId} not found`);
  }

  const requirementIds = new Set(
    (graph.requirements ?? []).filter((r) => r.demand_id === demandId).map((r) => r.id)
  );
  const ownNodes = (graph.nodes ?? []).filter((n) => nodeDemandId(graph, n) === demandId);
  const ownNodeIds = new Set(ownNodes.map((n) => n.id));

  // Guard: a node outside this demand must not depend on a node inside it.
  const externalDependents = (graph.nodes ?? [])
    .filter((n) => !ownNodeIds.has(n.id))
    .filter((n) => (n.depends_on ?? []).some((dep) => ownNodeIds.has(dep)))
    .map((n) => n.id);
  if (externalDependents.length > 0) {
    throw new Error(
      `${demandId} cannot be removed; nodes in other demands depend on its nodes: ${externalDependents.join(", ")}`
    );
  }

  const nextGraph = {
    ...touchGraph(graph),
    demands: graph.demands.filter((d) => d.id !== demandId),
    requirements: (graph.requirements ?? []).filter((r) => r.demand_id !== demandId),
    nodes: (graph.nodes ?? []).filter((n) => !ownNodeIds.has(n.id)),
    // Drop gaps whose blocked requirements are entirely within this demand; a gap
    // that also blocks another demand's requirement is left intact (not orphaned).
    gaps: (graph.gaps ?? []).filter(
      (gap) => !(gap.blocks ?? []).length || !(gap.blocks ?? []).every((req) => requirementIds.has(req))
    )
  };

  assertValidGraph(nextGraph);
  return { graph: nextGraph, record: demand };
}

// Replace a node's validation contract (validation.required) via the CLI so a
// mis-authored contract is fixable without hand-editing graph.json. Items are
// comma-safe (each flag is one item), matching addNode.
export function setNodeValidation(graph, nodeId, validation) {
  requireText(nodeId, "node id");
  const id = nodeId;
  const required = requiredItems(validation, "validation");
  const node = (graph.nodes ?? []).find((n) => n.id === id);
  if (!node) {
    throw new Error(`${id} not found`);
  }
  const updated = { ...node, validation: { ...node.validation, required } };
  const nextGraph = {
    ...touchGraph(graph),
    nodes: graph.nodes.map((n) => (n.id === id ? updated : n))
  };
  assertValidGraph(nextGraph);
  return { graph: nextGraph, record: updated };
}

// Remove a requirement via the CLI so a mis-authored one is fixable without
// remove-demand (which nukes the whole demand). Refuses when a node still lists
// it in requirement_ids (that would orphan the node's traceability). A gap that
// blocks ONLY this requirement is dropped with it; a gap that also blocks another
// requirement keeps that reference and is left intact.
export function removeRequirement(graph, requirementId) {
  requireText(requirementId, "requirement id");
  const id = requirementId;
  const requirement = (graph.requirements ?? []).find((r) => r.id === id);
  if (!requirement) {
    throw new Error(`${id} not found`);
  }

  const referencingNodes = (graph.nodes ?? [])
    .filter((n) => (n.requirement_ids ?? []).includes(id))
    .map((n) => n.id);
  if (referencingNodes.length > 0) {
    throw new Error(
      `${id} cannot be removed; these nodes reference it: ${referencingNodes.join(", ")}`
    );
  }

  const nextGraph = {
    ...touchGraph(graph),
    requirements: (graph.requirements ?? []).filter((r) => r.id !== id),
    // For a gap that blocks this requirement: strip the id from its blocks list so
    // no dangling reference remains. If that empties the blocks (it blocked only
    // this requirement), drop the gap entirely. Gaps not blocking it are untouched.
    gaps: (graph.gaps ?? [])
      .map((gap) => {
        const blocks = gap.blocks ?? [];
        if (!blocks.includes(id)) return gap;
        return { ...gap, blocks: blocks.filter((req) => req !== id) };
      })
      .filter((gap) => !("blocks" in gap) || (gap.blocks ?? []).length > 0)
  };

  assertValidGraph(nextGraph, { requireResolvedBlockers: false });
  return { graph: nextGraph, record: requirement };
}

// Edit a requirement's mutable fields in place (statement, priority, acceptance,
// validation method/evidence) so a mis-authored requirement is correctable via
// the CLI. Identity fields (id, demand_id) are never changed. Only provided
// fields are updated; omitted fields are left as-is.
export function editRequirement(graph, requirementId, input = {}) {
  requireText(requirementId, "requirement id");
  const id = requirementId;
  const requirement = (graph.requirements ?? []).find((r) => r.id === id);
  if (!requirement) {
    throw new Error(`${id} not found`);
  }

  const updated = { ...requirement };
  if (input.statement !== undefined) {
    requireText(input.statement, "statement"); // asserts non-empty; returns nothing
    updated.statement = input.statement;
  }
  if (input.priority !== undefined) updated.priority = input.priority;
  if (input.acceptance !== undefined) updated.acceptance = splitRequiredList(input.acceptance, "acceptance");
  if (input.validationMethod !== undefined || input.evidence !== undefined) {
    updated.validation = {
      method: input.validationMethod ?? requirement.validation?.method ?? "manual-review",
      required_evidence: input.evidence !== undefined
        ? splitRequiredList(input.evidence, "evidence")
        : (requirement.validation?.required_evidence ?? [])
    };
  }

  const nextGraph = {
    ...touchGraph(graph),
    requirements: graph.requirements.map((r) => (r.id === id ? updated : r))
  };
  assertValidGraph(nextGraph, { requireResolvedBlockers: false });
  return { graph: nextGraph, record: updated };
}

// Edit a demand's mutable narrative fields (summary, problem, outcome,
// constraints, non_goals) so they need not be perfect at add-demand time.
// Identity fields (id, title, source) are never changed. Only provided fields
// are updated.
export function editDemand(graph, demandId, input = {}) {
  requireText(demandId, "demand id");
  const id = demandId;
  const demand = (graph.demands ?? []).find((d) => d.id === id);
  if (!demand) {
    throw new Error(`${id} not found`);
  }

  const updated = { ...demand };
  // summary can be backfilled after add-demand, like the other narrative fields.
  // Optional, so no requireText — an explicit "" clears it back to unset.
  if (input.summary !== undefined) {
    if (input.summary === "") delete updated.summary;
    else updated.summary = input.summary;
  }
  if (input.problem !== undefined) updated.problem = input.problem;
  if (input.outcome !== undefined) {
    requireText(input.outcome, "outcome"); // asserts non-empty; returns nothing
    updated.outcome = input.outcome;
  }
  if (input.constraints !== undefined) updated.constraints = splitList(input.constraints);
  if (input.nonGoals !== undefined) updated.non_goals = splitList(input.nonGoals);

  const nextGraph = {
    ...touchGraph(graph),
    demands: graph.demands.map((d) => (d.id === id ? updated : d))
  };
  assertValidGraph(nextGraph, { requireResolvedBlockers: false });
  return { graph: nextGraph, record: updated };
}

export function nextNumericId(records, prefix) {
  const nextNumber = records.reduce((max, record) => {
    const match = String(record.id ?? "").match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `${prefix}-${String(nextNumber).padStart(3, "0")}`;
}

export function nextTrackId(tracks, title) {
  const base = `TRK-${slugify(title)}`;
  const existing = new Set(tracks.map((track) => track.id));
  if (!existing.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }

  throw new Error(`Could not allocate track id for title: ${title}`);
}

function touchGraph(graph) {
  return {
    ...graph,
    graph: {
      ...graph.graph,
      updated_at: new Date().toISOString()
    }
  };
}

function splitList(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(splitList).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitRequiredList(value, field) {
  const list = splitList(value);
  if (list.length === 0) {
    throw new Error(`${field} must include at least one value`);
  }
  return list;
}

// For prose items (validation contract lines) each flag is one item. Commas are
// part of the text, NOT separators — the CLI builds an array from repeated flags,
// so we trim/keep each element as-is instead of comma-splitting it.
function requiredItems(value, field) {
  const list = (Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value])
    .map((item) => String(item).trim())
    .filter(Boolean);
  if (list.length === 0) {
    throw new Error(`${field} must include at least one value`);
  }
  return list;
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "track";
}

function removeUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function requireText(value, field) {
  if (!isNonEmptyText(value)) {
    throw new Error(`${field} is required`);
  }
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim() !== "";
}
