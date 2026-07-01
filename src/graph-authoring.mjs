import { assertValidGraph } from "./graph-engine.mjs";

export function createGraph({ id = "DGE-001", title, source = "local", createdAt = new Date().toISOString() }) {
  requireText(title, "title");

  return {
    graph: {
      id,
      title,
      status: "draft",
      source,
      created_at: createdAt,
      updated_at: createdAt
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
  const node = {
    id,
    title: input.title,
    type: input.type,
    track: input.track,
    requirement_ids: splitRequiredList(input.requirements, "requirements"),
    depends_on: splitList(input.dependsOn),
    status: input.status ?? "ready",
    validation: {
      required: requiredItems(input.validation, "validation"),
      evidence_path: input.evidencePath ?? `delivery-graph/evidence/${id}/`
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
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
}
