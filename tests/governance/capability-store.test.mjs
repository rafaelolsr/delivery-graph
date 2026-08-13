import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  makeCapabilityProfile, summarizeDistribution, confidenceFromSamples,
  withMeasurement, isKnown, ENTITY_TYPES
} from "../../src/governance/capability.mjs";
import {
  createFileStore, sanitizeAggregate, containsRawContent, partitionKey
} from "../../src/governance/org-store.mjs";

// ---- capability profiles: unknown stays unknown ----------------------------

test("a fresh profile has UNKNOWN (null) cost/latency/reliability — never zero", () => {
  const p = makeCapabilityProfile({ id: "claude-opus", entityType: ENTITY_TYPES.MODEL, provider: "anthropic", version: "4.8" });
  assert.equal(p.cost, null);
  assert.equal(p.latency, null);
  assert.equal(p.reliability, null);
  assert.equal(p.sampleCount, 0);
  assert.equal(p.confidence, null);
  assert.equal(isKnown(p.cost), false);
});

test("declared and verified capabilities are distinct", () => {
  const p = makeCapabilityProfile({
    id: "x", entityType: ENTITY_TYPES.AGENT,
    declaredCapabilities: ["code_review", "refactor"], verifiedCapabilities: ["code_review"]
  });
  assert.deepEqual(p.declaredCapabilities, ["code_review", "refactor"]);
  assert.deepEqual(p.verifiedCapabilities, ["code_review"]);
});

test("a zero-sample distribution is all-null, not zero", () => {
  const d = summarizeDistribution([]);
  assert.equal(d.median, null);
  assert.equal(d.p90, null);
  assert.equal(d.sampleCount, 0);
  assert.equal(d.confidence, null);
});

test("low sample counts yield low confidence; a single success is very-low", () => {
  assert.equal(confidenceFromSamples(1), "very-low");
  assert.equal(confidenceFromSamples(5), "low");
  assert.equal(confidenceFromSamples(20), "medium");
  assert.equal(confidenceFromSamples(50), "high");
});

test("a single successful execution does NOT dominate (stays very-low confidence)", () => {
  const p0 = makeCapabilityProfile({ id: "m", entityType: ENTITY_TYPES.MODEL });
  const p1 = withMeasurement(p0, { successes: 1, attempts: 1 });
  assert.equal(p1.reliability.successRate, 1);
  assert.equal(p1.reliability.confidence, "very-low");
});

// ---- org store: explicit location ------------------------------------------

test("the org store REFUSES an implicit location (no home-directory default)", () => {
  assert.throws(() => createFileStore({}), /explicitly/);
  assert.throws(() => createFileStore({ location: null }), /explicitly/);
});

// ---- privacy: raw content excluded by default ------------------------------

test("sanitizeAggregate keeps aggregates and DROPS raw content", () => {
  const clean = sanitizeAggregate({
    organization: "acme", provider: "anthropic", model: "opus", version: "4.8",
    successRate: 0.9, sampleCount: 20, confidence: "medium",
    prompt: "SECRET PROMPT", sourceCode: "secret()", evidenceContent: "raw"
  });
  assert.equal(clean.successRate, 0.9);
  assert.equal(clean.organization, "acme");
  assert.equal(clean.prompt, undefined);
  assert.equal(clean.sourceCode, undefined);
  assert.equal(clean.evidenceContent, undefined);
});

test("raw content nested inside an allowlisted key cannot survive (deep scan)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "org-store-"));
  try {
    const store = createFileStore({ location: dir });
    // A leak hidden one level down, inside an allowlisted distribution key.
    const sneaky = { organization: "acme", costDistribution: { median: 1, prompt: "LEAK", secret: "S" } };
    assert.equal(containsRawContent(sneaky), true, "deep scan must detect the nested leak");
    assert.throws(() => store.appendProvenResult(sneaky), /privacy/);
    // And if it were sanitized, the nested forbidden keys are stripped.
    const clean = sanitizeAggregate(sneaky);
    assert.equal(clean.costDistribution.median, 1);
    assert.equal(clean.costDistribution.prompt, undefined);
    assert.equal(clean.costDistribution.secret, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the store REFUSES to persist raw content even if a caller tries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "org-store-"));
  try {
    const store = createFileStore({ location: dir });
    assert.throws(() => store.appendProvenResult({ organization: "acme", prompt: "leak" }), /privacy/);
    assert.equal(containsRawContent({ prompt: "x" }), true);
    assert.equal(containsRawContent({ successRate: 1 }), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- two repos share proven aggregate history ------------------------------

test("a second repository's read sees a proven aggregate the first published (shared store)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "org-store-"));
  try {
    // Repo A publishes a proven aggregate.
    const repoA = createFileStore({ location: dir });
    repoA.appendProvenResult({
      organization: "acme", project: "p", repository: "repo-a",
      provider: "anthropic", model: "opus", version: "4.8",
      taskClass: "code_review", riskBand: "medium",
      successRate: 0.95, proofRate: 0.95, sampleCount: 40, confidence: "high"
    });
    // Repo B, pointed at the SAME configured store, reads the cohort.
    const repoB = createFileStore({ location: dir });
    const comparable = repoB.readComparable({ organization: "acme", provider: "anthropic", model: "opus", version: "4.8", taskClass: "code_review" });
    assert.equal(comparable.length, 1);
    assert.equal(comparable[0].successRate, 0.95);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown reliability stays unknown (null), never fabricated as zero", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "org-store-"));
  try {
    const store = createFileStore({ location: dir });
    const r = store.readReliability({ organization: "acme", model: "never-seen", version: "9" });
    assert.equal(r, null); // no history → unknown, not 0
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- stale model-version partitioning --------------------------------------

test("a newer model version does NOT inherit an older version's reliability", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "org-store-"));
  try {
    const store = createFileStore({ location: dir });
    store.appendProvenResult({ organization: "acme", provider: "anthropic", model: "opus", version: "4.6", taskClass: "impl", successRate: 0.5, sampleCount: 10 });
    // Query the NEW version — must not see the old version's data.
    const newVersion = store.readComparable({ organization: "acme", provider: "anthropic", model: "opus", version: "4.8", taskClass: "impl" });
    assert.equal(newVersion.length, 0);
    const oldVersion = store.readComparable({ organization: "acme", provider: "anthropic", model: "opus", version: "4.6", taskClass: "impl" });
    assert.equal(oldVersion.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- contradicted learning can be superseded -------------------------------

test("a contradicted aggregate can be superseded and disappears from reads", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "org-store-"));
  try {
    const store = createFileStore({ location: dir });
    store.appendProvenResult({ id: "AGG-1", organization: "acme", provider: "p", model: "m", version: "1", taskClass: "t", successRate: 0.9, sampleCount: 30 });
    assert.equal(store.readComparable({ organization: "acme", taskClass: "t" }).length, 1);
    store.supersede("AGG-1", "contradicted by a larger sample");
    assert.equal(store.readComparable({ organization: "acme", taskClass: "t" }).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("partitionKey includes provider/model/version so versions never collide", () => {
  const a = partitionKey({ organization: "acme", provider: "anthropic", model: "opus", version: "4.6" });
  const b = partitionKey({ organization: "acme", provider: "anthropic", model: "opus", version: "4.8" });
  assert.notEqual(a, b);
});
