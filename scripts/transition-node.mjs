#!/usr/bin/env node
import { readGraph, transitionNode, writeGraph } from "../src/graph-engine.mjs";

const [graphPath, nodeId, nextStatus] = process.argv.slice(2);

if (!graphPath || !nodeId || !nextStatus) {
  console.error("Usage: node scripts/transition-node.mjs <graph.json> <NODE-###> <status>");
  process.exit(2);
}

try {
  const graph = readGraph(graphPath);
  const nextGraph = transitionNode(graph, nodeId, nextStatus);
  writeGraph(graphPath, nextGraph);
  console.log(`${nodeId} -> ${nextStatus}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
