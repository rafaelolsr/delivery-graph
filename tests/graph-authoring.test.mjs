import assert from "node:assert/strict";
import test from "node:test";
import {
  addDemand,
  addGap,
  addNode,
  addRequirement,
  addTrack,
  createGraph,
  nextNumericId,
  nextTrackId,
  resolveGap
} from "../src/graph-authoring.mjs";
import { validateGraph } from "../src/graph-engine.mjs";

test("creates an empty graph", () => {
  const graph = createGraph({
    title: "Authoring graph",
    source: "test",
    createdAt: "2026-06-30T00:00:00Z"
  });

  assert.equal(graph.graph.id, "DGE-001");
  assert.equal(graph.graph.status, "draft");
  assert.deepEqual(validateGraph(graph), []);
});

test("allocates next numeric ids", () => {
  assert.equal(nextNumericId([{ id: "REQ-001" }, { id: "REQ-009" }], "REQ"), "REQ-010");
});

test("allocates unique track ids from title", () => {
  assert.equal(nextTrackId([], "Validation and CI"), "TRK-validation-and-ci");
  assert.equal(
    nextTrackId([{ id: "TRK-validation-and-ci" }], "Validation and CI"),
    "TRK-validation-and-ci-2"
  );
});

test("authors demand, requirement, track, and node", () => {
  let graph = createGraph({ title: "Authoring graph" });

  ({ graph } = addDemand(graph, {
    title: "Improve delivery",
    source: "user",
    outcome: "Validated work nodes exist."
  }));
  ({ graph } = addRequirement(graph, {
    demandId: "DEM-001",
    statement: "A node can be created from a requirement.",
    acceptance: "Node references requirement",
    evidence: "Passing graph validation"
  }));
  ({ graph } = addTrack(graph, {
    title: "Implementation"
  }));
  const result = addNode(graph, {
    title: "Create node",
    type: "implementation",
    track: "TRK-implementation",
    requirements: "REQ-001",
    validation: "npm test"
  });

  assert.equal(result.record.id, "NODE-001");
  assert.deepEqual(validateGraph(result.graph), []);
});

test("unresolved blocker gaps are authorable but not graph-ready", () => {
  let graph = createGraph({ title: "Gap graph" });
  ({ graph } = addDemand(graph, {
    title: "Improve delivery",
    source: "user",
    outcome: "Validated work nodes exist."
  }));
  ({ graph } = addRequirement(graph, {
    demandId: "DEM-001",
    statement: "A node can be created from a requirement.",
    acceptance: "Node references requirement",
    evidence: "Passing graph validation"
  }));

  ({ graph } = addGap(graph, {
    type: "validation",
    severity: "blocker",
    question: "What evidence proves this?",
    blocks: "REQ-001"
  }));

  assert.match(validateGraph(graph).join("\n"), /GAP-001 is a blocker/);

  const resolved = resolveGap(graph, "GAP-001", "Use automated validation evidence.");
  assert.deepEqual(validateGraph(resolved.graph), []);
});

test("unresolved blocker gaps prevent planning artifacts", () => {
  let graph = createGraph({ title: "Blocked planning graph" });
  ({ graph } = addDemand(graph, {
    title: "Improve delivery",
    source: "user",
    outcome: "Validated work nodes exist."
  }));
  ({ graph } = addRequirement(graph, {
    demandId: "DEM-001",
    statement: "A node can be created from a requirement.",
    acceptance: "Node references requirement",
    evidence: "Passing graph validation"
  }));
  ({ graph } = addGap(graph, {
    type: "validation",
    severity: "blocker",
    question: "What evidence proves this?",
    blocks: "REQ-001"
  }));

  assert.throws(
    () => addTrack(graph, { title: "Implementation" }),
    /GAP-001 is a blocker/
  );
  assert.throws(
    () => addNode(graph, {
      title: "Create node",
      type: "implementation",
      track: "TRK-implementation",
      requirements: "REQ-001",
      validation: "npm test"
    }),
    /GAP-001 is a blocker/
  );
});
