import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { glyph, isAsciiMode, relativePath, renderNextSteps, firstSentence, demandLead } from "../src/output.mjs";

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

test("renderNextSteps emits one Next section with the given items in emoji mode", () => {
  const out = renderNextSteps(["Approve to plan the graph", "or tell me what to change"], {});
  const lines = out.split("\n");
  assert.equal(lines[0], "## Next");
  // exactly one "## Next" heading in the block
  assert.equal(out.match(/^## Next$/gm).length, 1);
  assert.equal(lines[1], "👉 Approve to plan the graph");
  assert.equal(lines[2], "👉 or tell me what to change");
});

test("renderNextSteps renders the ASCII fallback with no raw emoji", () => {
  const out = renderNextSteps(["Approve to start execution"], { ascii: true });
  assert.equal(out, "## Next\n-> Approve to start execution");
  // no raw emoji leaks in ASCII mode
  assert.ok(!/\p{Emoji_Presentation}/u.test(out));
});

test("renderNextSteps never renders a blank block for an empty list", () => {
  const out = renderNextSteps([], {});
  assert.equal(out.match(/^## Next$/gm).length, 1);
  assert.ok(out.split("\n").length >= 2, "heading plus a non-empty fallback line");
  assert.match(out, /nothing to do/);
});

test("firstSentence returns the leading sentence, or the whole string when there is none", () => {
  assert.equal(firstSentence("One sentence. Two sentence."), "One sentence.");
  assert.equal(firstSentence("No punctuation here"), "No punctuation here");
  assert.equal(firstSentence("Ship it."), "Ship it."); // genuine short sentence kept
  assert.equal(firstSentence(""), "");
  assert.equal(firstSentence(undefined), "");
});

test("firstSentence does not stop on a leading abbreviation", () => {
  // "e.g." would otherwise be treated as a whole sentence; keep the full lead.
  assert.equal(firstSentence("e.g. this is the real point here"), "e.g. this is the real point here");
});

test("demandLead prefers summary, falls back to outcome, else empty", () => {
  assert.equal(demandLead({ summary: "TL;DR line", outcome: "long outcome. more." }), "**TL;DR line**");
  assert.equal(demandLead({ outcome: "Fallback works. Detail after." }), "**Fallback works.**");
  assert.equal(demandLead({}), "");
});
