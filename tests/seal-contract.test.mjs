import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { setupSigning, signingKeyPath } from "../src/signing.mjs";
import { sealContract, checkSeal, mintSeal } from "../src/seal.mjs";
import { verifyNode, addEvidence } from "../src/evidence-engine.mjs";

// DEM-020 Track 1 / NODE-081 (REQ-086): `dge seal-contract` is the human-only
// sealing action. Contract:
//   1. It exits WITHOUT sealing when stdin is not a TTY (headless agent sim).
//   2. A forged seal minted without the real key is rejected by verifyNode.
//   3. Re-sealing requires --reseal and records fresh sealed_by/sealed_at.

const BIN = path.resolve("bin/dge-setup.mjs"); // for signing setup
const DGE = path.resolve("bin/dge.mjs");
const CONFIRM = "i-approve-this-contract";

// A tmp repo with a signing key AND a graph.json carrying one sealable node.
function repoWithNode() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dge-sealcmd-"));
  fs.writeFileSync(path.join(repoRoot, ".gitignore"), ".dge/\n");
  setupSigning({ repoRoot });
  const graphPath = path.join(repoRoot, "delivery-graph", "graph.json");
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  const graph = {
    graph: { id: "DGE-001", title: "t", status: "active", settings: { require_seal: true } },
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
          required: ["npm test"],
          evidence_path: "delivery-graph/demands/DEM-001/evidence/NODE-001/"
        },
        sync: { linear_issue_id: null, ado_task_id: null }
      }
    ]
  };
  fs.writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
  return { repoRoot, graphPath };
}

function readGraph(graphPath) {
  return JSON.parse(fs.readFileSync(graphPath, "utf8"));
}

// Run `dge seal-contract` headlessly (stdin is a pipe, so isTTY is false).
function runSeal(repoRoot, argv) {
  let stdout = "";
  let code = 0;
  try {
    stdout = execFileSync("node", [DGE, "seal-contract", ...argv], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"]
    }).toString();
  } catch (err) {
    code = err.status ?? 1;
    stdout = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
  return { code, stdout };
}

// ── Contract item 1: refuses headless without the human confirmation ──────────

test("seal-contract exits WITHOUT sealing when stdin is not a TTY and no confirm phrase", () => {
  const { repoRoot, graphPath } = repoWithNode();
  try {
    const { code } = runSeal(repoRoot, ["NODE-001", "--by", "rafael"]);
    assert.equal(code, 1, "headless seal without confirmation must exit non-zero");
    const node = readGraph(graphPath).nodes[0];
    assert.equal(node.validation.seal, undefined, "no seal was written");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("seal-contract with the explicit human confirmation phrase DOES seal (headless human)", () => {
  const { repoRoot, graphPath } = repoWithNode();
  try {
    const { code } = runSeal(repoRoot, ["NODE-001", "--by", "rafael", "--confirm", CONFIRM]);
    assert.equal(code, 0, "confirmed seal succeeds");
    const node = readGraph(graphPath).nodes[0];
    assert.ok(node.validation.seal?.digest, "seal digest written");
    assert.equal(node.validation.seal.sealed_by, "rafael");
    assert.equal(node.validation.seal.algo, "sha256-hmac");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

// ── Contract item 2: a forged seal (no real key) is rejected by verifyNode ────

test("a forged seal computed WITHOUT .dge/signing.key is rejected by verifyNode", () => {
  const { repoRoot, graphPath } = repoWithNode();
  try {
    const graph = readGraph(graphPath);
    // Attacker forges a digest with a key they control instead of the repo key.
    graph.nodes[0].validation.seal = {
      digest: crypto.createHmac("sha256", Buffer.from("attacker-key")).update("x").digest("hex"),
      algo: "sha256-hmac",
      sealed_by: "attacker",
      sealed_at: "2026-08-05T00:00:00Z"
    };
    addEvidence(graphPath, graph, "NODE-001", {
      summary: "ok",
      satisfies: "npm test",
      result: "pass",
      createdAt: "2026-08-05T00:00:00Z"
    });
    assert.throws(
      () => verifyNode(graphPath, graph, "NODE-001", { repoRoot }),
      /seal broken/,
      "a seal not produced by the repo key must be rejected"
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

// ── Contract item 3: re-sealing requires --reseal and refreshes signer/time ───

test("re-sealing an already-sealed node requires --reseal", () => {
  const { repoRoot, graphPath } = repoWithNode();
  try {
    runSeal(repoRoot, ["NODE-001", "--by", "rafael", "--confirm", CONFIRM]);
    // Second seal WITHOUT --reseal must be refused.
    const second = runSeal(repoRoot, ["NODE-001", "--by", "someone-else", "--confirm", CONFIRM]);
    assert.equal(second.code, 1, "re-seal without --reseal is refused");
    assert.match(second.stdout, /already sealed/);
    const node = readGraph(graphPath).nodes[0];
    assert.equal(node.validation.seal.sealed_by, "rafael", "original signer preserved");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("--reseal records a fresh sealed_by and sealed_at", () => {
  const { repoRoot, graphPath } = repoWithNode();
  try {
    runSeal(repoRoot, ["NODE-001", "--by", "rafael", "--confirm", CONFIRM]);
    const first = readGraph(graphPath).nodes[0].validation.seal;

    // Legitimately edit the contract, then re-approve with --reseal.
    const g = readGraph(graphPath);
    g.nodes[0].validation.required = ["npm test", "npm run lint"];
    fs.writeFileSync(graphPath, `${JSON.stringify(g, null, 2)}\n`);
    const res = runSeal(repoRoot, ["NODE-001", "--by", "reviewer", "--reseal", "--confirm", CONFIRM]);
    assert.equal(res.code, 0, "--reseal succeeds after a contract edit");

    const second = readGraph(graphPath).nodes[0].validation.seal;
    assert.equal(second.sealed_by, "reviewer", "fresh signer recorded");
    assert.notEqual(second.digest, first.digest, "digest reflects the new contract");
    assert.ok(second.sealed_at, "fresh sealed_at recorded");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

// ── Unit: sealContract engine guard (belt-and-suspenders for the CLI gate) ─────

test("sealContract engine refuses to overwrite an existing seal without reseal", () => {
  const { repoRoot, graphPath } = repoWithNode();
  try {
    const graph = readGraph(graphPath);
    graph.nodes[0].validation.seal = mintSeal(graph, graph.nodes[0], {
      sealedBy: "rafael",
      sealedAt: "t",
      repoRoot
    });
    assert.throws(
      () => sealContract(graph, "NODE-001", { sealedBy: "x", sealedAt: "t2", repoRoot }),
      /already sealed/
    );
    // With reseal it succeeds and the seal still checks out.
    const { graph: resealed } = sealContract(graph, "NODE-001", {
      sealedBy: "x",
      sealedAt: "t2",
      reseal: true,
      repoRoot
    });
    assert.equal(checkSeal(resealed, resealed.nodes[0], { repoRoot }).ok, true);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
