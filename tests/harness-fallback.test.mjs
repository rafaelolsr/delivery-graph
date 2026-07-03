import assert from "node:assert/strict";
import test from "node:test";
import {
  DISPATCH_CLASSES,
  makeAdapterRegistry,
  dispatchWithFallback
} from "../src/harness-adapters.mjs";

// A stub adapter whose dispatch returns a fixed class, recording invocation.
function stubAdapter(id, cls) {
  const adapter = {
    id,
    calls: 0,
    available: () => ({ ok: true }),
    dispatch() {
      adapter.calls += 1;
      return { class: cls, exitCode: cls === DISPATCH_CLASSES.OK ? 0 : 1, stdout: "", stderr: "" };
    }
  };
  return adapter;
}

test("infra failure on the primary falls back to the next harness", () => {
  const primary = stubAdapter("claude", DISPATCH_CLASSES.INFRA_FAILURE);
  const backup = stubAdapter("copilot", DISPATCH_CLASSES.OK);
  const registry = makeAdapterRegistry([primary, backup]);

  const outcome = dispatchWithFallback(registry, ["claude", "copilot"], { prompt: "x" });

  assert.equal(outcome.class, DISPATCH_CLASSES.OK);
  assert.equal(outcome.harness, "copilot");
  assert.equal(primary.calls, 1);
  assert.equal(backup.calls, 1);
  assert.deepEqual(outcome.attempts.map((a) => a.class), [
    DISPATCH_CLASSES.INFRA_FAILURE,
    DISPATCH_CLASSES.OK
  ]);
});

test("a work failure BLOCKS and never falls back (gate stays sovereign)", () => {
  const primary = stubAdapter("claude", DISPATCH_CLASSES.WORK_FAILURE);
  const backup = stubAdapter("copilot", DISPATCH_CLASSES.OK);
  const registry = makeAdapterRegistry([primary, backup]);

  const outcome = dispatchWithFallback(registry, ["claude", "copilot"], { prompt: "x" });

  assert.equal(outcome.class, DISPATCH_CLASSES.WORK_FAILURE);
  assert.equal(outcome.harness, "claude");
  assert.equal(primary.calls, 1);
  // The critical assertion: the backup was NEVER tried on a work failure.
  assert.equal(backup.calls, 0, "work failure must not be laundered through another harness");
});

test("a failing task cannot be laundered into a pass by harness roulette", () => {
  // Three harnesses, all of which would 'succeed' at running — but the FIRST one
  // already reports the work failed. Fallback must stop, not shop for a green light.
  const a = stubAdapter("claude", DISPATCH_CLASSES.WORK_FAILURE);
  const b = stubAdapter("copilot", DISPATCH_CLASSES.OK);
  const c = stubAdapter("kimi", DISPATCH_CLASSES.OK);
  const registry = makeAdapterRegistry([a, b, c]);

  const outcome = dispatchWithFallback(registry, ["claude", "copilot", "kimi"], { prompt: "x" });

  assert.equal(outcome.class, DISPATCH_CLASSES.WORK_FAILURE);
  assert.equal(b.calls, 0);
  assert.equal(c.calls, 0);
});

test("a chain exhausted by infra failures reports infra_failure, not a pass", () => {
  const a = stubAdapter("claude", DISPATCH_CLASSES.INFRA_FAILURE);
  const b = stubAdapter("copilot", DISPATCH_CLASSES.INFRA_FAILURE);
  const registry = makeAdapterRegistry([a, b]);

  const outcome = dispatchWithFallback(registry, ["claude", "copilot"], { prompt: "x" });

  assert.equal(outcome.class, DISPATCH_CLASSES.INFRA_FAILURE);
  assert.equal(outcome.harness, null);
  assert.equal(outcome.result, null);
});
