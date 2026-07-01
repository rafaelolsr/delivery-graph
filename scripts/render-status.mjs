#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const graphPath = process.argv[2];

if (!graphPath) {
  console.error("Usage: node scripts/render-status.mjs <graph.json>");
  process.exit(2);
}

const graph = JSON.parse(fs.readFileSync(path.resolve(graphPath), "utf8"));
const statuses = ["proposed", "ready", "in_progress", "blocked", "review", "verified", "done"];
const nodesByStatus = new Map(statuses.map((status) => [status, []]));

for (const node of graph.nodes ?? []) {
  if (!nodesByStatus.has(node.status)) nodesByStatus.set(node.status, []);
  nodesByStatus.get(node.status).push(node);
}

console.log(`# ${graph.graph.id}: ${graph.graph.title}`);
console.log("");
console.log("| Status | Count | Nodes |");
console.log("| --- | ---: | --- |");

for (const status of statuses) {
  const nodes = nodesByStatus.get(status) ?? [];
  const names = nodes.map((node) => `${node.id} ${node.title}`).join("<br>");
  console.log(`| ${status} | ${nodes.length} | ${names || "-"} |`);
}

console.log("");
console.log("## Ready nodes");
for (const node of graph.nodes.filter((candidate) => candidate.status === "ready" && dependenciesDone(candidate, graph.nodes))) {
  console.log(`- ${node.id}: ${node.title}`);
}

function dependenciesDone(node, nodes) {
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  return node.depends_on.every((dependencyId) => byId.get(dependencyId)?.status === "done");
}

