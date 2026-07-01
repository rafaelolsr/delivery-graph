import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addCommandEvidence,
  addEvidence,
  getEvidenceStatus,
  removeEvidence,
  verifyNode,
  writeCommandAttemptArtifact
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
  assert.match(fs.readFileSync(verified.verificationPath, "utf8"), /npm test: satisfied/);
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

test("a fail-result evidence note does not satisfy a contract item", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  addEvidence(graphPath, graph, "NODE-001", {
    summary: "npm test failed - flaky assertion",
    satisfies: "npm test",
    result: "fail",
    createdAt: "2026-06-30T00:00:00Z"
  });

  const status = getEvidenceStatus(graphPath, graph, graph.nodes[0]);
  assert.equal(status.complete, false);
  assert.deepEqual(status.missing, ["npm test"]);
});

test("done stays blocked and names the unmet item when the only evidence is a fail", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  addEvidence(graphPath, graph, "NODE-001", {
    summary: "npm test failed",
    satisfies: "npm test",
    result: "fail",
    createdAt: "2026-06-30T00:00:00Z"
  });

  assert.throws(
    () => verifyNode(graphPath, graph, "NODE-001"),
    /missing validation evidence: npm test/
  );
});

test("a pass result (and the default) satisfies a contract item", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  const added = addEvidence(graphPath, graph, "NODE-001", {
    summary: "npm test passed",
    satisfies: "npm test",
    result: "pass",
    createdAt: "2026-06-30T00:00:00Z"
  });
  assert.equal(added.record.result, "pass");
  assert.equal(getEvidenceStatus(graphPath, graph, graph.nodes[0]).complete, true);
});

test("legacy manual evidence with no result field still counts as passing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  // omit result entirely - backward compatibility for pre-existing manifests
  addEvidence(graphPath, graph, "NODE-001", {
    summary: "manual approval",
    satisfies: "npm test",
    createdAt: "2026-06-30T00:00:00Z"
  });
  assert.equal(getEvidenceStatus(graphPath, graph, graph.nodes[0]).complete, true);
});

test("an invalid result value is rejected", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  assert.throws(
    () => addEvidence(graphPath, graph, "NODE-001", {
      summary: "x",
      satisfies: "npm test",
      result: "maybe"
    }),
    /result must be "pass" or "fail"/
  );
});

test("removeEvidence deletes an item and recomputes completeness", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  const added = addEvidence(graphPath, graph, "NODE-001", {
    summary: "npm test passed",
    satisfies: "npm test",
    result: "pass",
    createdAt: "2026-06-30T00:00:00Z"
  });
  assert.equal(getEvidenceStatus(graphPath, graph, graph.nodes[0]).complete, true);

  const removed = removeEvidence(graphPath, graph, "NODE-001", added.record.id);
  assert.equal(removed.record.id, added.record.id);
  const status = getEvidenceStatus(graphPath, graph, graph.nodes[0]);
  assert.equal(status.complete, false);
  assert.deepEqual(status.missing, ["npm test"]);
});

test("removeEvidence rejects an unknown evidence id", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  assert.throws(
    () => removeEvidence(graphPath, graph, "NODE-001", "EVD-999"),
    /has no evidence item EVD-999/
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

test("evidence status rejects manifests from another node", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();
  const manifestPath = path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "evidence.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ node_id: "NODE-002", items: [] }));

  assert.throws(
    () => getEvidenceStatus(graphPath, graph, graph.nodes[0]),
    /NODE-001 evidence manifest belongs to NODE-002/
  );
});

test("command evidence records output artifact only when command passes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  const added = addCommandEvidence(graphPath, graph, "NODE-001", {
    satisfies: "npm test",
    command: ["npm", "test"],
    exitCode: 0,
    stdout: "passed\n",
    stderr: "",
    createdAt: "2026-06-30T00:00:00Z"
  });

  assert.equal(added.record.kind, "command");
  assert.equal(added.record.artifact, "artifacts/EVD-001-command.json");

  const artifactPath = path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "artifacts", "EVD-001-command.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  assert.deepEqual(artifact.command, ["npm", "test"]);
  assert.equal(artifact.exit_code, 0);
  assert.equal(artifact.stdout, "passed\n");
});

