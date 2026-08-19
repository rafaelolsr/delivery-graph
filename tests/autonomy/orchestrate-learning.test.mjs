// The full Stage-6.5 loop through the orchestrator façade: a run admits proven,
// sanitized learning to the org store; a second run reads that prior.

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { orchestrateGoal } from "../../src/autonomy/orchestrate.mjs";
import { createFileStore } from "../../src/governance/org-store.mjs";
import { reliabilityPriorFor } from "../../src/autonomy/learning.mjs";

const REGISTRY = [
  { id: "researcher", capabilities: ["research"] },
  { id: "analyst", capabilities: ["data_analysis"] },
  { id: "coder", capabilities: ["code_change"] },
  { id: "verifier", capabilities: ["verification"] }
];
const CANDIDATES = [{ id: "haiku", capabilities: ["research", "data_analysis", "code_change", "verification"], permissions: ["read", "write", "query"], permittedDomains: ["app"], evidenceTypes: ["test_results"], available: true, costScore: 0.9, latencyScore: 0.9, evidenceQuality: 0.6, reliability: { successRate: 0.75, confidence: "high" }, sampleCount: 40 }];
const T = "2026-08-14T00:00:00Z";

test("a PROVEN orchestration admits sanitized learning; the store then carries the prior", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-learn-"));
  try {
    const store = createFileStore({ location: dir });
    const result = orchestrateGoal({
      goal: { id: "G", statement: "Reduce cloud cost by 20% without degrading reliability" },
      registry: REGISTRY, candidates: CANDIDATES, strongerCandidates: CANDIDATES,
      executor: () => ({ quality: 0.9, evidence: "run:x:exit0:bytes3" }),
      learningStore: store, organization: "acme", project: "p", repository: "r", at: T
    });
    assert.equal(result.goalMet, true);
    assert.ok(result.learning.admitted.length >= 1, "proven run admitted learning");

    // The store now carries a prior for a role the org used.
    const prior = reliabilityPriorFor(store, { model: "haiku", role: "code_change", organization: "acme" });
    assert.ok(prior, "a learned prior exists after the run");
    assert.ok(prior.successRate >= 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an UNPROVEN orchestration admits NOTHING (unproven never influences history)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-learn-"));
  try {
    const store = createFileStore({ location: dir });
    // A persistently weak coder that even replacement can't fix → goal not met.
    const result = orchestrateGoal({
      goal: { id: "G", statement: "Reduce cloud cost by 20%" },
      registry: REGISTRY, candidates: CANDIDATES, strongerCandidates: CANDIDATES,
      executor: (agent) => ({ quality: agent.role === "code_change" ? 0.2 : 0.9, evidence: "run:x:exit1:bytes3" }),
      learningStore: store, organization: "acme", at: T
    });
    assert.equal(result.goalMet, false);
    assert.equal(result.learning.admitted.length, 0, "unproven run admits nothing");
    assert.equal(store.readComparable({ organization: "acme" }).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestration WITHOUT a store still works (learning is opt-in, back-compatible)", () => {
  const result = orchestrateGoal({
    goal: { id: "G", statement: "Reduce cloud cost by 20%" },
    registry: REGISTRY, candidates: CANDIDATES, strongerCandidates: CANDIDATES,
    executor: () => ({ quality: 0.9 }), at: T
  });
  assert.equal(result.goalMet, true);
  assert.equal(result.learning, null);
});
