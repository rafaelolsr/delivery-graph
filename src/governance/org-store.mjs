// Organization-wide knowledge store (M4).
//
// A pluggable interface for sharing PROVEN, sanitized execution history across
// repositories, plus a file-backed reference implementation. Hard rules from the spec:
//
//   - The location is configured EXPLICITLY. Never assume a home-directory path.
//   - Aggregate data is shared by default; raw prompts/source/secrets/evidence CONTENT
//     are excluded from org-wide storage by default. References, hashes,
//     classifications, and sanitized aggregates are permitted.
//   - Partition by organization/project/repository/provider/model/version.
//   - Only the Learning-admission gate may publish into the store (enforced by callers).
//   - Unknown measurements stay unknown (null), never zero.

import fs from "node:fs";
import path from "node:path";

// The store interface every backend implements:
//   readComparable(cohort) -> aggregate[]         (matching partition)
//   appendProvenResult(aggregate) -> void         (sanitizes first)
//   readReliability(identity) -> aggregate|null
//   appendLearning(record) -> void
//   supersede(id, reason) -> void
//   query(filter) -> aggregate[]

// Fields that must NEVER be written to the org store (privacy). Anything not on the
// allowlist below is dropped by sanitizeAggregate.
const AGGREGATE_ALLOWLIST = new Set([
  "organization", "project", "repository", // scope/partition
  "capabilityClass", "taskClass", "riskBand", "evidenceType",
  "provider", "model", "version", // identity partition
  "contextStrategy", "toolStrategy",
  "sampleCount", "successRate", "proofRate", "reworkRate", "escalationRate",
  "costDistribution", "tokenDistribution", "latencyDistribution",
  "confidence", "timeWindow", "provenanceRefs", // refs/hashes only, not content
  "id", "supersededBy", "supersededReason", "admittedAt"
]);

// Sensitive keys that, if present, indicate a caller tried to leak raw content.
const FORBIDDEN_KEYS = new Set(["prompt", "prompts", "sourceCode", "source", "secret", "secrets", "evidenceContent", "rawEvidence"]);

// Keep only allowlisted TOP-LEVEL fields; drop everything else. For allowlisted
// values that are themselves objects/arrays (e.g. a distribution), recurse and drop
// any FORBIDDEN keys nested inside — a leak must not survive by hiding one level down.
// Returns a NEW object — the input is never mutated.
export function sanitizeAggregate(aggregate = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(aggregate)) {
    if (FORBIDDEN_KEYS.has(key)) continue; // never persist raw content
    if (AGGREGATE_ALLOWLIST.has(key)) clean[key] = scrubNested(value);
    // silently drop unknown keys so a future field cannot leak by accident
  }
  return clean;
}

// Recursively strip FORBIDDEN keys from a nested value. Unlike the top level (a strict
// allowlist), nested objects keep their non-forbidden keys — a distribution's own
// shape is producer-defined — but no forbidden key survives at any depth.
function scrubNested(value) {
  if (Array.isArray(value)) return value.map(scrubNested);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      out[k] = scrubNested(v);
    }
    return out;
  }
  return value;
}

// True if an aggregate carries any forbidden raw-content field at ANY depth.
export function containsRawContent(aggregate = {}) {
  return deepHasForbidden(aggregate);
}

function deepHasForbidden(value) {
  if (Array.isArray(value)) return value.some(deepHasForbidden);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([k, v]) => FORBIDDEN_KEYS.has(k) || deepHasForbidden(v));
  }
  return false;
}

// Partition key for org-wide sharing. Older model-version results must not silently
// determine a newer version's reliability, so version is part of the key.
export function partitionKey({ organization, project = "*", repository = "*", provider = "*", model = "*", version = "*" } = {}) {
  return [organization ?? "*", project, repository, provider, model, version].join("/");
}

// ---------------------------------------------------------------------------
// File-backed reference implementation
// ---------------------------------------------------------------------------

// The store location MUST be passed explicitly. Passing nothing is an error — we never
// fall back to a home-directory or any implicit path.
export function createFileStore({ location } = {}) {
  if (!location || typeof location !== "string") {
    throw new Error("org store location must be configured explicitly (no home-directory default)");
  }
  const root = path.resolve(location);
  const aggregatesFile = path.join(root, "aggregates.jsonl");
  const learningsFile = path.join(root, "learnings.jsonl");

  function ensureRoot() {
    fs.mkdirSync(root, { recursive: true });
  }
  function readJsonl(file) {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }
  function appendJsonl(file, record) {
    ensureRoot();
    fs.appendFileSync(file, JSON.stringify(record) + "\n");
  }

  return {
    location: root,

    // Read comparable execution aggregates for a cohort (partition-filtered).
    readComparable(cohort = {}) {
      const key = partitionKey(cohort);
      return readJsonl(aggregatesFile).filter((a) => matchesPartition(a, cohort) && !a.supersededBy)
        .map((a) => ({ ...a, _partition: key }));
    },

    // Append a PROVEN result aggregate. Sanitizes first and REFUSES raw content — the
    // store is a last line of defense even though the Learning gate should catch it.
    appendProvenResult(aggregate = {}) {
      if (containsRawContent(aggregate)) {
        throw new Error("refusing to store raw content in the org store (privacy): " + Object.keys(aggregate).filter((k) => FORBIDDEN_KEYS.has(k)).join(", "));
      }
      appendJsonl(aggregatesFile, sanitizeAggregate(aggregate));
    },

    readReliability(identity = {}) {
      const matches = this.readComparable(identity);
      if (matches.length === 0) return null; // unknown stays unknown, never 0
      const last = matches[matches.length - 1];
      return { successRate: last.successRate ?? null, sampleCount: last.sampleCount ?? 0, confidence: last.confidence ?? null };
    },

    appendLearning(record = {}) {
      if (containsRawContent(record)) {
        throw new Error("refusing to store raw content in the org store (privacy)");
      }
      appendJsonl(learningsFile, sanitizeAggregate(record));
    },

    // Supersede a prior aggregate/learning (contradicted learning can be replaced).
    supersede(id, reason = "superseded") {
      ensureRoot();
      for (const file of [aggregatesFile, learningsFile]) {
        const records = readJsonl(file);
        let changed = false;
        for (const r of records) {
          if (r.id === id && !r.supersededBy) { r.supersededBy = true; r.supersededReason = reason; changed = true; }
        }
        if (changed) fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
      }
    },

    query(filter = {}) {
      return readJsonl(aggregatesFile).filter((a) => matchesPartition(a, filter));
    }
  };
}

function matchesPartition(aggregate, cohort) {
  for (const field of ["organization", "project", "repository", "provider", "model", "version", "taskClass", "capabilityClass", "riskBand"]) {
    if (cohort[field] !== undefined && cohort[field] !== "*" && aggregate[field] !== cohort[field]) {
      return false;
    }
  }
  return true;
}
