// Harness/model router (DEM-011 / REQ-044).
//
// For each node the router RECOMMENDS a harness and model from the node's traits,
// and emits an inspectable rationale record (node → chosen harness/model + why).
// A config PIN for a node overrides the recommendation unconditionally.
//
// GAP-012 resolution: the router is itself an agent judgment, so it makes no
// correctness claim about its pick. Its acceptability rests entirely on
// INSPECTABILITY (every decision logs a rationale) and OVERRIDABILITY (any node
// can be pinned in config). The engine never trusts the router blindly — a human
// can always read why and force a different choice.

const DEFAULT_HARNESS = "claude";

// Trait-based recommendation. Deliberately simple and deterministic — a legible
// rule set beats an opaque model here, precisely because the pick is unproven.
// config.rules (optional) may map a node type → harness to tune without code.
function recommend(node, config) {
  const rules = config.rules ?? {};
  const type = node.type ?? "implementation";

  if (rules[type]) {
    return { harness: rules[type], why: `config.rules maps type "${type}" → ${rules[type]}` };
  }
  // Built-in defaults reflect the demand's "best of each world" intent.
  if (type === "research") {
    return { harness: "copilot", why: "planning/research favors the planning-strong harness" };
  }
  return { harness: DEFAULT_HARNESS, why: `default harness for type "${type}"` };
}

// Resolve the harness+model for a node. Returns a full routing decision object
// that is always logged, whether pinned or recommended.
export function routeNode(node, config = {}) {
  const pins = config.pins ?? {};
  const pin = pins[node.id];

  let decision;
  if (pin) {
    decision = {
      harness: pin.harness,
      model: pin.model ?? null,
      source: "pin",
      why: `pinned in config for ${node.id}`
    };
  } else {
    const rec = recommend(node, config);
    decision = {
      harness: rec.harness,
      model: modelFor(rec.harness, node, config),
      source: "recommended",
      why: rec.why
    };
  }

  return {
    node_id: node.id,
    node_type: node.type ?? null,
    harness: decision.harness,
    model: decision.model,
    source: decision.source, // "pin" | "recommended" — makes override visible
    rationale: decision.why
  };
}

// Model choice is cost-aware; the concrete policy lives in harness-cost.mjs
// (NODE-044). Here we expose the seam and a null default so the router works
// before cost policy is wired.
export function modelFor(harness, node, config) {
  if (typeof config.selectModel === "function") {
    return config.selectModel(harness, node, config);
  }
  return config.defaultModel ?? null;
}

// The rationale record is the audit artifact REQ-044 requires. Kept as plain data
// so it can be written to disk / shown by `dge show` without special handling.
export function rationaleRecord(decision) {
  return {
    node_id: decision.node_id,
    chose: { harness: decision.harness, model: decision.model },
    source: decision.source,
    why: decision.rationale
  };
}
