import assert from "node:assert/strict";
import test from "node:test";
import { makeFakeExecutor, makeHarnessExecutor, qualityFromDispatch } from "../../src/autonomy/executor.mjs";
import { makeAdapterRegistry, DISPATCH_CLASSES } from "../../src/harness-adapters.mjs";

// A stub adapter registry whose dispatch returns a fixed class — no real CLI.
function stubRegistry(dispatchResult) {
  return makeAdapterRegistry([
    { id: "claude", available: () => ({ ok: true }), dispatch: () => dispatchResult }
  ]);
}

test("the fake executor is deterministic and offline", () => {
  const exec = makeFakeExecutor({ code_change: 0.2, "code_change-v2": 0.9 });
  const weak = exec({ id: "AGENT-code_change", role: "code_change" }, { id: "SG-1" });
  const strong = exec({ id: "AGENT-code_change-v2", role: "code_change" }, { id: "SG-1" });
  assert.equal(weak.quality, 0.2);
  assert.equal(strong.quality, 0.9);
  assert.match(weak.evidence, /fake/);
  // same inputs → same output
  assert.deepEqual(exec({ id: "AGENT-code_change", role: "code_change" }, { id: "SG-1" }), weak);
});

test("real executor: an OK dispatch yields a quality from the agent's reliability prior (not a fabricated 1)", () => {
  const registry = stubRegistry({ class: DISPATCH_CLASSES.OK, exitCode: 0, stdout: "done" });
  const exec = makeHarnessExecutor(registry);
  const out = exec({ id: "A", role: "code_change", harness: "claude", model: "opus", reliability: { successRate: 0.97 } }, { id: "SG" });
  assert.equal(out.quality, 0.97); // from prior, honest estimate
  assert.equal(out.dispatchClass, "ok");
  assert.equal(out.identity.provider, "claude");
});

test("real executor: an OK dispatch with NO reliability prior estimates conservatively (never high-from-nothing)", () => {
  const registry = stubRegistry({ class: DISPATCH_CLASSES.OK, exitCode: 0, stdout: "x" });
  const exec = makeHarnessExecutor(registry);
  const out = exec({ id: "A", role: "research", harness: "claude", model: "haiku" }, { id: "SG" });
  assert.equal(out.quality, 0.5); // conservative default, not 1
});

test("real executor: a WORK failure yields a low bounded quality (it ran and failed)", () => {
  const registry = stubRegistry({ class: DISPATCH_CLASSES.WORK_FAILURE, exitCode: 1, stdout: "boom" });
  const out = makeHarnessExecutor(registry)({ id: "A", role: "code_change", harness: "claude", model: "opus" }, { id: "SG" });
  assert.equal(out.quality, 0.1);
  assert.equal(out.dispatchClass, "work_failure");
});

test("real executor: an INFRA failure yields UNKNOWN quality (null), never zero", () => {
  const registry = stubRegistry({ class: DISPATCH_CLASSES.INFRA_FAILURE, exitCode: null });
  const out = makeHarnessExecutor(registry)({ id: "A", role: "code_change", harness: "claude", model: "opus" }, { id: "SG" });
  assert.equal(out.quality, null); // unknown ≠ 0 (M4 rule)
  assert.equal(out.dispatchClass, "infra_failure");
});

test("real executor: a registry error is caught as infra-unknown, not a crash or a zero", () => {
  const registry = makeAdapterRegistry([]); // no adapters → get() throws
  const out = makeHarnessExecutor(registry)({ id: "A", role: "code_change", harness: "claude", model: "opus" }, { id: "SG" });
  assert.equal(out.quality, null);
  assert.equal(out.dispatchClass, "infra_failure");
  assert.ok(out.error);
});

test("evidence is a REFERENCE, never raw stdout (no content leak)", () => {
  const registry = stubRegistry({ class: DISPATCH_CLASSES.OK, exitCode: 0, stdout: "SECRET OUTPUT should not appear" });
  const out = makeHarnessExecutor(registry)({ id: "A", role: "code_change", harness: "claude", model: "opus", reliability: { successRate: 0.8 } }, { id: "SG" });
  assert.doesNotMatch(out.evidence, /SECRET OUTPUT/);
  assert.match(out.evidence, /^run:A:exit0:bytes\d+$/);
});

test("qualityFromDispatch is the pure mapping under test", () => {
  assert.equal(qualityFromDispatch({ class: DISPATCH_CLASSES.INFRA_FAILURE }, {}).quality, null);
  assert.equal(qualityFromDispatch({ class: DISPATCH_CLASSES.WORK_FAILURE, exitCode: 1 }, { id: "A" }).quality, 0.1);
  assert.equal(qualityFromDispatch({ class: DISPATCH_CLASSES.OK, exitCode: 0 }, { id: "A", reliability: { successRate: 0.9 } }).quality, 0.9);
});
