import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cliPath = path.resolve("bin/dge.mjs");

const CONFIG = {
  registry: [
    { id: "researcher", capabilities: ["research"] },
    { id: "analyst", capabilities: ["data_analysis"] },
    { id: "coder", capabilities: ["code_change"] },
    { id: "verifier", capabilities: ["verification"] }
  ],
  candidates: [
    { id: "haiku", capabilities: ["research", "data_analysis", "code_change", "verification"], permissions: ["read", "write", "query"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.9, latencyScore: 0.9, evidenceQuality: 0.6, reliability: { successRate: 0.75, confidence: "high" }, sampleCount: 40 }
  ],
  strongerCandidates: [
    { id: "opus", capabilities: ["research", "data_analysis", "code_change", "verification"], permissions: ["read", "write", "query"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.3, latencyScore: 0.4, evidenceQuality: 0.95, reliability: { successRate: 0.97, confidence: "high" }, sampleCount: 80 }
  ],
  quality: { code_change: 0.2, "code_change-v2": 0.9 }
};

test("`dge orchestrate` builds an org from a bare goal and self-reorganizes (live CLI)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrate-cli-"));
  try {
    const cfg = path.join(dir, "cfg.json");
    fs.writeFileSync(cfg, JSON.stringify(CONFIG));
    const out = execFileSync(process.execPath, [cliPath, "orchestrate", "Reduce cloud cost by 20% without degrading reliability", "--config", cfg, "--json"], { encoding: "utf8" });
    const r = JSON.parse(out);
    assert.equal(r.organization.satisfiable, true);
    assert.equal(r.organization.agentCount, 4);
    assert.ok(r.ledger.some((l) => l.action === "reorganized"));
    assert.equal(r.goalMet, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("`dge orchestrate` on an unsatisfiable goal reports the gap without crashing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrate-cli-"));
  try {
    const cfg = path.join(dir, "cfg.json");
    fs.writeFileSync(cfg, JSON.stringify({ ...CONFIG, registry: [{ id: "researcher", capabilities: ["research"] }] }));
    const out = execFileSync(process.execPath, [cliPath, "orchestrate", "Reduce cloud cost by 20%", "--config", cfg, "--json"], { encoding: "utf8" });
    const r = JSON.parse(out);
    assert.equal(r.goalMet, false);
    assert.equal(r.organization, null);
    assert.match(r.reason, /unsatisfiable/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("`dge orchestrate` requires a goal statement", () => {
  assert.throws(() => execFileSync(process.execPath, [cliPath, "orchestrate"], { encoding: "utf8" }), /Usage|goal/);
});
