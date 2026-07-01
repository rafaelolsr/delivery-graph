import assert from "node:assert/strict";
import test from "node:test";
import { addDemand, addRequirement, addTrack, addNode } from "../src/graph-authoring.mjs";
import { relativePath } from "../src/output.mjs";

// DEM-004: --validation prose items must not be comma-split (the bug that
// fragmented NODE-009/010 contracts), and relativePath must not double the
// store dir when the repo path itself contains "delivery-graph".
function seed() {
  let g = { graph: { id: "DGE-001", title: "t", status: "draft" }, demands: [], requirements: [], gaps: [], tracks: [], nodes: [] };
  g = addDemand(g, { title: "d", source: "s", outcome: "o" }).graph;
  g = addRequirement(g, { demandId: "DEM-001", statement: "st", acceptance: ["a"], evidence: "e" }).graph;
  g = addTrack(g, { title: "V" }).graph;
  return g;
}

test("a single --validation value with commas stays one required item", () => {
  const g = seed();
  const { graph } = addNode(g, {
    title: "N", type: "test", track: "TRK-v", requirements: "REQ-001",
    validation: "output has req ids, evidence N/N, and no raw JSON"
  });
  assert.deepEqual(graph.nodes[0].validation.required, ["output has req ids, evidence N/N, and no raw JSON"]);
});

test("repeated --validation flags yield one item per flag", () => {
  const g = seed();
  const { graph } = addNode(g, {
    title: "N", type: "test", track: "TRK-v", requirements: "REQ-001",
    validation: ["first item, with a comma", "second item"]
  });
  assert.deepEqual(graph.nodes[0].validation.required, ["first item, with a comma", "second item"]);
});

test("empty validation is still rejected", () => {
  const g = seed();
  assert.throws(
    () => addNode(g, { title: "N", type: "test", track: "TRK-v", requirements: "REQ-001", validation: "" }),
    /validation must include at least one value/
  );
});

test("relativePath does not double delivery-graph when the repo path contains it", () => {
  const gp = "/root/delivery-graph/delivery-graph/graph.json";
  const target = "/root/delivery-graph/delivery-graph/demands/DEM-001.md";
  assert.equal(relativePath(target, gp), "delivery-graph/demands/DEM-001.md");
});

test("relativePath still works for a normal repo path", () => {
  const gp = "/root/proj/delivery-graph/graph.json";
  const target = "/root/proj/delivery-graph/reports/status.md";
  assert.equal(relativePath(target, gp), "delivery-graph/reports/status.md");
});
