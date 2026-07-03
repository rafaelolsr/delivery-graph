import assert from "node:assert/strict";
import test from "node:test";
import { routeNode, rationaleRecord, modelFor } from "../src/harness-router.mjs";

test("every routing decision emits an inspectable record: node → harness/model + why", () => {
  const decision = routeNode({ id: "NODE-100", type: "implementation" });
  assert.equal(decision.node_id, "NODE-100");
  assert.ok(decision.harness, "a harness was chosen");
  assert.equal(decision.source, "recommended");
  assert.ok(decision.rationale.length > 0, "a human-readable why is present");

  const record = rationaleRecord(decision);
  assert.deepEqual(record.chose, { harness: decision.harness, model: decision.model });
  assert.equal(record.node_id, "NODE-100");
});

test("a config pin overrides the recommendation regardless of traits", () => {
  const node = { id: "NODE-101", type: "research" };
  const recommended = routeNode(node);
  const pinned = routeNode(node, { pins: { "NODE-101": { harness: "kimi", model: "kimi-k2" } } });

  assert.notEqual(recommended.source, "pin");
  assert.equal(pinned.source, "pin");
  assert.equal(pinned.harness, "kimi");
  assert.equal(pinned.model, "kimi-k2");
  assert.match(pinned.rationale, /pinned/);
});

test("config.rules tune the recommendation without code changes", () => {
  const node = { id: "NODE-102", type: "implementation" };
  const decision = routeNode(node, { rules: { implementation: "copilot" } });
  assert.equal(decision.harness, "copilot");
  assert.match(decision.rationale, /config\.rules/);
});

test("research nodes default to the planning-strong harness", () => {
  const decision = routeNode({ id: "NODE-103", type: "research" });
  assert.equal(decision.harness, "copilot");
});

test("modelFor delegates to a cost policy when provided (NODE-044 seam)", () => {
  const node = { id: "NODE-104", type: "implementation" };
  const model = modelFor("claude", node, {
    selectModel: (harness, n) => (n.type === "implementation" ? "big-model" : "small-model")
  });
  assert.equal(model, "big-model");
});
