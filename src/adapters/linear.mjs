import path from "node:path";
import { assertValidGraph } from "../graph-engine.mjs";

export function defaultLinearSyncPath(graphPath) {
  return path.join(path.dirname(path.resolve(graphPath)), "sync", "linear.json");
}

export function createLinearSyncPlan(graph, options = {}) {
  assertValidGraph(graph);

  const existingSync = options.existingSync ?? {};
  const nodeSync = existingSync.nodes ?? {};
  const nodeIssueIds = new Map();

  for (const node of graph.nodes) {
    const mappedIssueId = realLinearIssueId(node.sync?.linear_issue_id ?? nodeSync[node.id]?.linear_issue_id);
    nodeIssueIds.set(node.id, mappedIssueId);
  }

  function realLinearIssueId(issueId) {
    if (!issueId || String(issueId).startsWith("dry-run:")) return null;
    return issueId;
  }

  const nodes = {};
  const operations = [];

  for (const node of graph.nodes) {
    const linearIssueId = nodeIssueIds.get(node.id);
    const action = linearIssueId ? "update" : "create";
    const payload = nodeToLinearPayload(graph, node, {
      ...options,
      linearIssueId,
      nodeIssueIds
    });
    const plannedIssueId = linearIssueId ?? `dry-run:${node.id}`;

    nodes[node.id] = {
      action,
      linear_issue_id: plannedIssueId,
      last_synced_status: node.status,
      title: payload.title,
      dependency_issue_ids: payload.dependency_issue_ids,
      payload
    };

    operations.push({
      action,
      node_id: node.id,
      linear_issue_id: plannedIssueId,
      payload
    });
  }

  return {
    source_graph: graph.graph.id,
    target: "linear",
    mode: "dry-run",
    updated_at: options.updatedAt ?? new Date().toISOString(),
    team_id: options.teamId ?? null,
    project_id: options.projectId ?? null,
    nodes,
    operations
  };
}

export function nodeToLinearPayload(graph, node, options = {}) {
  const requirementIds = node.requirement_ids.join(", ");
  const dependencyIssueIds = node.depends_on
    .map((dependencyId) => options.nodeIssueIds?.get(dependencyId))
    .filter(Boolean);

  return {
    title: `[${node.id}] ${node.title}`,
    description: renderLinearDescription(graph, node, dependencyIssueIds),
    team_id: options.teamId ?? null,
    project_id: options.projectId ?? null,
    labels: [
      "dge",
      `track:${node.track}`,
      `type:${node.type}`,
      `status:${node.status}`,
      ...node.requirement_ids.map((requirementId) => `requirement:${requirementId}`)
    ],
    external_id: `${graph.graph.id}:${node.id}`,
    dge: {
      graph_id: graph.graph.id,
      node_id: node.id,
      track: node.track,
      requirement_ids: node.requirement_ids,
      dependency_node_ids: node.depends_on,
      evidence_path: node.validation.evidence_path
    },
    dependency_issue_ids: dependencyIssueIds,
    status: mapNodeStatusToLinearState(node.status),
    requirement_summary: requirementIds
  };
}

export function mapNodeStatusToLinearState(status) {
  switch (status) {
    case "proposed":
      return "backlog";
    case "ready":
      return "todo";
    case "in_progress":
      return "in_progress";
    case "blocked":
      return "blocked";
    case "review":
      return "in_review";
    case "verified":
      return "done";
    case "done":
      return "done";
    default:
      return "todo";
  }
}

function renderLinearDescription(graph, node, dependencyIssueIds) {
  const validation = node.validation.required.map((item) => `- ${item}`).join("\n");
  const dependencies = node.depends_on.length === 0
    ? "- none"
    : node.depends_on.map((dependencyId) => `- ${dependencyId}`).join("\n");
  const dependencyIssues = dependencyIssueIds.length === 0
    ? "- none mapped yet"
    : dependencyIssueIds.map((issueId) => `- ${issueId}`).join("\n");

  return [
    `DGE graph: ${graph.graph.id} - ${graph.graph.title}`,
    `Node: ${node.id}`,
    `Track: ${node.track}`,
    `Requirements: ${node.requirement_ids.join(", ")}`,
    "",
    "## Dependencies",
    dependencies,
    "",
    "## Linear dependency issue ids",
    dependencyIssues,
    "",
    "## Validation contract",
    validation,
    "",
    `Evidence path: ${node.validation.evidence_path}`,
    "",
    "<!-- dge:managed -->"
  ].join("\n");
}
