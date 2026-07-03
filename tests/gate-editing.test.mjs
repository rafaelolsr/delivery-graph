import assert from "node:assert/strict";
import test from "node:test";
import { buildDemandView, renderDemandView } from "../src/show-renderer.mjs";
import { buildGraphBrief } from "../src/brief-renderer.mjs";

// DEM-008 / NODE-028: the two judgment gates are an edit -> CLI mutation -> re-render
// loop, and a reintroduced blocker gap must be visible so it blocks approval. These
// tests prove the render side of that loop (the CLI mutation side is add/resolve-gap,
// tested elsewhere) and that both briefs surface blocker gaps.

function graphWith(overrides = {}) {
  return {
    graph: { id: "DGE-001", title: "Gate", status: "active" },
    demands: [{ id: "DEM-001", title: "D", source: "t", outcome: "o" }],
    requirements: [
      { id: "REQ-001", demand_id: "DEM-001", statement: "keep", priority: "must", acceptance: ["a"], validation: { method: "automated-test", required_evidence: ["e"] } },
      { id: "REQ-002", demand_id: "DEM-001", statement: "maybe drop", priority: "should", acceptance: ["a"], validation: { method: "automated-test", required_evidence: ["e"] } }
    ],
    gaps: [],
    tracks: [{ id: "TRK-x", title: "X" }],
    nodes: [{
      id: "NODE-001", title: "n", type: "implementation", track: "TRK-x",
      requirement_ids: ["REQ-001"], depends_on: [], status: "ready",
      validation: { required: ["v"], evidence_path: "delivery-graph/demands/DEM-001/evidence/NODE-001/" },
      sync: { linear_issue_id: null, ado_task_id: null }
    }],
    ...overrides
  };
}

test("editing the demand (dropping a requirement) changes the re-rendered brief", () => {
  const before = renderDemandView(buildDemandView("/tmp/x/g.json", graphWith(), "DEM-001"), { ascii: true });
  assert.match(before, /REQ-002/);

  // Simulate the CLI mutation "drop REQ-002" by re-building from the mutated graph.
  const mutated = graphWith();
  mutated.requirements = mutated.requirements.filter((r) => r.id !== "REQ-002");
  const after = renderDemandView(buildDemandView("/tmp/x/g.json", mutated, "DEM-001"), { ascii: true });

  assert.doesNotMatch(after, /REQ-002/, "re-rendered brief reflects the edit");
  assert.match(after, /REQ-001/, "unrelated requirement is untouched");
});

test("the Demand Brief (gate 1) renders non-goals and problem so the human can judge scope", () => {
  // F4: gate 1 is the approve/reject artifact; it must show more than title+outcome.
  const g = graphWith();
  g.demands[0].problem = "the command palette burden";
  g.demands[0].non_goals = ["not rewriting the skills", "not real tracker writes"];

  const view = buildDemandView("/tmp/x/g.json", g, "DEM-001");
  assert.equal(view.demand.problem, "the command palette burden");
  assert.deepEqual(view.demand.non_goals, ["not rewriting the skills", "not real tracker writes"]);

  const md = renderDemandView(view, { ascii: true });
  assert.match(md, /problem: the command palette burden/);
  assert.match(md, /non-goals:/);
  assert.match(md, /not rewriting the skills/);
});

test("a reintroduced blocker gap surfaces in the Demand Brief (gate 1) so it blocks approval", () => {
  const g = graphWith({
    gaps: [{ id: "GAP-001", type: "validation", severity: "blocker", question: "unresolved?", blocks: ["REQ-001"], resolution: null }]
  });
  const view = buildDemandView("/tmp/x/g.json", g, "DEM-001");
  assert.equal(view.blocker_gaps.length, 1);
  assert.equal(view.blocker_gaps[0].id, "GAP-001");

  const md = renderDemandView(view, { ascii: true });
  assert.match(md, /blocker gaps/i);
  assert.match(md, /GAP-001/);
  assert.match(md, /before approval/i);
});

test("a resolved gap does not block approval", () => {
  const g = graphWith({
    gaps: [{ id: "GAP-001", type: "validation", severity: "blocker", question: "q", blocks: ["REQ-001"], resolution: "handled" }]
  });
  const view = buildDemandView("/tmp/x/g.json", g, "DEM-001");
  assert.equal(view.blocker_gaps.length, 0, "resolved gaps are not approval blockers");
});

test("the Graph Brief (gate 2) also surfaces unresolved blocker gaps", () => {
  const g = graphWith({
    gaps: [{ id: "GAP-002", type: "scope", severity: "blocker", question: "scope?", blocks: ["REQ-001"], resolution: null }]
  });
  const brief = buildGraphBrief("/tmp/x/g.json", g, "DEM-001");
  assert.equal(brief.blocker_gaps.length, 1);
  assert.equal(brief.blocker_gaps[0].id, "GAP-002");
});
