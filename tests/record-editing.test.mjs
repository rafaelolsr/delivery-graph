import assert from "node:assert/strict";
import test from "node:test";
import {
  addDemand, addRequirement, addTrack, addNode, addGap,
  removeRequirement, editRequirement, editDemand
} from "../src/graph-authoring.mjs";

// DEM-009: a mis-authored requirement or demand field must be correctable via the
// CLI engine — without remove-demand (which nukes the whole demand) and without
// hand-editing graph.json.

function baseGraph() {
  let g = { graph: { id: "DGE-001", title: "t", status: "draft" }, demands: [], requirements: [], gaps: [], tracks: [], nodes: [] };
  g = addDemand(g, { title: "d", source: "s", outcome: "o" }).graph;
  g = addRequirement(g, { demandId: "DEM-001", statement: "first", acceptance: ["a"], evidence: "e" }).graph;   // REQ-001
  g = addRequirement(g, { demandId: "DEM-001", statement: "second", acceptance: ["a"], evidence: "e" }).graph;  // REQ-002
  g = addTrack(g, { title: "V" }).graph;
  g = addNode(g, { title: "N", type: "test", track: "TRK-v", requirements: "REQ-002", validation: "x" }).graph; // references REQ-002
  return g;
}

// --- removeRequirement (REQ-037) ---

test("removeRequirement deletes an unreferenced requirement and stays valid", () => {
  const { graph } = removeRequirement(baseGraph(), "REQ-001");
  assert.deepEqual(graph.requirements.map((r) => r.id), ["REQ-002"]);
});

test("removeRequirement refuses a requirement a node still references", () => {
  assert.throws(
    () => removeRequirement(baseGraph(), "REQ-002"),
    /cannot be removed; these nodes reference it: NODE-001/
  );
});

test("removeRequirement drops a gap that blocked only it, and prunes it from a shared gap", () => {
  let g = baseGraph();
  g = addGap(g, { type: "validation", severity: "major", question: "only REQ-001", blocks: ["REQ-001"] }).graph;      // GAP-001
  g = addGap(g, { type: "validation", severity: "major", question: "both", blocks: ["REQ-001", "REQ-002"] }).graph;   // GAP-002
  const { graph } = removeRequirement(g, "REQ-001");
  // GAP-001 (blocked only REQ-001) is gone; GAP-002 remains but no longer references REQ-001.
  assert.deepEqual(graph.gaps.map((x) => x.id), ["GAP-002"]);
  assert.deepEqual(graph.gaps[0].blocks, ["REQ-002"]);
});

test("removeRequirement rejects an unknown id", () => {
  assert.throws(() => removeRequirement(baseGraph(), "REQ-999"), /not found/);
});

// --- editRequirement (REQ-038) ---

test("editRequirement changes statement and priority, leaving identity fields intact", () => {
  const { record } = editRequirement(baseGraph(), "REQ-001", { statement: "edited", priority: "should" });
  assert.equal(record.statement, "edited");
  assert.equal(record.priority, "should");
  assert.equal(record.id, "REQ-001");
  assert.equal(record.demand_id, "DEM-001"); // never changed
});

test("editRequirement updates only the provided fields", () => {
  const { record } = editRequirement(baseGraph(), "REQ-001", { priority: "could" });
  assert.equal(record.priority, "could");
  assert.equal(record.statement, "first"); // untouched
});

test("editRequirement rejects an invalid priority (schema enforced, not silently stored)", () => {
  assert.throws(
    () => editRequirement(baseGraph(), "REQ-001", { priority: "urgent" }),
    /schema|priority/i
  );
});

test("editRequirement rejects an empty statement", () => {
  assert.throws(() => editRequirement(baseGraph(), "REQ-001", { statement: "  " }), /statement is required/);
});

// --- editDemand (REQ-039) ---

test("editDemand adds non-goals and constraints to a demand created without them", () => {
  const { record } = editDemand(baseGraph(), "DEM-001", { nonGoals: "ng one", constraints: "c one" });
  assert.deepEqual(record.non_goals, ["ng one"]);
  assert.deepEqual(record.constraints, ["c one"]);
});

test("editDemand replaces problem and outcome, leaving id/title/source intact", () => {
  const { record } = editDemand(baseGraph(), "DEM-001", { problem: "the pain", outcome: "the win" });
  assert.equal(record.problem, "the pain");
  assert.equal(record.outcome, "the win");
  assert.equal(record.id, "DEM-001");
  assert.equal(record.title, "d");
  assert.equal(record.source, "s");
});

test("editDemand rejects an empty outcome", () => {
  assert.throws(() => editDemand(baseGraph(), "DEM-001", { outcome: "" }), /outcome is required/);
});
