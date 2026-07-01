#!/usr/bin/env node
import { readGraph } from "../src/graph-engine.mjs";
import { renderStatus } from "../src/status-renderer.mjs";
import { getAllEvidenceStatuses } from "../src/evidence-engine.mjs";

const graphPath = process.argv[2];

if (!graphPath) {
  console.error("Usage: node scripts/render-status.mjs <graph.json>");
  process.exit(2);
}

const graph = readGraph(graphPath);
process.stdout.write(renderStatus(graph, { evidenceStatuses: getAllEvidenceStatuses(graphPath, graph) }));