test("playwright evidence can copy browser artifacts and metadata", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();
  const screenshotPath = path.join(tempDir, "screenshot.png");
  fs.writeFileSync(screenshotPath, "png");

  const added = addCommandEvidence(graphPath, graph, "NODE-001", {
    kind: "playwright",
    satisfies: "npm test",
    command: ["npx", "playwright", "test", "tests/e2e/app.spec.ts"],
    exitCode: 0,
    stdout: "passed\n",
    stderr: "",
    artifacts: screenshotPath,
    metadata: {
      url: "http://localhost:3000",
      script: "tests/e2e/app.spec.ts"
    },
    createdAt: "2026-06-30T00:00:00Z"
  });

  assert.equal(added.record.kind, "playwright");
  assert.equal(added.record.artifact, "artifacts/EVD-001-playwright.json");
  assert.deepEqual(added.record.artifacts, ["artifacts/EVD-001-playwright-artifacts/screenshot.png"]);

  const artifactPath = path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "artifacts", "EVD-001-playwright.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  assert.equal(artifact.metadata.url, "http://localhost:3000");
  assert.equal(fs.readFileSync(path.join(tempDir, "delivery-graph", "evidence", "NODE-001", artifact.artifacts[0]), "utf8"), "png");
});

test("command evidence refuses failed commands", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  assert.throws(
    () => addCommandEvidence(graphPath, graph, "NODE-001", {
      satisfies: "npm test",
      command: ["npm", "test"],
      exitCode: 1,
      stdout: "",
      stderr: "failed\n"
    }),
    /command evidence failed with exit code 1/
  );

  assert.equal(fs.existsSync(path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "evidence.json")), false);
});

test("failed command attempts can be saved without adding evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();

  const { artifactPath } = writeCommandAttemptArtifact(graphPath, graph, "NODE-001", {
    satisfies: "npm test",
    command: ["npm", "test"],
    exitCode: 1,
    stdout: "",
    stderr: "failed\n",
    createdAt: "2026-06-30T00:00:00Z"
  });

  assert.match(artifactPath, /ATTEMPT-2026-06-30T00-00-00Z-command\.json$/);
  assert.equal(fs.existsSync(path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "evidence.json")), false);
  assert.equal(JSON.parse(fs.readFileSync(artifactPath, "utf8")).stderr, "failed\n");

  const unsafeAttempt = writeCommandAttemptArtifact(graphPath, graph, "NODE-001", {
    satisfies: "npm test",
    command: ["npm", "test"],
    exitCode: 1,
    createdAt: "../bad/.."
  });
  assert.equal(path.dirname(unsafeAttempt.artifactPath), path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "artifacts"));
});

test("failed playwright attempts save output and available artifacts without adding evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-evidence-"));
  const graphPath = path.join(tempDir, "delivery-graph", "graph.json");
  const graph = makeGraph();
  const tracePath = path.join(tempDir, "trace.zip");
  fs.writeFileSync(tracePath, "trace");

  const { artifactPath } = writeCommandAttemptArtifact(graphPath, graph, "NODE-001", {
    kind: "playwright",
    satisfies: "npm test",
    command: ["npx", "playwright", "test"],
    exitCode: 1,
    stderr: "failed\n",
    artifacts: [tracePath, path.join(tempDir, "missing")],
    metadata: {
      url: "http://localhost:3000"
    },
    createdAt: "2026-06-30T00:00:00Z"
  });

  const attempt = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  assert.equal(attempt.kind, "playwright");
  assert.equal(attempt.metadata.url, "http://localhost:3000");
  assert.deepEqual(attempt.artifacts, ["artifacts/ATTEMPT-2026-06-30T00-00-00Z-playwright-artifacts/trace.zip"]);
  assert.equal(fs.existsSync(path.join(tempDir, "delivery-graph", "evidence", "NODE-001", "evidence.json")), false);
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
