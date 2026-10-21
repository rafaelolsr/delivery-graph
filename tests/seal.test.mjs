import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyNode, addEvidence } from "../src/evidence-engine.mjs";
import { setupSigning } from "../src/signing.mjs";
import { mintSeal, canonicalContractBytes } from "../src/seal.mjs";

// DEM-020 Track 1 / NODE-080 (REQ-085): the HMAC seal makes a node's validation
// contract tamper-evident. The decisive test is a RED-TEAM attack that MUST fail:
// weaken a sealed node's contract, then assert verifyNode refuses on the broken
// seal BEFORE it ever reaches the evidence-completeness check.

// A tmp repo with a real signing key so seals actually compute against key bytes.
function sealedRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dge-seal-"));
  fs.writeFileSync(path.join(repoRoot, ".gitignore"), ".dge/\n");
  const res = setupSigning({ repoRoot });
  assert.equal(res.ok, true, "signing key set up for the test repo");
  return repoRoot;
}

// A graph with seal enforcement ON and NODE-001 sealed over its current contract.
// Evidence is pre-satisfied so that, absent the seal gate, verifyNode would pass —
// this is what proves the seal gate fires FIRST.
function makeSealedGraph(repoRoot, graphPath, { acceptance = ["The seal breaks when the contract changes."] } = {}) {
  const graph = {
    graph: { id: "DGE-001", title: "Seal graph", status: "active", settings: { require_seal: true } },
    demands: [{ id: "DEM-001", title: "Seal", source: "test", outcome: "Contract is sealed." }],
    requirements: [
      {
        id: "REQ-001",
        demand_id: "DEM-001",
        statement: "Contract is tamper-evident.",
        acceptance,
        validation: { method: "automated-test", required_evidence: ["node --test output"] }
      }
    ],
    gaps: [],
    tracks: [{ id: "TRK-validation", title: "Validation" }],
    nodes: [
      {
        id: "NODE-001",
        title: "Sealed node",
        type: "test",
        track: "TRK-validation",
        requirement_ids: ["REQ-001"],
        depends_on: [],
        status: "review",
        validation: {
          required: ["npm test"],
          evidence_path: "delivery-graph/demands/DEM-001/evidence/NODE-001/"
        },
        sync: { linear_issue_id: null, ado_task_id: null }
      }
    ]
  };
  // Seal the node over its current (honest) contract.
  graph.nodes[0].validation.seal = mintSeal(graph, graph.nodes[0], {
    sealedBy: "human@test",
    sealedAt: "2026-08-04T00:00:00Z",
    repoRoot
  });
  // Satisfy the evidence so ONLY the seal gate can block verification.
  addEvidence(graphPath, graph, "NODE-001", {
    summary: "npm test passed",
    satisfies: "npm test",
    result: "pass",
    createdAt: "2026-08-04T00:00:00Z"
  });
  return graph;
}

// ── The decisive red-team test ───────────────────────────────────────────────

test("RED TEAM: weakening a sealed node's validation.required makes verify refuse on the broken seal — before the evidence check", () => {
  const repoRoot = sealedRepo();
  try {
    const graphPath = path.join(repoRoot, "delivery-graph", "graph.json");
    const graph = makeSealedGraph(repoRoot, graphPath);

    // Adversarial builder weakens the contract AFTER sealing.
    graph.nodes[0].validation.required = ["echo ok"];

    assert.throws(
      () => verifyNode(graphPath, graph, "NODE-001", { repoRoot }),
      (err) => /seal broken/.test(err.message) && /cannot be verified/.test(err.message),
      "verify must refuse with a broken-seal error, not an evidence error"
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("altering a traced requirement's acceptance prose (required left intact) also breaks the seal", () => {
  const repoRoot = sealedRepo();
  try {
    const graphPath = path.join(repoRoot, "delivery-graph", "graph.json");
    const graph = makeSealedGraph(repoRoot, graphPath);

    // required is untouched; only the requirement's acceptance changes.
    graph.requirements[0].acceptance = ["A weaker bar."];

    assert.throws(
      () => verifyNode(graphPath, graph, "NODE-001", { repoRoot }),
      /seal broken/,
      "acceptance-prose tampering must break the seal even with required intact"
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("a meaning-preserving re-save (whitespace + acceptance reorder) does NOT break the seal", () => {
  const repoRoot = sealedRepo();
  try {
    const graphPath = path.join(repoRoot, "delivery-graph", "graph.json");
    // Two acceptance criteria so a reorder is observable; seal must be order-blind.
    const graph = makeSealedGraph(repoRoot, graphPath, {
      acceptance: ["Alpha criterion.", "Beta criterion."]
    });

    // Meaning-preserving edits: reorder acceptance and add incidental whitespace —
    // NOT touching the single required item the evidence is keyed on, so this test
    // isolates the SEAL's whitespace/order-blindness from the evidence match.
    graph.requirements[0].acceptance = [" Beta   criterion. ", "Alpha criterion."];

    const verified = verifyNode(graphPath, graph, "NODE-001", { repoRoot });
    assert.equal(verified.graph.nodes[0].status, "verified", "meaning-preserving re-save keeps the seal valid");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

// ── Fail-closed cases ────────────────────────────────────────────────────────

test("fail-closed: a missing seal blocks verification when require_seal is on", () => {
  const repoRoot = sealedRepo();
  try {
    const graphPath = path.join(repoRoot, "delivery-graph", "graph.json");
    const graph = makeSealedGraph(repoRoot, graphPath);
    delete graph.nodes[0].validation.seal;

    assert.throws(
      () => verifyNode(graphPath, graph, "NODE-001", { repoRoot }),
      /seal missing/,
      "an unsealed node cannot verify under enforcement"
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("fail-closed: a present seal is uncheckable (blocks) when the signing key is absent", () => {
  const repoRoot = sealedRepo();
  try {
    const graphPath = path.join(repoRoot, "delivery-graph", "graph.json");
    const graph = makeSealedGraph(repoRoot, graphPath);
    // Remove the key: the seal can no longer be recomputed.
    fs.rmSync(path.join(repoRoot, ".dge", "signing.key"));

    assert.throws(
      () => verifyNode(graphPath, graph, "NODE-001", { repoRoot }),
      /seal uncheckable/,
      "an uncheckable seal must block, never be silently trusted"
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

// ── Opt-in: default OFF keeps existing behavior ──────────────────────────────

test("require_seal off (default): verify ignores the seal entirely", () => {
  const repoRoot = sealedRepo();
  try {
    const graphPath = path.join(repoRoot, "delivery-graph", "graph.json");
    const graph = makeSealedGraph(repoRoot, graphPath);
    graph.graph.settings.require_seal = false;
    // Corrupt the SEAL itself (not the evidence-keyed required item): with
    // enforcement off, verify must ignore the broken seal entirely and pass on
    // the still-satisfied evidence.
    graph.nodes[0].validation.seal.digest = "deadbeef";

    const verified = verifyNode(graphPath, graph, "NODE-001", { repoRoot });
    assert.equal(verified.graph.nodes[0].status, "verified", "seal is not enforced when the toggle is off");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
