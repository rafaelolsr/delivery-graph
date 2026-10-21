import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setupSigning } from "../src/signing.mjs";
import { verifyNode, addEvidence, readEvidenceManifest, writeEvidenceManifest } from "../src/evidence-engine.mjs";
import { writeHoldout, holdoutStatus, holdoutPath } from "../src/holdout.mjs";

// DEM-020 Track 3 / NODE-083 (REQ-088): holdout criteria the builder never sees.
// Contract:
//   1. A build passing all builder-visible criteria but failing a holdout one is
//      refused at verify.
//   2. Holdout criteria text never appears in graph.json — only holdout_digest.
//   3. A node with no holdout reports `none`, not a silent pass.

function repo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dge-holdout-"));
  fs.writeFileSync(path.join(repoRoot, ".gitignore"), ".dge/\n");
  setupSigning({ repoRoot });
  return repoRoot;
}

// Node with require_seal OFF (isolating the holdout gate from the seal gate) and a
// single builder-visible criterion the evidence satisfies.
function graphWith(graphPath, { visible = ["visible-check"] } = {}) {
  return {
    graph: { id: "DGE-001", title: "t", status: "active", settings: { require_seal: false } },
    demands: [{ id: "DEM-001", title: "S", source: "test", outcome: "o" }],
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
    tracks: [{ id: "TRK-validation", title: "V" }],
    nodes: [
      {
        id: "NODE-001",
        title: "n",
        type: "test",
        track: "TRK-validation",
        requirement_ids: ["REQ-001"],
        depends_on: [],
        status: "review",
        validation: {
          required: visible,
          evidence_path: "delivery-graph/demands/DEM-001/evidence/NODE-001/"
        },
        sync: { linear_issue_id: null, ado_task_id: null }
      }
    ]
  };
}

function satisfyVisible(graphPath, graph, key = "visible-check") {
  addEvidence(graphPath, graph, "NODE-001", {
    summary: "ok",
    satisfies: key,
    result: "pass",
    createdAt: "2026-08-05T00:00:00Z"
  });
}

// The verifier records holdout evidence directly (holdout keys are not in
// validation.required, so the builder-facing addEvidence guard rejects them by
// design). This models the verifier-side write path.
function satisfyHoldout(graphPath, node, key) {
  const manifest = readEvidenceManifest(graphPath, node);
  writeEvidenceManifest(graphPath, node, {
    node_id: node.id,
    items: [...manifest.items, { id: `EVD-H${manifest.items.length + 1}`, kind: "command", summary: "holdout ok", satisfies: key, result: "pass", artifact: null, created_at: "2026-08-05T00:00:00Z" }]
  });
}

// ── Contract item 1: overfit build (visible pass, holdout fail) is refused ────

test("OVERFIT: a build passing all builder-visible criteria but failing a holdout criterion is refused at verify", () => {
  const repoRoot = repo();
  try {
    const graphPath = path.join(repoRoot, "delivery-graph", "graph.json");
    const graph = graphWith(graphPath);
    satisfyVisible(graphPath, graph); // all VISIBLE criteria satisfied

    // Author a holdout criterion the builder never saw; NO evidence for it.
    const digest = writeHoldout(graphPath, graph.nodes[0], ["auth actually rejects a forged token"], { repoRoot });
    graph.nodes[0].validation.holdout_digest = digest;

    assert.throws(
      () => verifyNode(graphPath, graph, "NODE-001", { repoRoot }),
      /holdout/,
      "verify must refuse when a holdout criterion is unsatisfied even though visible evidence is complete"
    );

    // Now satisfy the holdout criterion (verifier-side write) → verify passes.
    satisfyHoldout(graphPath, graph.nodes[0], "auth actually rejects a forged token");
    const verified = verifyNode(graphPath, graph, "NODE-001", { repoRoot });
    assert.equal(verified.graph.nodes[0].status, "verified", "verify passes once the holdout criterion is met");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

// ── Contract item 2: holdout text is absent from graph.json ───────────────────

test("holdout criteria TEXT never appears in graph.json — only the holdout_digest pointer", () => {
  const repoRoot = repo();
  try {
    const graphPath = path.join(repoRoot, "delivery-graph", "graph.json");
    fs.mkdirSync(path.dirname(graphPath), { recursive: true });
    const graph = graphWith(graphPath);
    const secret = "auth actually rejects a forged token";
    const digest = writeHoldout(graphPath, graph.nodes[0], [secret], { repoRoot });
    graph.nodes[0].validation.holdout_digest = digest;
    fs.writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`);

    const graphText = fs.readFileSync(graphPath, "utf8");
    assert.ok(!graphText.includes(secret), "holdout criterion text must not be in graph.json");
    assert.ok(graphText.includes(digest), "only the digest pointer is in graph.json");
    // And the text IS in the separate holdout store.
    assert.match(fs.readFileSync(holdoutPath(graphPath, graph.nodes[0]), "utf8"), new RegExp(secret));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

// ── Contract item 3: no holdout → explicit `none`, not a silent pass ──────────

test("a node with no holdout reports `none`, not an empty pass", () => {
  const repoRoot = repo();
  try {
    const graphPath = path.join(repoRoot, "delivery-graph", "graph.json");
    const graph = graphWith(graphPath);
    const status = holdoutStatus(graphPath, graph.nodes[0], ["visible-check"], { repoRoot });
    assert.equal(status.state, "none", "absence of holdout is explicit none");

    // An empty holdout FILE also reports none, not satisfied.
    const digest = writeHoldout(graphPath, graph.nodes[0], [], { repoRoot });
    graph.nodes[0].validation.holdout_digest = digest;
    assert.equal(holdoutStatus(graphPath, graph.nodes[0], [], { repoRoot }).state, "none");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

// ── Fail-closed: tampered holdout file / missing file blocks ──────────────────

test("fail-closed: a holdout file whose digest does not match the pointer blocks verify", () => {
  const repoRoot = repo();
  try {
    const graphPath = path.join(repoRoot, "delivery-graph", "graph.json");
    const graph = graphWith(graphPath);
    satisfyVisible(graphPath, graph);
    writeHoldout(graphPath, graph.nodes[0], ["original criterion"], { repoRoot });
    graph.nodes[0].validation.holdout_digest = "deadbeef"; // pointer doesn't match the file

    assert.throws(() => verifyNode(graphPath, graph, "NODE-001", { repoRoot }), /holdout/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
