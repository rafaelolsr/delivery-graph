import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addEvidence,
  getEvidenceStatus,
  verifyNode
} from "../src/evidence-engine.mjs";

test("adds evidence and verifies a node", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  const added = addEvidence(graphPath, graph, "NODE-001", {
    kind: "command",
    summary: "npm test passed",
    satisfies: "npm test",
    createdAt: "2026-06-30T00:00:00Z"
  });

  assert.equal(added.record.id, "EVD-001");
  assert.equal(getEvidenceStatus(graphPath, graph, graph.nodes[0]).complete, true);

  const verified = verifyNode(graphPath, graph, "NODE-001", {
    updatedAt: "2026-06-30T00:00:00Z"
  });
  assert.equal(verified.graph.nodes[0].status, "verified");
});

test("verify fails when evidence is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  assert.throws(
    () => verifyNode(graphPath, graph, "NODE-001"),
    /missing validation evidence: npm test/
  );
});

test("evidence must satisfy the node validation contract", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  assert.throws(
    () => addEvidence(graphPath, graph, "NODE-001", {
      summary: "wrong check",
      satisfies: "npm run unrelated"
    }),
    /validation contract does not include/
  );
});

function makeGraph() {
  return {
    graph: {
      id: "DGE-001",
      title: "Evidence graph",
      status: "active"
    },
    demands: [
      {
        id: "DEM-001",
        title: "Evidence",
        source: "test",
        outcome: "Verification requires proof."
      }
    ],
    requirements: [
      {
        id: "REQ-001",
        demand_id: "DEM-001",
        statement: "Evidence gates verification.",
        acceptance: ["Evidence exists."],
        validation: {
          method: "automated-test",
          required_evidence: ["node --test output"]
        }
      }
    ],
    gaps: [],
    tracks: [
      {
        id: "TRK-validation",
        title: "Validation"
      }
    ],
    nodes: [
      {
        id: "NODE-001",
        title: "Verify evidence",
        type: "test",
        track: "TRK-validation",
        requirement_ids: ["REQ-001"],
        depends_on: [],
        status: "review",
        validation: {
          required: ["npm test"],
          evidence_path: "delivery-graph/evidence/NODE-001/"
        },
        sync: {
          linear_issue_id: null,
          ado_task_id: null
        }
      }
    ]
  };
}

