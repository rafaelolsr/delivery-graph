#!/usr/bin/env node
import { readGraph } from "../src/graph-engine.mjs";
import { renderStatus } from "../src/status-renderer.mjs";

const graphPath = process.argv[2];

if (!graphPath) {
  console.error("Usage: node scripts/render-status.mjs <graph.json>");
  process.exit(2);
}

process.stdout.write(renderStatus(readGraph(graphPath)));
