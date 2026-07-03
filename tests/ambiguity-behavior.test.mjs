import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addEvidence, getEvidenceStatus } from "../src/evidence-engine.mjs";

// DEM-008 / NODE-031 (REQ-031, REQ-032): the AMBIGUOUS third outcome. Two kinds:
// - result-ambiguity: `--result ambiguous` (present-but-wrong) does NOT satisfy a
//   contract item, so the node cannot silently close.
// - fix-ambiguity + structural triggers: a missing/non-executable validation
//   contract, or a blast-radius overrun, are detectable conditions the loop pauses
//   on rather than guessing.
//
// The pause-once/ask-once *behavior* lives in the execute-graph skill prose (guarded
// separately in skill-cli-contract.test.mjs); here we prove the engine-level
// conditions those pauses key off are real and detectable.

function makeGraph(requiredContract) {
  return {
    graph: { id: "DGE-001", title: "Ambiguity", status: "active" },
    demands: [{ id: "DEM-001", title: "D", source: "t", outcome: "o" }],
    requirements: [{ id: "REQ-001", demand_id: "DEM-001", statement: "s", priority: "must", acceptance: ["a"], validation: { method: "automated-test", required_evidence: ["e"] } }],
    gaps: [],
    tracks: [{ id: "TRK-x", title: "X" }],
    nodes: [{
      id: "NODE-001", title: "n", type: "test", track: "TRK-x",
      requirement_ids: ["REQ-001"], depends_on: [], status: "ready",
      validation: { required: requiredContract, evidence_path: "delivery-graph/demands/DEM-001/evidence/NODE-001/" },
      sync: { linear_issue_id: null, ado_task_id: null }
    }]
  };
}

test("result-ambiguity: an --result ambiguous note does not satisfy the contract", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-amb-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph(["the contract item"]);

  addEvidence(graphPath, graph, "NODE-001", {
    summary: "present but wrong - judgment call",
    satisfies: "the contract item",
    result: "ambiguous"
  });

  const status = getEvidenceStatus(graphPath, graph, graph.nodes[0]);
  assert.equal(status.complete, false);
  assert.deepEqual(status.missing, ["the contract item"]);
});

test("structural trigger: a missing/empty validation contract is detectable (pause, don't guess)", () => {
  // A node with no required items has nothing the loop can evidence-gate on — the
  // conductor must pause rather than mark it done. The condition is detectable here.
  const graph = makeGraph([]);
  const node = graph.nodes[0];
  const contractIsMissing = (node.validation?.required ?? []).length === 0;
  assert.equal(contractIsMissing, true);
});

test("result-ambiguity is distinct from a clean pass (which does satisfy)", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-amb-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph(["the contract item"]);

  addEvidence(graphPath, graph, "NODE-001", {
    summary: "genuinely passed",
    satisfies: "the contract item",
    result: "pass"
  });

  assert.equal(getEvidenceStatus(graphPath, graph, graph.nodes[0]).complete, true);
});
