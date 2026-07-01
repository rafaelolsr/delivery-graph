import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { glyph, isAsciiMode, relativePath } from "../src/output.mjs";

test("glyph returns emoji by default", () => {
  assert.equal(glyph("done", {}, {}), "🎯");
  assert.equal(glyph("pass", {}, {}), "✅");
});

test("glyph returns ascii fallback under --ascii", () => {
  assert.equal(glyph("done", { ascii: true }, {}), "[done]");
  assert.equal(glyph("pass", { ascii: true }, {}), "[ok]");
});

test("glyph returns ascii fallback under NO_EMOJI env", () => {
  assert.equal(glyph("done", {}, { NO_EMOJI: "1" }), "[done]");
  assert.equal(glyph("done", {}, { NO_EMOJI: "true" }), "[done]");
});

test("NO_EMOJI=0 or empty does not force ascii", () => {
  assert.equal(isAsciiMode({}, { NO_EMOJI: "0" }), false);
  assert.equal(isAsciiMode({}, { NO_EMOJI: "" }), false);
  assert.equal(isAsciiMode({}, {}), false);
});

test("unknown glyph name returns empty string", () => {
  assert.equal(glyph("nope", {}, {}), "");
});

test("relativePath strips the graph root - never absolute", () => {
  const graphPath = "/Users/x/proj/delivery-graph/graph.json";
  const target = "/Users/x/proj/delivery-graph/evidence/NODE-001/verification.md";
  const rel = relativePath(target, graphPath);
  assert.equal(rel, path.join("delivery-graph", "evidence", "NODE-001", "verification.md"));
  assert.equal(path.isAbsolute(rel), false);
  assert.ok(!rel.includes("/Users/x/proj"));
});

test("relativePath falls back to basename for paths outside the root", () => {
  const graphPath = "/Users/x/proj/delivery-graph/graph.json";
  const target = "/tmp/somewhere/else.md";
  assert.equal(relativePath(target, graphPath), "else.md");
});
