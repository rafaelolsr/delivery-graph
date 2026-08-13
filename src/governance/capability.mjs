// Capability profiles + measured execution profiles (M4).
//
// A capability profile describes an execution identity (agent, model, tool, or human)
// separately from the others. The cardinal rule from the spec: UNKNOWN measurements
// stay unknown — never represent a missing cost, latency, or reliability as zero. We
// encode "unknown" as `null` everywhere and provide helpers that refuse to invent a
// value. Declared capabilities are distinct from VERIFIED ones (proven via evals).

// Attribute source-of-truth (from the spec's source-rules table). Kept as data so a
// reader can see WHY a field is trusted, not just its value.
export const ATTRIBUTE_SOURCES = Object.freeze({
  permissions: "governance-policy",
  domains: "governance-policy",
  delegation: "governance-policy",
  cost: "measured-or-provider",
  latency: "measured",
  reliability: "proven-history",
  capability: "declared-then-verified",
  evidenceQuality: "proven-outcomes"
});

export const ENTITY_TYPES = Object.freeze({ AGENT: "agent", MODEL: "model", TOOL: "tool", HUMAN: "human" });

// makeCapabilityProfile: everything measured defaults to `null` (unknown), never 0.
export function makeCapabilityProfile({
  id, entityType, provider = null, version = null,
  declaredCapabilities = [], verifiedCapabilities = [],
  permittedDomains = [], dataHandling = [], tools = [], evidenceTypes = [],
  delegationAuthority = null, availability = null
} = {}) {
  if (!id) throw new Error("a capability profile requires a stable id");
  if (!Object.values(ENTITY_TYPES).includes(entityType)) {
    throw new Error(`entityType must be one of ${Object.values(ENTITY_TYPES).join(", ")}`);
  }
  return {
    id, entityType, provider, version,
    declaredCapabilities, verifiedCapabilities,
    permittedDomains, dataHandling, tools, evidenceTypes,
    delegationAuthority, availability,
    // Measured histories start UNKNOWN. A distribution is null until samples exist.
    cost: null, latency: null, tokens: null, reliability: null,
    sampleCount: 0, confidence: null
  };
}

// A distribution summary — the spec's "distributions not misleading exact limits".
// With zero samples every statistic is null (unknown), and confidence is null.
export function summarizeDistribution(samples = []) {
  const values = samples.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  const n = values.length;
  if (n === 0) {
    return { median: null, p10: null, p90: null, sampleCount: 0, confidence: null };
  }
  const pct = (p) => values[Math.min(n - 1, Math.floor((p / 100) * n))];
  return {
    median: pct(50), p10: pct(10), p90: pct(90),
    sampleCount: n,
    // Confidence grows with sample count, saturating; deliberately coarse and legible.
    // Never claim high confidence from a handful of samples.
    confidence: confidenceFromSamples(n)
  };
}

// Coarse confidence tiers. A single success must not dominate routing, so 1 sample is
// "very-low", not "high".
export function confidenceFromSamples(n) {
  if (n <= 0) return null;
  if (n < 3) return "very-low";
  if (n < 10) return "low";
  if (n < 30) return "medium";
  return "high";
}

// Whether a measured value is known. Guards against callers treating null as 0.
export function isKnown(value) {
  return value !== null && value !== undefined;
}

// Merge a proven execution measurement into a profile, returning a NEW profile.
// Only PROVEN executions may update reliability (enforced by the caller / Learning
// gate). Older model-version results must not silently determine a newer version's
// reliability — the store partitions by provider/model/version, so a profile only
// ever aggregates its own identity's samples.
export function withMeasurement(profile, { costSamples = [], latencySamples = [], tokenSamples = [], successes = 0, attempts = 0 } = {}) {
  const cost = costSamples.length ? summarizeDistribution(costSamples) : profile.cost;
  const latency = latencySamples.length ? summarizeDistribution(latencySamples) : profile.latency;
  const tokens = tokenSamples.length ? summarizeDistribution(tokenSamples) : profile.tokens;
  const sampleCount = profile.sampleCount + attempts;
  const reliability = attempts > 0
    ? { successRate: successes / attempts, sampleCount, confidence: confidenceFromSamples(sampleCount) }
    : profile.reliability;
  return { ...profile, cost, latency, tokens, reliability, sampleCount, confidence: confidenceFromSamples(sampleCount) };
}
