import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aggregatesFromRun, admitLearning, reliabilityPriorFor, withLearnedPriors } from "../../src/autonomy/learning.mjs";
import { createFileStore } from "../../src/governance/org-store.mjs";

function provenRun() {
  return {
    goalMet: true, rounds: 1, threshold: 0.5,
    orgRaw: { agents: [{ id: "AGENT-code_change", role: "code_change", model: "opus" }] },
    finalEvals: [{ agent: "AGENT-code_change", role: "code_change", quality: 0.9, evidence: ["run:AGENT-code_change:exit0:bytes12"] }]
  };
}

test("a proven run produces sanitized aggregates (references only, no raw content)", () => {
  const aggs = aggregatesFromRun({ run: provenRun(), scope: "org", organization: "acme", project: "p", repository: "r" });
  assert.equal(aggs.length, 1);
  assert.equal(aggs[0].model, "opus");
  assert.equal(aggs[0].successRate, 1);
  assert.ok(aggs[0].provenanceRefs.every((ref) => /^run:/.test(ref)));
  assert.equal(aggs[0].prompt, undefined); // no raw content
});

test("an unknown-quality eval is NOT turned into a data point", () => {
  const run = provenRun();
  run.finalEvals.push({ agent: "AGENT-x", role: "research", quality: null, evidence: [] });
  const aggs = aggregatesFromRun({ run, scope: "org", organization: "acme" });
  assert.ok(!aggs.some((a) => a.role === "research"), "null-quality eval excluded");
});

test("only a PROVEN run is admitted to the org store (learning gate)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "learn-"));
  try {
    const store = createFileStore({ location: dir });
    // unproven run → nothing admitted
    const unproven = { ...provenRun(), goalMet: false };
    const r1 = admitLearning({ run: unproven, store, organization: "acme" });
    assert.equal(r1.admitted.length, 0);
    assert.ok(r1.blocked.length >= 1);
    assert.equal(store.readComparable({ organization: "acme" }).length, 0);

    // proven run → admitted
    const r2 = admitLearning({ run: provenRun(), store, organization: "acme" });
    assert.equal(r2.admitted.length, 1);
    assert.equal(store.readComparable({ organization: "acme" }).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("THE LOOP CLOSES: a second run's allocation reads the prior a first run admitted", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "learn-"));
  try {
    const store = createFileStore({ location: dir });
    // Run 1 admits a proven outcome for opus on code_change.
    admitLearning({ run: provenRun(), store, organization: "acme" });

    // Run 2: a candidate with NO declared reliability gets a learned prior from the store.
    const candidates = [{ id: "opus", capabilities: ["code_change"] }];
    const enriched = withLearnedPriors(candidates, store, { organization: "acme", role: "code_change" });
    assert.ok(enriched[0].reliability, "opus now carries a learned reliability prior");
    assert.equal(enriched[0].reliability.successRate, 1);
    assert.ok(enriched[0].sampleCount >= 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("no history yields a NULL prior (unknown), never a fabricated zero", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "learn-"));
  try {
    const store = createFileStore({ location: dir });
    assert.equal(reliabilityPriorFor(store, { model: "never-seen", role: "x", organization: "acme" }), null);
    // a candidate with no history is returned unchanged (no fabricated prior)
    const candidates = [{ id: "never-seen", capabilities: ["x"] }];
    assert.deepEqual(withLearnedPriors(candidates, store, { organization: "acme", role: "x" }), candidates);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
