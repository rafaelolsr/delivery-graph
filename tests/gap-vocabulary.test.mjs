import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addDemand, addRequirement, addGap } from "../src/graph-authoring.mjs";
import { assertValidGraph } from "../src/graph-engine.mjs";

// DEM-006: the /dge-intake skill emits richer gap types (privacy, architecture,
// ownership) and a `major` severity that the engine schema previously rejected —
// the StarBase migration hit both. The schema now accepts them so skill output
// validates without lossy remapping.
function baseGraph() {
  let g = { graph: { id: "DGE-001", title: "t", status: "draft" }, demands: [], requirements: [], gaps: [], tracks: [], nodes: [] };
  g = addDemand(g, { title: "d", source: "s", outcome: "o" }).graph;
  g = addRequirement(g, { demandId: "DEM-001", statement: "st", acceptance: ["a"], evidence: "e" }).graph;
  return g;
}

const relaxed = { requireResolvedBlockers: false };

test("privacy, architecture, and ownership are valid gap types", () => {
  let g = baseGraph();
  // addGap validates the schema (type/severity) on each add and throws if invalid,
  // so reaching the end without throwing proves the types are accepted.
  g = addGap(g, { type: "privacy", severity: "blocker", question: "q", blocks: ["REQ-001"] }).graph;
  g = addGap(g, { type: "architecture", severity: "blocker", question: "q2", blocks: ["REQ-001"] }).graph;
  g = addGap(g, { type: "ownership", severity: "major", question: "q3", blocks: ["REQ-001"] }).graph;
  assert.doesNotThrow(() => assertValidGraph(g, relaxed));
  assert.deepEqual(g.gaps.map((x) => x.type), ["privacy", "architecture", "ownership"]);
});

test("major is a valid gap severity", () => {
  let g = baseGraph();
  g = addGap(g, { type: "validation", severity: "major", question: "q", blocks: ["REQ-001"] }).graph;
  assert.doesNotThrow(() => assertValidGraph(g, relaxed));
});

test("the original gap types and severities still validate", () => {
  let g = baseGraph();
  g = addGap(g, { type: "scope", severity: "blocker", question: "q", blocks: ["REQ-001"] }).graph;
  g = addGap(g, { type: "validation", severity: "warning", question: "q2", blocks: ["REQ-001"] }).graph;
  assert.doesNotThrow(() => assertValidGraph(g, relaxed));
});

test("an unknown gap type is still rejected", () => {
  const g = baseGraph();
  assert.throws(
    () => addGap(g, { type: "nonsense", severity: "blocker", question: "q", blocks: ["REQ-001"] }),
    /gaps\/0\/type/
  );
});
