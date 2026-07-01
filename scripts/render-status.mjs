#!/usr/bin/env node
import { readGraph } from "../src/graph-engine.mjs";
import { defaultStatusPath, renderStatus, writeStatusReport } from "../src/status-renderer.mjs";
import { getAllEvidenceStatuses } from "../src/evidence-engine.mjs";

const [graphPath, ...args] = process.argv.slice(2);

if (!graphPath) {
  console.error("Usage: node scripts/render-status.mjs <graph.json> [--out status.md | --save]");
  process.exit(2);
}

const graph = readGraph(graphPath);
const outIndex = args.indexOf("--out");
const shouldWriteReport = args.includes("--save") || outIndex >= 0;
const generatedAt = shouldWriteReport ? new Date() : null;
const markdown = renderStatus(graph, {
  evidenceStatuses: getAllEvidenceStatuses(graphPath, graph),
  generatedAt: generatedAt?.toISOString()
});

process.stdout.write(markdown);
if (shouldWriteReport) {
  const outputPath = outIndex >= 0 ? args[outIndex + 1] : defaultStatusPath(graphPath, generatedAt);
  if (!outputPath || outputPath.startsWith("--")) {
    console.error("Missing value for --out");
    process.exit(2);
  }
  writeStatusReport(outputPath, markdown);
  console.log(`status report: ${outputPath}`);
}
