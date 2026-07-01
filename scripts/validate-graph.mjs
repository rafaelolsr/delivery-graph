#!/usr/bin/env node
import { readGraph, validateGraph } from "../src/graph-engine.mjs";

const graphPath = process.argv[2];

if (!graphPath) {
  console.error("Usage: node scripts/validate-graph.mjs <graph.json>");
  process.exit(2);
}

const graph = readGraph(graphPath);
const errors = validateGraph(graph);

if (errors.length > 0) {
  console.error(`Delivery graph validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Delivery graph valid: ${graph.graph.id} - ${graph.graph.title}`);
