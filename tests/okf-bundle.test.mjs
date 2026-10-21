import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { graphToBundle, writeBundle } from "../src/okf-bundle.mjs";
import { parseConcept, splitFrontmatter, OKF_VERSION } from "../src/okf-concept.mjs";

function sampleGraph() {
  return {
    graph: { id: "DEM-021", title: "OKF knowledge core", status: "active" },
    demands: [
      {
        id: "DEM-021",
        title: "OKF knowledge core",
        summary: "OKF v0.2 bundle projection.",
        outcome: "A projection exists.",
        constraints: ["graph.json stays canonical"],
        non_goals: ["the governor"]
      }
    ],
    requirements: [
      {
        id: "REQ-091",
        demand_id: "DEM-021",
        statement: "Add a bundle generator.",
        priority: "must",
        acceptance: ["emits concepts", "emits index.md"]
      }
    ],
    gaps: [],
    tracks: [{ id: "TRK-implementation", title: "Implementation" }],
    nodes: [
      {
        id: "NODE-087",
        title: "Implement the OKF bundle generator",
        type: "implementation",
        track: "TRK-implementation",
        requirement_ids: ["REQ-091"],
        depends_on: ["NODE-086"],
        status: "in_progress",
        validation: {
          required: ["npm test proves the generator emits an okf_version index.md"],
          evidence_path: "delivery-graph/demands/DEM-021/evidence/NODE-087/"
        }
      },
      {
        id: "NODE-086",
        title: "Serializer",
        type: "implementation",
        track: "TRK-implementation",
        requirement_ids: ["REQ-091"],
        depends_on: [],
        status: "done",
        validation: { required: ["serializer round-trips"], evidence_path: "x/" }
      }
    ]
  };
}

test("generator emits a concept .md per demand, requirement, and node", () => {
  const bundle = graphToBundle(sampleGraph());
  assert.ok(bundle["intents/DEM-021.md"], "intent concept");
  assert.ok(bundle["requirements/REQ-091.md"], "requirement concept");
  assert.ok(bundle["tasks/NODE-087.md"], "task concept");
  assert.ok(bundle["tasks/NODE-086.md"], "task concept");
});

test("every emitted concept has parseable frontmatter with a non-empty type (SPEC §4.1/§11)", () => {
  const bundle = graphToBundle(sampleGraph());
  for (const [name, content] of Object.entries(bundle)) {
    if (name === "index.md") continue; // index.md is a reserved file (§8), tested separately
    const parsed = parseConcept(content);
    assert.ok(typeof parsed.type === "string" && parsed.type.length > 0, `${name} has a type`);
  }
});

test("root index.md carries okf_version and references the canonical graph (SPEC §8, §12)", () => {
  const bundle = graphToBundle(sampleGraph());
  const index = bundle["index.md"];
  assert.ok(index, "index.md emitted");
  // Only the root index.md may carry frontmatter, and only okf_version (§8/§12).
  const { frontmatter } = splitFrontmatter(index);
  assert.match(frontmatter, new RegExp(`okf_version:\\s*"${OKF_VERSION}"`));
  assert.match(index, /graph\.json/);
  assert.match(index, /# Intents/);
  assert.match(index, /# Tasks/);
});

test("a node's validation contract maps to an Attested Computation with executor.receipt and attester (SPEC §10.2)", () => {
  const bundle = graphToBundle(sampleGraph());
  const contract = bundle["computations/NODE-087-contract.md"];
  assert.ok(contract, "contract concept emitted");
  const parsed = parseConcept(contract);
  assert.equal(parsed.type, "Attested Computation");
  assert.ok(parsed.runtime, "declares a runtime (§10.2)");
  assert.ok(Array.isArray(parsed.executor.receipt) && parsed.executor.receipt.length > 0, "executor.receipt declares evidence fields");
  assert.ok(parsed.attester.resource, "attester names the independent check");
  // The DGE contract items live under the extension, not overloaded onto native fields.
  assert.deepEqual(parsed["x-dge"].required, ["npm test proves the generator emits an okf_version index.md"]);
});

test("dependencies become bundle-relative markdown links (SPEC §6.1)", () => {
  const bundle = graphToBundle(sampleGraph());
  const task = bundle["tasks/NODE-087.md"];
  assert.match(task, /# Depends on/);
  assert.match(task, /\[NODE-086\]\(\/tasks\/NODE-086\.md\)/);
});

test("DGE-only node fields are under x-dge, never native top-level keys", () => {
  const bundle = graphToBundle(sampleGraph());
  const parsed = parseConcept(bundle["tasks/NODE-087.md"]);
  assert.equal(parsed["x-dge"].id, "NODE-087");
  assert.equal(parsed["x-dge"].status, "in_progress"); // precise DGE status under ext
  assert.equal(parsed.status, "draft"); // coarse native lifecycle hint (§5.4), not the DGE status
  assert.equal(parsed.track, undefined, "DGE track must not be a native key");
});

test("the projection is deterministic (same graph -> byte-identical bundle)", () => {
  const a = graphToBundle(sampleGraph());
  const b = graphToBundle(sampleGraph());
  assert.deepEqual(Object.keys(a), Object.keys(b));
  for (const k of Object.keys(a)) assert.equal(a[k], b[k], `${k} stable`);
});

test("writeBundle writes files under delivery-graph/okf and NEVER writes back to graph.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "okf-bundle-"));
  try {
    const dgDir = path.join(dir, "delivery-graph");
    fs.mkdirSync(dgDir, { recursive: true });
    const graphPath = path.join(dgDir, "graph.json");
    const graph = sampleGraph();
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));
    const before = fs.readFileSync(graphPath);

    const written = writeBundle(graphPath, graph);

    // Bundle files exist under delivery-graph/okf.
    assert.ok(written.length >= 5);
    assert.ok(fs.existsSync(path.join(dgDir, "okf", "index.md")));
    assert.ok(fs.existsSync(path.join(dgDir, "okf", "tasks", "NODE-087.md")));
    // graph.json is byte-identical — the projection never writes back (ADR-001 D1/D2).
    const after = fs.readFileSync(graphPath);
    assert.ok(before.equals(after), "graph.json must be byte-identical after writeBundle");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
