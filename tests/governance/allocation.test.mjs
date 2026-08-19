import assert from "node:assert/strict";
import test from "node:test";
import {
  filterEligible, rankStrategies, allocate,
  OPTIMIZATION_PROFILES, RISK_BANDS
} from "../../src/governance/allocation.mjs";

// A cheap-but-weak candidate and an expensive-but-reliable one, both eligible.
const cheapWeak = {
  id: "haiku", capabilities: ["code_review"], permissions: ["read"], permittedDomains: ["app"],
  evidenceTypes: ["test_results"], dataHandling: ["internal"], available: true,
  costScore: 0.95, latencyScore: 0.9, evidenceQuality: 0.5,
  reliability: { successRate: 0.7, confidence: "high" }, sampleCount: 40
};
const dearStrong = {
  id: "opus", capabilities: ["code_review"], permissions: ["read"], permittedDomains: ["app"],
  evidenceTypes: ["test_results"], dataHandling: ["internal"], available: true,
  costScore: 0.3, latencyScore: 0.4, evidenceQuality: 0.9,
  reliability: { successRate: 0.98, confidence: "high" }, sampleCount: 60
};
const reqs = { capabilities: ["code_review"], permissions: ["read"], domains: ["app"], evidence: ["test_results"] };

// ---- eligibility -----------------------------------------------------------

test("an ineligible candidate is filtered out with reasons", () => {
  const missingCap = { ...cheapWeak, id: "nocap", capabilities: [] };
  const { eligible, rejected } = filterEligible([dearStrong, missingCap], reqs);
  assert.deepEqual(eligible.map((c) => c.id), ["opus"]);
  assert.equal(rejected[0].candidate, "nocap");
  assert.match(rejected[0].reasons.join(" "), /missing capability/);
});

test("an ineligible cheap candidate can NEVER win, however cheap", () => {
  // The cheapest possible candidate, but it lacks a required permission.
  const cheapest = { ...cheapWeak, id: "cheapest", costScore: 1, permissions: [] };
  const result = allocate([cheapest, dearStrong], { ...reqs, permissions: ["read"] }, { risk: RISK_BANDS.LOW, profile: OPTIMIZATION_PROFILES.ECONOMY });
  assert.notEqual(result.selected, "cheapest");
  assert.equal(result.selected, "opus");
  assert.ok(result.rejected.some((r) => r.candidate === "cheapest"));
});

test("a required independent verifier cannot be the executor", () => {
  const { eligible } = filterEligible([dearStrong], { ...reqs, independentVerifier: true, executor: "opus" });
  assert.equal(eligible.length, 0);
});

// ---- risk-aware ranking ----------------------------------------------------

test("low-risk economy work selects the economical eligible strategy", () => {
  const result = allocate([cheapWeak, dearStrong], reqs, { risk: RISK_BANDS.LOW, profile: OPTIMIZATION_PROFILES.ECONOMY });
  assert.equal(result.selected, "haiku", "economy + low risk favors the cheaper eligible candidate");
});

test("high-risk work prioritizes reliability over cost", () => {
  const result = allocate([cheapWeak, dearStrong], reqs, { risk: RISK_BANDS.HIGH, profile: OPTIMIZATION_PROFILES.ECONOMY });
  assert.equal(result.selected, "opus", "high risk overrides economy toward reliability");
});

test("the governor picks DIFFERENT strategies for low- vs high-risk work", () => {
  const low = allocate([cheapWeak, dearStrong], reqs, { risk: RISK_BANDS.LOW, profile: OPTIMIZATION_PROFILES.ECONOMY });
  const high = allocate([cheapWeak, dearStrong], reqs, { risk: RISK_BANDS.HIGH, profile: OPTIMIZATION_PROFILES.ECONOMY });
  assert.notEqual(low.selected, high.selected);
});

// ---- unknown != free -------------------------------------------------------

test("an unknown cost is treated as neutral, NOT as free/zero", () => {
  const unknownCost = { ...cheapWeak, id: "mystery", costScore: null, latencyScore: null };
  const ranked = rankStrategies([unknownCost, dearStrong], { risk: RISK_BANDS.MEDIUM, profile: OPTIMIZATION_PROFILES.ECONOMY });
  const mystery = ranked.find((r) => r.id === "mystery");
  assert.equal(mystery.factors.cost, null, "unknown cost stays null, not 0 or 1");
  assert.equal(mystery.contributions.cost, null, "an unknown factor contributes nothing (not a free win)");
});

// ---- cold start ------------------------------------------------------------

test("cold start (no history) exposes very-low confidence", () => {
  const fresh = {
    id: "new-model", capabilities: ["code_review"], permissions: ["read"], permittedDomains: ["app"],
    evidenceTypes: ["test_results"], available: true,
    costScore: 0.5, latencyScore: 0.5, evidenceQuality: 0.6, sampleCount: 0
  };
  const result = allocate([fresh], reqs, { risk: RISK_BANDS.HIGH });
  assert.equal(result.selected, "new-model");
  assert.equal(result.coldStart, true);
  assert.equal(result.confidence, "very-low");
  assert.match(result.rationale, /cold start/);
  assert.match(result.expected.basis, /cold start/);
});

test("a single 100% success does not outrank a proven 95% (confidence-discounted)", () => {
  const oneShot = { ...cheapWeak, id: "oneshot", reliability: { successRate: 1, confidence: "very-low" }, sampleCount: 1, costScore: 0.5 };
  const proven = { ...dearStrong, id: "proven", reliability: { successRate: 0.95, confidence: "high" }, costScore: 0.5, evidenceQuality: 0.6 };
  const ranked = rankStrategies([oneShot, proven], { risk: RISK_BANDS.HIGH, profile: OPTIMIZATION_PROFILES.RELIABILITY_FIRST });
  assert.equal(ranked[0].id, "proven", "a well-sampled 95% beats a 1-sample 100%");
});

// ---- explainability --------------------------------------------------------

test("every allocation is explainable (rationale + factor contributions + alternatives)", () => {
  const result = allocate([cheapWeak, dearStrong], reqs, { risk: RISK_BANDS.MEDIUM, at: "T" });
  assert.ok(typeof result.rationale === "string" && result.rationale.length > 0);
  assert.ok(result.factors && "reliability" in result.factors);
  assert.ok(Array.isArray(result.alternatives));
  assert.equal(result.at, "T");
  // No single unexplained score: the winner reports its factor breakdown.
  assert.match(result.rationale, /score/);
});

test("no eligible candidate yields an explicit no-selection with reasons", () => {
  const ineligible = { ...cheapWeak, capabilities: [] };
  const result = allocate([ineligible], reqs);
  assert.equal(result.selected, null);
  assert.match(result.reason, /no eligible/);
});
