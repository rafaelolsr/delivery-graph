// Cost-aware model selection (DEM-011 / REQ-046).
//
// Given a cost policy, pick a cheaper model for lower-complexity nodes and a more
// capable (costlier) model for higher-complexity ones. The chosen model flows into
// the router's rationale record (via the modelFor / selectModel seam), so the cost
// decision is as inspectable as the harness decision.

// A node's complexity tier from its traits. Deliberately coarse and legible.
// config.complexityOf(node) may override for repo-specific heuristics.
export function complexityOf(node, config = {}) {
  if (typeof config.complexityOf === "function") {
    return config.complexityOf(node);
  }
  const type = node.type ?? "implementation";
  if (type === "docs" || type === "research") return "low";
  if (type === "test") return "low";
  return "high"; // implementation and anything unknown → treat as high
}

// Build a selectModel(harness, node) function from a cost policy. The policy maps
// harness → { low, high } model ids. Falls back to a single `default` per harness,
// then to null, so partial policies are safe.
export function makeModelSelector(policy = {}) {
  return (harness, node, config = {}) => {
    const tier = complexityOf(node, config);
    const forHarness = policy[harness] ?? {};
    return forHarness[tier] ?? forHarness.default ?? null;
  };
}

// Convenience: the default v1 cost policy — cheap model for low tier, capable model
// for high tier, per harness. Real ids are configuration; these are placeholders that
// make the tiers observable in tests and rationale.
export const DEFAULT_COST_POLICY = Object.freeze({
  claude: { low: "claude-haiku", high: "claude-opus" },
  copilot: { low: "gpt-mini", high: "gpt-full" }
});
