import { spawnSync } from "node:child_process";

// Harness-agnostic execution adapters (DEM-011 / REQ-043).
//
// DGE dispatches a node's work through a uniform adapter interface so any harness
// (Claude Code, Copilot, …) can execute a node against the same graph contract.
// The contract (defined in NODE-040) is three operations:
//
//   adapter.id                → stable string ("claude", "copilot", …)
//   adapter.available()       → { ok, reason? }  cheap infra probe (CLI present etc.)
//   adapter.dispatch(task)    → { class, exitCode, stdout, stderr }
//        class ∈ "ok" | "infra_failure" | "work_failure"
//
// The `class` field is the heart of the contract and drives REQ-045 fallback:
//   infra_failure → could not run (spawn error / auth / network / timeout) → fall back
//   work_failure  → ran, but the work/evidence failed → BLOCK, never fall back
//   ok            → ran cleanly → the evidence gate then judges the result
//
// This mirrors the split bin/dge.mjs already uses in runCapturedEvidence:
// spawnSync().error = could-not-start = infra; ran-with-nonzero = work.

export const DISPATCH_CLASSES = Object.freeze({
  OK: "ok",
  INFRA_FAILURE: "infra_failure",
  WORK_FAILURE: "work_failure"
});

// Classify a spawnSync result into the contract's three classes.
// `spawnImpl` is injectable so tests can drive every branch without real CLIs.
export function classifySpawnResult(result) {
  if (result.error) {
    // Could not start the process at all — missing binary, permission, etc.
    return DISPATCH_CLASSES.INFRA_FAILURE;
  }
  if (result.signal === "SIGTERM" || result.signal === "SIGKILL") {
    // Killed (e.g. our own timeout) — treat as infra, the work never completed.
    return DISPATCH_CLASSES.INFRA_FAILURE;
  }
  const exitCode = result.status ?? 1;
  return exitCode === 0 ? DISPATCH_CLASSES.OK : DISPATCH_CLASSES.WORK_FAILURE;
}

// Build a real CLI-backed adapter. `probe` decides availability; `buildArgs`
// turns a task into the argv for this harness. spawnImpl is injectable for tests.
export function makeCliAdapter({ id, bin, buildArgs, probe, spawnImpl = spawnSync }) {
  return {
    id,
    available() {
      try {
        return probe(spawnImpl);
      } catch (error) {
        return { ok: false, reason: error.message };
      }
    },
    dispatch(task) {
      const argv = buildArgs(task);
      const result = spawnImpl(bin, argv, {
        cwd: task.cwd ?? process.cwd(),
        env: { ...process.env, ...(task.env ?? {}) },
        encoding: "utf8",
        timeout: task.timeoutMs,
        maxBuffer: 10 * 1024 * 1024
      });
      return {
        class: classifySpawnResult(result),
        exitCode: result.status ?? (result.error ? null : 1),
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? (result.error ? result.error.message : "")
      };
    }
  };
}

// A default availability probe: run `bin --version` and treat a clean start as available.
function cliVersionProbe(bin) {
  return (spawnImpl) => {
    const result = spawnImpl(bin, ["--version"], { encoding: "utf8", timeout: 5000 });
    if (result.error) return { ok: false, reason: `${bin} not runnable: ${result.error.message}` };
    return { ok: true };
  };
}

// v1 harness matrix (NODE-040 / GAP-013): claude + copilot. kimi/codex/opencode
// are fast-follow additions — a new makeCliAdapter entry here, no engine change.
export function buildDefaultAdapters(overrides = {}) {
  const claude = makeCliAdapter({
    id: "claude",
    bin: "claude",
    buildArgs: (task) => ["-p", task.prompt ?? ""],
    probe: cliVersionProbe("claude"),
    ...overrides.claude
  });
  const copilot = makeCliAdapter({
    id: "copilot",
    bin: "copilot",
    buildArgs: (task) => ["-p", task.prompt ?? ""],
    probe: cliVersionProbe("copilot"),
    ...overrides.copilot
  });
  return [claude, copilot];
}

// A registry over a set of adapters, keyed by id.
export function makeAdapterRegistry(adapters = buildDefaultAdapters()) {
  const byId = new Map(adapters.map((a) => [a.id, a]));
  return {
    ids: () => [...byId.keys()],
    get(id) {
      const adapter = byId.get(id);
      if (!adapter) {
        throw new Error(`Unknown harness "${id}". Registered: ${[...byId.keys()].join(", ") || "(none)"}`);
      }
      return adapter;
    },
    has: (id) => byId.has(id)
  };
}

// Dispatch a task to one harness through the registry. Thin uniform seam that
// every harness goes through — the "any agent writes back through the same
// interface" guarantee of REQ-043.
export function dispatchToHarness(registry, harnessId, task) {
  return registry.get(harnessId).dispatch(task);
}

// Dispatch with fallback (DEM-011 / REQ-045).
//
// Walk the harness chain in order. The rule that keeps the evidence gate sovereign
// (GAP-011 resolution):
//   - infra_failure → the harness could not RUN the work → try the next harness.
//   - work_failure  → the harness RAN and the work failed → STOP and block the node.
//                     Never fall back: a real defect must not be laundered into a
//                     pass by retrying on another harness until one happens to work.
//   - ok            → return; the evidence gate then judges the actual result.
//
// Returns { class, harness, attempts:[{harness, class}], result }. When the whole
// chain is exhausted by infra failures, class is "infra_failure" and no harness ran
// the work — a distinct, reportable outcome (not a silent pass).
export function dispatchWithFallback(registry, chain, task) {
  const attempts = [];
  for (const harnessId of chain) {
    const result = registry.get(harnessId).dispatch(task);
    attempts.push({ harness: harnessId, class: result.class });

    if (result.class === DISPATCH_CLASSES.WORK_FAILURE) {
      // Ran but failed the work — block here. No fallback. Gate stays sovereign.
      return { class: DISPATCH_CLASSES.WORK_FAILURE, harness: harnessId, attempts, result };
    }
    if (result.class === DISPATCH_CLASSES.OK) {
      return { class: DISPATCH_CLASSES.OK, harness: harnessId, attempts, result };
    }
    // infra_failure → fall through to the next harness in the chain.
  }
  // Every harness failed to run the work.
  return { class: DISPATCH_CLASSES.INFRA_FAILURE, harness: null, attempts, result: null };
}
