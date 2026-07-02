import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrateStore } from "../src/store-migration.mjs";

function setupFlatStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-migrate-"));
  const root = path.join(tempDir, "delivery-graph");
  const write = (rel, contents) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
  };

  write("demands/DEM-001.md", "# DEM-001");
  write("requirements/REQ-001.md", "# REQ-001");
  write("evidence/NODE-001/evidence.json", JSON.stringify({ node_id: "NODE-001", items: [] }));
  write("evidence/NODE-001/artifacts/EVD-001.json", "{}");

  const graph = {
    graph: { id: "DGE-001", title: "Migrate", status: "active" },
    demands: [{ id: "DEM-001", title: "D", source: "test", outcome: "o" }],
    requirements: [
      {
        id: "REQ-001",
        demand_id: "DEM-001",
        statement: "s",
        acceptance: ["a"],
        validation: { method: "automated-test", required_evidence: ["e"] }
      }
    ],
    gaps: [],
    tracks: [{ id: "TRK-x", title: "X" }],
    nodes: [
      {
        id: "NODE-001",
        title: "n",
        type: "implementation",
        track: "TRK-x",
        requirement_ids: ["REQ-001"],
        depends_on: [],
        status: "done",
        validation: { required: ["x"], evidence_path: "delivery-graph/evidence/NODE-001/" },
        sync: { linear_issue_id: null, ado_task_id: null }
      }
    ]
  };
  return { tempDir, root, graph, graphPath: path.join(root, "graph.json") };
}

test("migrates a flat store into the demand-centric layout", () => {
  const { root, graph, graphPath } = setupFlatStore();
  const { graph: migrated, removedDirs } = migrateStore(graph, graphPath);

  // Files relocated under the owning demand.
  assert.ok(fs.existsSync(path.join(root, "demands", "DEM-001", "DEM-001.md")));
  assert.ok(fs.existsSync(path.join(root, "demands", "DEM-001", "requirements", "REQ-001.md")));
  assert.ok(fs.existsSync(path.join(root, "demands", "DEM-001", "evidence", "NODE-001", "evidence.json")));
  // Artifacts (relative refs) survive the directory move.
  assert.ok(
    fs.existsSync(path.join(root, "demands", "DEM-001", "evidence", "NODE-001", "artifacts", "EVD-001.json"))
  );

  // evidence_path rewritten to the demand-scoped form.
  assert.equal(
    migrated.nodes[0].validation.evidence_path,
    "delivery-graph/demands/DEM-001/evidence/NODE-001/"
  );

  // No orphaned flat dirs remain.
  assert.equal(fs.existsSync(path.join(root, "requirements")), false);
  assert.equal(fs.existsSync(path.join(root, "evidence")), false);
  assert.deepEqual(removedDirs.sort(), ["delivery-graph/evidence", "delivery-graph/requirements"]);
});

test("migration is idempotent on an already-migrated store", () => {
  const { graph, graphPath } = setupFlatStore();
  const { graph: once } = migrateStore(graph, graphPath);
  const { graph: twice, moves } = migrateStore(once, graphPath);
  assert.equal(moves.length, 0);
  assert.equal(twice.nodes[0].validation.evidence_path, "delivery-graph/demands/DEM-001/evidence/NODE-001/");
});
