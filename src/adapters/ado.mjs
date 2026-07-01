import path from "node:path";
import { assertValidGraph } from "../graph-engine.mjs";

export function defaultAdoSyncPath(graphPath) {
  return path.join(path.dirname(path.resolve(graphPath)), "sync", "ado.json");
}

export function createAdoSyncPlan(graph, options = {}) {
  assertValidGraph(graph);

  const existingSync = options.existingSync ?? {};
  const nodeSync = existingSync.nodes ?? {};
  const nodeTaskIds = new Map();

  for (const node of graph.nodes) {
    const mappedTaskId = realAdoTaskId(node.sync?.ado_task_id ?? nodeSync[node.id]?.ado_task_id);
    nodeTaskIds.set(node.id, mappedTaskId);
  }

  const nodes = {};
  const operations = [];

  for (const node of graph.nodes) {
    const adoTaskId = nodeTaskIds.get(node.id);
    const action = adoTaskId ? "update" : "create";
    const payload = nodeToAdoPayload(graph, node, {
      ...options,
      adoTaskId,
      nodeTaskIds
    });
    const plannedTaskId = adoTaskId ?? `dry-run:${node.id}`;

    nodes[node.id] = {
      action,
      ado_task_id: plannedTaskId,
      last_synced_status: node.status,
      title: payload.fields["System.Title"],
      dependency_task_ids: payload.dependency_task_ids,
      payload
    };

    operations.push({
      action,
      node_id: node.id,
      ado_task_id: plannedTaskId,
      payload
    });
  }

  return {
    source_graph: graph.graph.id,
    target: "ado",
    mode: "dry-run",
    updated_at: options.updatedAt ?? new Date().toISOString(),
    organization: options.organization ?? null,
    project: options.project ?? null,
    area_path: options.areaPath ?? null,
    iteration_path: options.iterationPath ?? null,
    work_item_type: "Task",
    nodes,
    operations
  };
}

export function nodeToAdoPayload(graph, node, options = {}) {
  const dependencyTaskIds = node.depends_on
    .map((dependencyId) => options.nodeTaskIds?.get(dependencyId))
    .filter(Boolean);
  const fields = removeNullish({
    "System.Title": `[${node.id}] ${node.title}`,
    "System.Description": renderAdoDescription(graph, node, dependencyTaskIds),
    "System.Tags": [
      "dge",
      node.track,
      node.type,
      node.status,
      ...node.requirement_ids
    ].join("; "),
    "System.State": mapNodeStatusToAdoState(node.status),
    "System.AreaPath": options.areaPath,
    "System.IterationPath": options.iterationPath
  });

  return {
    work_item_type: "Task",
    organization: options.organization ?? null,
    project: options.project ?? null,
    fields,
    json_patch: Object.entries(fields).map(([field, value]) => ({
      op: "add",
      path: `/fields/${field}`,
      value
    })),
    external_id: `${graph.graph.id}:${node.id}`,
    dge: {
      graph_id: graph.graph.id,
      node_id: node.id,
      track: node.track,
      requirement_ids: node.requirement_ids,
      dependency_node_ids: node.depends_on,
      evidence_path: node.validation.evidence_path
    },
    dependency_task_ids: dependencyTaskIds
  };
}

export function mapNodeStatusToAdoState(status) {
  switch (status) {
    case "proposed":
    case "ready":
      return "To Do";
    case "in_progress":
      return "In Progress";
    case "blocked":
      return "In Progress";
    case "review":
    case "verified":
      return "In Progress";
    case "done":
      return "Done";
    default:
      return "To Do";
  }
}

function realAdoTaskId(taskId) {
  if (!taskId || String(taskId).startsWith("dry-run:")) return null;
  return taskId;
}

function renderAdoDescription(graph, node, dependencyTaskIds) {
  const validation = node.validation.required.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const dependencies = node.depends_on.length === 0
    ? "<li>none</li>"
    : node.depends_on.map((dependencyId) => `<li>${escapeHtml(dependencyId)}</li>`).join("");
  const dependencyTasks = dependencyTaskIds.length === 0
    ? "<li>none mapped yet</li>"
    : dependencyTaskIds.map((taskId) => `<li>${escapeHtml(String(taskId))}</li>`).join("");

  return [
    `<p>DGE graph: ${escapeHtml(graph.graph.id)} - ${escapeHtml(graph.graph.title)}</p>`,
    `<p>Node: ${escapeHtml(node.id)}</p>`,
    `<p>Track: ${escapeHtml(node.track)}</p>`,
    `<p>Requirements: ${escapeHtml(node.requirement_ids.join(", "))}</p>`,
    "<h3>Dependencies</h3>",
    `<ul>${dependencies}</ul>`,
    "<h3>Azure DevOps dependency task ids</h3>",
    `<ul>${dependencyTasks}</ul>`,
    "<h3>Validation contract</h3>",
    `<ul>${validation}</ul>`,
    `<p>Evidence path: ${escapeHtml(node.validation.evidence_path)}</p>`,
    "<p><!-- dge:managed --></p>"
  ].join("");
}

function removeNullish(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
