// Adaptive allocation (M5).
//
// Given a ready task's requirements and a set of candidate execution strategies, the
// governor: (1) filters out INELIGIBLE candidates, (2) RANKS the eligible ones with a
// risk-aware, multi-factor score, and (3) derives SOFT expectations from comparable
// execution history. Every decision carries a rationale — no single unexplained score.
//
// Cardinal rules:
//   - An ineligible candidate can NEVER win, however cheap (eligibility precedes cost).
//   - Unknown cost/latency/reliability stays unknown; it is not treated as free/zero.
//   - Cold start (no history) exposes LOW confidence and prefers safer strategies for
//     high-risk work; a single success never dominates.

import { confidenceFromSamples, isKnown } from "./capability.mjs";

export const OPTIMIZATION_PROFILES = Object.freeze({
  BALANCED: "balanced",
  RELIABILITY_FIRST: "reliability_first",
  ECONOMY: "economy",
  LATENCY_FIRST: "latency_first"
});

export const RISK_BANDS = Object.freeze({ LOW: "low", MEDIUM: "medium", HIGH: "high" });

// ---- 1. Eligibility filtering ----------------------------------------------
// Reject candidates that fail a hard requirement BEFORE any scoring. Returns
// { eligible: [...], rejected: [{ candidate, reasons }] }.
export function filterEligible(candidates, requirements = {}) {
  const eligible = [];
  const rejected = [];
  for (const c of candidates) {
    const reasons = ineligibilityReasons(c, requirements);
    if (reasons.length === 0) eligible.push(c);
    else rejected.push({ candidate: c.id, reasons });
  }
  return { eligible, rejected };
}

function ineligibilityReasons(candidate, requirements) {
  const reasons = [];
  const has = (list, item) => Array.isArray(list) && list.includes(item);

  for (const cap of requirements.capabilities ?? []) {
    if (!has(candidate.capabilities, cap)) reasons.push(`missing capability: ${cap}`);
  }
  for (const perm of requirements.permissions ?? []) {
    if (!has(candidate.permissions, perm)) reasons.push(`missing permission: ${perm}`);
  }
  for (const dom of requirements.domains ?? []) {
    if (!has(candidate.permittedDomains, dom)) reasons.push(`domain not permitted: ${dom}`);
  }
  for (const ev of requirements.evidence ?? []) {
    if (!has(candidate.evidenceTypes, ev)) reasons.push(`cannot produce evidence: ${ev}`);
  }
  for (const cls of requirements.dataClassifications ?? []) {
    if (!has(candidate.dataHandling, cls)) reasons.push(`cannot handle data class: ${cls}`);
  }
  if (candidate.available === false) reasons.push("candidate unavailable");
  if (requirements.independentVerifier && candidate.id === requirements.executor) {
    reasons.push("cannot serve as its own independent verifier");
  }
  return reasons;
}

