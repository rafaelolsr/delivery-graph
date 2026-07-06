import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildDemandView, renderDemandView } from "../src/show-renderer.mjs";
import { buildGraphBrief, renderGraphBrief } from "../src/brief-renderer.mjs";
import { renderStatus } from "../src/status-renderer.mjs";
import { renderSetup } from "../src/setup.mjs";
import { renderNextSteps } from "../src/output.mjs";

// DEM-013 / NODE-053 — the enforced "template". Every user-facing surface DGE
// renders must share one skeleton: a bold lead line and exactly one "## Next"
// section. This guard iterates the surfaces and asserts the skeleton on each, in
// both emoji and ASCII modes, so a future renderer that forgets the shape fails
// here rather than shipping an inconsistent output. This test IS the template —
// it makes the convention enforced, not merely intended.

function graphFixture() {
  return {
    graph: { id: "DGE-001", title: "Skeleton graph", status: "active" },
    demands: [{
      id: "DEM-001",
      title: "A demand",
      source: "test",
      summary: "One-line TL;DR that becomes the bold lead.",
      outcome: "Outcome sentence one. Outcome sentence two.",
      non_goals: ["not this"]
    }],
    requirements: [{
      id: "REQ-001", demand_id: "DEM-001", statement: "s", priority: "must",
      acceptance: ["a"], validation: { method: "automated-test", required_evidence: ["e"] }
    }],
    gaps: [],
    tracks: [{ id: "TRK-x", title: "X" }],
    nodes: [{
      id: "NODE-001", title: "Do the work", type: "implementation", track: "TRK-x",
      requirement_ids: ["REQ-001"], depends_on: [], status: "ready",
      validation: { required: ["v"], evidence_path: "delivery-graph/demands/DEM-001/evidence/NODE-001/" },
      sync: { linear_issue_id: null, ado_task_id: null }
    }]
  };
}

// A review report render, mirroring what reviewGraph produces (renderReviewMarkdown
// is module-private; reviewGraph is the public entry that writes it). We render via
// reviewGraph against a temp store so the guard exercises the real code path.
import { reviewGraph } from "../src/review-engine.mjs";

function reviewRender(graph, options) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-skel-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  fs.writeFileSync(graphPath, JSON.stringify(graph));
  const { markdown } = reviewGraph(graphPath, graph, { ...options, generatedAt: "2026-01-01T00:00:00Z" });
  fs.rmSync(tempDir, { recursive: true, force: true });
  return markdown;
}

// Each surface as (name, render function taking options). graphPath-scoped renders
// use a temp store written per-call so has_evidence checks don't throw.
function surfaces(options) {
  const graph = graphFixture();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-skel-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  fs.writeFileSync(graphPath, JSON.stringify(graph));

  const setupResult = {
    ok: true,
    installed: [{ harness: "claude", installed: ["dge-intake"], skipped: [], skillsDir: ".claude/skills" }]
  };

  const rendered = [
    ["demand brief", renderDemandView(buildDemandView(graphPath, graph, "DEM-001"), options)],
    ["graph brief", renderGraphBrief(buildGraphBrief(graphPath, graph, "DEM-001"), options)],
    ["status board", renderStatus(graph, options)],
    ["review report", reviewRender(graph, options)],
    ["setup output", renderSetup(setupResult, options)]
  ];
  fs.rmSync(tempDir, { recursive: true, force: true });
  return rendered;
}

// A bold lead is a line that is entirely **...** (markdown bold), non-empty.
function hasBoldLead(text) {
  return text.split("\n").some((line) => /^\*\*.+\*\*$/.test(line.trim()));
}

function nextCount(text) {
  return (text.match(/^## Next$/gm) ?? []).length;
}

for (const mode of [{ label: "emoji", options: {} }, { label: "ascii", options: { ascii: true } }]) {
  test(`every surface has a bold lead and exactly one Next section (${mode.label} mode)`, () => {
    for (const [name, text] of surfaces(mode.options)) {
      assert.ok(hasBoldLead(text), `${name} (${mode.label}) is missing a bold lead line`);
      assert.equal(nextCount(text), 1, `${name} (${mode.label}) must have exactly one "## Next" section`);
    }
  });
}

test("ascii mode never leaks raw emoji into any surface", () => {
  for (const [name, text] of surfaces({ ascii: true })) {
    assert.ok(!/\p{Emoji_Presentation}/u.test(text), `${name} leaked a raw emoji in ascii mode`);
  }
});

// The guard actually guards: a renderer that violates the skeleton fails it. We
// simulate a "broken renderer" — output with no bold lead and two Next sections —
// and prove the same assertions the guard uses reject it.
test("the guard rejects a renderer that breaks the skeleton", () => {
  const broken = ["# Title", "plain lead, not bold", renderNextSteps(["a"]), renderNextSteps(["b"])].join("\n");
  assert.equal(hasBoldLead(broken), false); // no bold lead -> would fail the guard
  assert.equal(nextCount(broken), 2);       // two Next sections -> would fail the guard
});
