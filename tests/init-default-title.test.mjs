import assert from "node:assert/strict";
import test from "node:test";
import { createGraph, DEFAULT_GRAPH_TITLE } from "../src/graph-authoring.mjs";
import { validateGraph } from "../src/graph-engine.mjs";

// REQ-040 / NODE-047: `dge init` must work without --title. createGraph applies a
// deterministic default title (overridable with --title) so the graph is
// schema-valid without forcing a title decision.

test("createGraph without a title yields a schema-valid graph with the deterministic default", () => {
  const graph = createGraph({ source: "test", createdAt: "2026-07-03T00:00:00Z" });

  assert.equal(graph.graph.title, DEFAULT_GRAPH_TITLE);
  assert.deepEqual(validateGraph(graph), []);
});

test("the default title is deterministic (same input, same title)", () => {
  const a = createGraph({ source: "test", createdAt: "2026-07-03T00:00:00Z" });
  const b = createGraph({ source: "test", createdAt: "2026-07-03T00:00:00Z" });

  assert.equal(a.graph.title, b.graph.title);
});

test("an explicit --title still overrides the default", () => {
  const graph = createGraph({ title: "My delivery graph", source: "test", createdAt: "2026-07-03T00:00:00Z" });

  assert.equal(graph.graph.title, "My delivery graph");
  assert.deepEqual(validateGraph(graph), []);
});

test("a blank/whitespace title falls back to the default rather than producing an invalid graph", () => {
  const graph = createGraph({ title: "   ", source: "test", createdAt: "2026-07-03T00:00:00Z" });

  assert.equal(graph.graph.title, DEFAULT_GRAPH_TITLE);
  assert.deepEqual(validateGraph(graph), []);
});
