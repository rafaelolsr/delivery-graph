import assert from "node:assert/strict";
import test from "node:test";
import {
  DISPATCH_CLASSES,
  classifySpawnResult,
  makeCliAdapter,
  makeAdapterRegistry,
  buildDefaultAdapters,
  dispatchToHarness
} from "../src/harness-adapters.mjs";

// A fake spawn that records how it was called and returns a scripted result.
function fakeSpawn(result) {
  const calls = [];
  const fn = (bin, argv, opts) => {
    calls.push({ bin, argv, opts });
    return typeof result === "function" ? result(bin, argv) : result;
  };
  fn.calls = calls;
  return fn;
}

test("classifySpawnResult maps spawn error to infra_failure", () => {
  assert.equal(classifySpawnResult({ error: new Error("ENOENT") }), DISPATCH_CLASSES.INFRA_FAILURE);
});

test("classifySpawnResult maps a kill signal to infra_failure", () => {
  assert.equal(classifySpawnResult({ signal: "SIGTERM" }), DISPATCH_CLASSES.INFRA_FAILURE);
});

test("classifySpawnResult maps clean exit to ok", () => {
  assert.equal(classifySpawnResult({ status: 0 }), DISPATCH_CLASSES.OK);
});

test("classifySpawnResult maps ran-but-nonzero to work_failure", () => {
  assert.equal(classifySpawnResult({ status: 1 }), DISPATCH_CLASSES.WORK_FAILURE);
});

// REQ-043: the SAME node/task is executable by TWO different adapters, and both
// write results back through the same interface shape.
test("one task dispatches through two different adapters via one interface", () => {
  const spawnImpl = fakeSpawn({ status: 0, stdout: "done", stderr: "" });
  const [claude, copilot] = buildDefaultAdapters({
    claude: { spawnImpl },
    copilot: { spawnImpl }
  });
  const registry = makeAdapterRegistry([claude, copilot]);
  assert.deepEqual(registry.ids(), ["claude", "copilot"]);

  const task = { prompt: "implement NODE-XYZ" };
  const viaClaude = dispatchToHarness(registry, "claude", task);
  const viaCopilot = dispatchToHarness(registry, "copilot", task);

  for (const r of [viaClaude, viaCopilot]) {
    assert.equal(r.class, DISPATCH_CLASSES.OK);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout, "done");
  }
});

// REQ-043 acceptance: adding a harness is just another adapter — no engine change.
test("a brand-new harness plugs in as a registry entry with no core change", () => {
  const spawnImpl = fakeSpawn({ status: 0, stdout: "kimi ran", stderr: "" });
  const kimi = makeCliAdapter({
    id: "kimi",
    bin: "kimi",
    buildArgs: (t) => ["run", t.prompt],
    probe: () => ({ ok: true }),
    spawnImpl
  });
  const registry = makeAdapterRegistry([...buildDefaultAdapters(), kimi]);
  assert.ok(registry.has("kimi"));
  const r = dispatchToHarness(registry, "kimi", { prompt: "x" });
  assert.equal(r.stdout, "kimi ran");
  assert.equal(spawnImpl.calls[0].argv[0], "run");
});

test("available() reports infra unavailability without throwing", () => {
  const spawnImpl = fakeSpawn({ error: new Error("spawn claude ENOENT") });
  const [claude] = buildDefaultAdapters({ claude: { spawnImpl } });
  const status = claude.available();
  assert.equal(status.ok, false);
  assert.match(status.reason, /not runnable/);
});

test("registry.get throws a helpful error for an unknown harness", () => {
  const registry = makeAdapterRegistry(buildDefaultAdapters());
  assert.throws(() => registry.get("nope"), /Unknown harness "nope"/);
});
