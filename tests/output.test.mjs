import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { glyph, isAsciiMode, relativePath, renderNextSteps, firstSentence, demandLead, renderDemandProgressLine } from "../src/output.mjs";

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

test("glyph returns the new stage glyphs in emoji and ascii modes", () => {
  assert.equal(glyph("stage_done", {}, {}), "✅");
  assert.equal(glyph("stage_current", {}, {}), "🟡");
  assert.equal(glyph("stage_pending", {}, {}), "⚪");
  assert.equal(glyph("stage_done", { ascii: true }, {}), "[x]");
  assert.equal(glyph("stage_current", { ascii: true }, {}), "[~]");
  assert.equal(glyph("stage_pending", { ascii: true }, {}), "[ ]");
});

test("glyph returns a per-node-status glyph for every non-done/ready/blocked status", () => {
  assert.equal(glyph("proposed", {}, {}), "⚪");
  assert.equal(glyph("in_progress", {}, {}), "🟡");
  assert.equal(glyph("review", {}, {}), "🟠");
  assert.equal(glyph("done-waived", {}, {}), "🟣");
  assert.equal(glyph("proposed", { ascii: true }, {}), "[proposed]");
  assert.equal(glyph("in_progress", { ascii: true }, {}), "[in_progress]");
  assert.equal(glyph("review", { ascii: true }, {}), "[review]");
  assert.equal(glyph("done-waived", { ascii: true }, {}), "[done-waived]");
});

test("renderDemandProgressLine marks completed, current, and pending stages", () => {
  const line = renderDemandProgressLine(
    { stage: "execute", totalNodes: 7, completeNodes: 3, blockedNodes: 0 },
    {}
  );
  assert.equal(line, "Design ✅ → Plan ✅ → Execute 🟡 (3/7) → Verify ⚪ → Done ⚪");
});

test("renderDemandProgressLine omits the uninformative (0/0) fraction during plan", () => {
  const line = renderDemandProgressLine(
    { stage: "plan", requirementCount: 1, totalNodes: 0, completeNodes: 0, blockedNodes: 0 },
    {}
  );
  assert.equal(line, "Design ✅ → Plan 🟡 → Execute ⚪ → Verify ⚪ → Done ⚪");
});

test("renderDemandProgressLine renders the plan stage bare in ASCII too", () => {
  const line = renderDemandProgressLine(
    { stage: "plan", requirementCount: 1, totalNodes: 0, completeNodes: 0, blockedNodes: 0 },
    { ascii: true }
  );
  assert.equal(line, "Design [x] -> Plan [~] -> Execute [ ] -> Verify [ ] -> Done [ ]");
});

test("renderDemandProgressLine appends a blocked annotation to the active stage", () => {
  const line = renderDemandProgressLine(
    { stage: "execute", totalNodes: 7, completeNodes: 3, blockedNodes: 1 },
    {}
  );
  assert.equal(line, "Design ✅ → Plan ✅ → Execute 🟡 (3/7, 🚫1 blocked) → Verify ⚪ → Done ⚪");
});

test("renderDemandProgressLine appends an in-review annotation during execute", () => {
  const line = renderDemandProgressLine(
    { stage: "execute", totalNodes: 2, completeNodes: 0, blockedNodes: 0, reviewNodes: 1 },
    {}
  );
  assert.equal(line, "Design ✅ → Plan ✅ → Execute 🟡 (0/2, 1 in review) → Verify ⚪ → Done ⚪");
});

test("renderDemandProgressLine shows both in-review and blocked annotations together", () => {
  const line = renderDemandProgressLine(
    { stage: "execute", totalNodes: 3, completeNodes: 0, blockedNodes: 1, reviewNodes: 1 },
    {}
  );
  assert.equal(line, "Design ✅ → Plan ✅ → Execute 🟡 (0/3, 1 in review, 🚫1 blocked) → Verify ⚪ → Done ⚪");
});

test("renderDemandProgressLine does not repeat the in-review count during the verify stage", () => {
  // Once every incomplete node is in review the stage itself is `verify`, so
  // the annotation (which only fires for `execute`) must not double up there.
  const line = renderDemandProgressLine(
    { stage: "verify", totalNodes: 2, completeNodes: 1, blockedNodes: 0, reviewNodes: 1 },
    {}
  );
  assert.equal(line, "Design ✅ → Plan ✅ → Execute ✅ → Verify 🟡 (1/2) → Done ⚪");
});

test("renderDemandProgressLine renders the terminal done stage with the done glyph", () => {
  const line = renderDemandProgressLine(
    { stage: "done", totalNodes: 4, completeNodes: 4, blockedNodes: 0 },
    {}
  );
  assert.equal(line, "Design ✅ → Plan ✅ → Execute ✅ → Verify ✅ → Done 🎯");
});

test("renderDemandProgressLine renders the ASCII fallback with no raw emoji", () => {
  const line = renderDemandProgressLine(
    { stage: "verify", totalNodes: 2, completeNodes: 1, blockedNodes: 0 },
    { ascii: true }
  );
  assert.equal(line, "Design [x] -> Plan [x] -> Execute [x] -> Verify [~] (1/2) -> Done [ ]");
  assert.ok(!/\p{Emoji_Presentation}/u.test(line));
});

test("renderDemandProgressLine renders the terminal done stage in ASCII with no raw emoji", () => {
  const line = renderDemandProgressLine(
    { stage: "done", totalNodes: 4, completeNodes: 4, blockedNodes: 0 },
    { ascii: true }
  );
  assert.equal(line, "Design [x] -> Plan [x] -> Execute [x] -> Verify [x] -> Done [done]");
  assert.ok(!/\p{Emoji_Presentation}/u.test(line));
});
