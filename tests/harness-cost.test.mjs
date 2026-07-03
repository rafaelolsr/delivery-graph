import assert from "node:assert/strict";
import test from "node:test";
import { makeModelSelector, complexityOf, DEFAULT_COST_POLICY } from "../src/harness-cost.mjs";
import { routeNode, rationaleRecord } from "../src/harness-router.mjs";

test("complexityOf: docs/research/test are low, implementation is high", () => {
  assert.equal(complexityOf({ type: "docs" }), "low");
  assert.equal(complexityOf({ type: "research" }), "low");
  assert.equal(complexityOf({ type: "test" }), "low");
  assert.equal(complexityOf({ type: "implementation" }), "high");
});

test("a low-complexity node resolves to a cheaper model than a high-complexity node", () => {
  const selectModel = makeModelSelector(DEFAULT_COST_POLICY);
  const low = selectModel("claude", { type: "docs" });
  const high = selectModel("claude", { type: "implementation" });
  assert.equal(low, "claude-haiku");
  assert.equal(high, "claude-opus");
  assert.notEqual(low, high);
});

test("the chosen model appears in the router rationale artifact", () => {
  const selectModel = makeModelSelector(DEFAULT_COST_POLICY);
  // Route a high-complexity node with the cost selector wired via the router seam.
  const decision = routeNode({ id: "NODE-200", type: "implementation" }, { selectModel });
  assert.equal(decision.model, "claude-opus");

  const record = rationaleRecord(decision);
  assert.equal(record.chose.model, "claude-opus", "cost decision is inspectable in the rationale");
});

test("partial policies fall back safely to default then null", () => {
  const selectModel = makeModelSelector({ claude: { default: "claude-only" } });
  assert.equal(selectModel("claude", { type: "docs" }), "claude-only");
  assert.equal(selectModel("copilot", { type: "docs" }), null);
});

test("config.complexityOf overrides the built-in heuristic", () => {
  const selectModel = makeModelSelector(DEFAULT_COST_POLICY);
  const model = selectModel("claude", { type: "implementation" }, {
    complexityOf: () => "low"
  });
  assert.equal(model, "claude-haiku");
});