// ---- 2. Strategy ranking ---------------------------------------------------
// Score eligible candidates with a risk-aware weighting. Returns candidates sorted
// best-first, each with a `score` and a `factors` breakdown (the rationale). Higher
// is better. Unknown values are NEUTRAL, not favorable — an unknown-cost candidate is
// never ranked as if it were free.
export function rankStrategies(eligible, { risk = RISK_BANDS.MEDIUM, profile = OPTIMIZATION_PROFILES.BALANCED } = {}) {
  const weights = weightsFor(risk, profile);
  const scored = eligible.map((c) => {
    const factors = {
      reliability: reliabilityScore(c), // 0..1, or null if unknown
      cost: costScore(c), // 0..1 (cheaper=higher), or null
      latency: latencyScore(c), // 0..1 (faster=higher), or null
      evidenceQuality: clamp01(c.evidenceQuality ?? null)
    };
    const { score, contributions } = weightedScore(factors, weights);
    return {
      id: c.id, candidate: c, score, factors, contributions,
      confidence: c.reliability?.confidence ?? confidenceFromSamples(c.sampleCount ?? 0)
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// Risk/profile → factor weights. High-risk work weights reliability far above cost
// (so a cheaper-but-less-reliable option cannot win high-risk work on price).
function weightsFor(risk, profile) {
  let w = { reliability: 0.4, cost: 0.2, latency: 0.2, evidenceQuality: 0.2 };
  if (profile === OPTIMIZATION_PROFILES.RELIABILITY_FIRST) w = { reliability: 0.6, cost: 0.1, latency: 0.1, evidenceQuality: 0.2 };
  else if (profile === OPTIMIZATION_PROFILES.ECONOMY) w = { reliability: 0.25, cost: 0.5, latency: 0.15, evidenceQuality: 0.1 };
  else if (profile === OPTIMIZATION_PROFILES.LATENCY_FIRST) w = { reliability: 0.25, cost: 0.15, latency: 0.5, evidenceQuality: 0.1 };
  // High-risk overrides the profile toward reliability unless already stronger.
  if (risk === RISK_BANDS.HIGH) {
    w = { reliability: Math.max(w.reliability, 0.6), cost: Math.min(w.cost, 0.1), latency: Math.min(w.latency, 0.1), evidenceQuality: 0.2 };
  }
  return normalize(w);
}

// Combine factors by weight, IGNORING unknown (null) factors and renormalizing over
// the known ones — so an unknown factor is neutral, never a free win.
function weightedScore(factors, weights) {
  let sum = 0, wsum = 0;
  const contributions = {};
  for (const [k, v] of Object.entries(factors)) {
    if (!isKnown(v)) { contributions[k] = null; continue; }
    const w = weights[k] ?? 0;
    sum += v * w; wsum += w;
    contributions[k] = Number((v * w).toFixed(4));
  }
  return { score: wsum === 0 ? 0 : Number((sum / wsum).toFixed(4)), contributions };
}

function reliabilityScore(c) {
  const r = c.reliability;
  if (!r || !isKnown(r.successRate)) return null;
  // Discount reliability by confidence: a 100% rate from 1 sample must not beat a
  // 95% rate from 40 samples. Multiply by a confidence factor.
  const conf = { "very-low": 0.3, low: 0.6, medium: 0.85, high: 1 }[r.confidence] ?? 0.3;
  return clamp01(r.successRate * conf);
}

// Cost/latency scores need a reference scale; callers pass normalized 0..1 already
// (lower raw cost → higher score). Unknown stays null.
function costScore(c) {
  if (!isKnown(c.costScore)) return null;
  return clamp01(c.costScore);
}
function latencyScore(c) {
  if (!isKnown(c.latencyScore)) return null;
  return clamp01(c.latencyScore);
}

// ---- 3. Allocation decision ------------------------------------------------
// Produce the winning allocation with full rationale, including alternatives and
// SOFT expectations derived from the candidate's comparable history (never a
// human-authored hard limit). Cold start: no history → low confidence, and for
// high-risk work the safer (higher-reliability-declared) candidate is preferred.
export function allocate(candidates, requirements = {}, { risk = RISK_BANDS.MEDIUM, profile = OPTIMIZATION_PROFILES.BALANCED, at = null } = {}) {
  const { eligible, rejected } = filterEligible(candidates, requirements);
  if (eligible.length === 0) {
    return { selected: null, reason: "no eligible candidate", rejected, at };
  }
  const ranked = rankStrategies(eligible, { risk, profile });
  const winner = ranked[0];
  const coldStart = (winner.candidate.sampleCount ?? 0) === 0;

  return {
    node_id: requirements.node_id ?? null,
    selected: winner.id,
    risk, profile,
    rationale: buildRationale(winner, ranked, risk, profile, coldStart),
    factors: winner.factors,
    confidence: coldStart ? "very-low" : winner.confidence,
    coldStart,
    expected: softExpectations(winner.candidate),
    alternatives: ranked.slice(1).map((r) => ({ id: r.id, score: r.score })),
    rejected,
    eligible: true,
    at
  };
}

function buildRationale(winner, ranked, risk, profile, coldStart) {
  const parts = [`selected ${winner.id} (score ${winner.score}) under ${profile}/${risk}-risk`];
  const known = Object.entries(winner.factors).filter(([, v]) => isKnown(v)).map(([k, v]) => `${k}=${v}`);
  if (known.length) parts.push(`known factors: ${known.join(", ")}`);
  const unknown = Object.entries(winner.factors).filter(([, v]) => !isKnown(v)).map(([k]) => k);
  if (unknown.length) parts.push(`unknown (treated neutral, not free): ${unknown.join(", ")}`);
  if (coldStart) parts.push("cold start: no proven history, confidence is very-low");
  if (ranked[1]) parts.push(`beat ${ranked[1].id} (score ${ranked[1].score})`);
  return parts.join("; ");
}

// Soft runtime expectations from the candidate's own distributions. Unknown stays
// unknown — expectations are estimates, never human-authored limits.
function softExpectations(candidate) {
  return {
    cost: candidate.cost ? { low: candidate.cost.p10, expected: candidate.cost.median, high: candidate.cost.p90 } : null,
    latency: candidate.latency ? { low: candidate.latency.p10, expected: candidate.latency.median, high: candidate.latency.p90 } : null,
    tokens: candidate.tokens ? { expected: candidate.tokens.median } : null,
    basis: candidate.sampleCount ? `${candidate.sampleCount} comparable executions` : "no comparable history (cold start)"
  };
}

function clamp01(v) {
  if (!isKnown(v)) return null;
  return Math.max(0, Math.min(1, v));
}
function normalize(w) {
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / total]));
}
