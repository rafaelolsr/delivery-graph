// Stage 6.5a — the executor seam: real harness adapter + deterministic fake.
//
// The supervisor loop consumes an injected `executor(agent, subgoal) -> { quality,
// evidence, identity? }`. Stage 6 shipped with a fake (a quality map). This module adds:
//
//   makeFakeExecutor(qualityMap)      — deterministic, offline; the CI default.
//   makeHarnessExecutor(registry,...) — REAL: dispatches an agent's work through the
//                                       existing harness boundary (dispatchToHarness) and
//                                       maps the dispatch CLASS to a quality/evidence
//                                       signal, preserving provider/model identity.
//
// Both satisfy the same interface, so the supervisor never knows which it holds. The
// real executor NEVER fabricates a quality: an infra failure yields `quality: null`
// (unknown, never zero — reuses the M4 rule), a work failure yields a low bounded
// score, and a clean run yields a score derived from the agent's own reliability prior
// (an honest estimate, since a single run is not proof). Real proof still comes from the
// evidence gate downstream; this is a routing/telemetry signal, not a verdict.

import { dispatchToHarness, DISPATCH_CLASSES } from "../harness-adapters.mjs";

// A deterministic fake executor from a role→quality map (optionally role+"-v2").
// This is what tests and offline CI use so runs never call a live model.
export function makeFakeExecutor(qualityMap = {}, { defaultQuality = 0.9 } = {}) {
  return (agent, subgoal) => {
    const key = agent.id.endsWith("-v2") ? `${agent.role}-v2` : agent.role;
    const quality = qualityMap[key] ?? qualityMap[agent.role] ?? defaultQuality;
    return { quality, evidence: `${agent.id}:${subgoal?.id ?? "task"}:fake`, identity: { provider: "fake", model: agent.model ?? null } };
  };
}

// A REAL executor that runs an agent's subgoal through the harness registry. `taskFor`
// builds the harness task from (agent, subgoal); it is injected so this stays decoupled
// from any prompt/packaging detail. `harnessOf(agent)` picks which harness id to use
// (defaults to the agent's model/tool). Returns quality/evidence + the executed identity.
export function makeHarnessExecutor(registry, {
  taskFor = defaultTaskFor,
  harnessOf = (agent) => agent.harness ?? agent.model ?? "claude"
} = {}) {
  return (agent, subgoal) => {
    const harnessId = harnessOf(agent);
    let dispatch;
    try {
      dispatch = dispatchToHarness(registry, harnessId, taskFor(agent, subgoal));
    } catch (error) {
      // Could not even reach the harness → infra unknown, NOT a zero-quality verdict.
      return { quality: null, evidence: null, identity: { provider: harnessId, model: agent.model ?? null }, dispatchClass: "infra_failure", error: error.message };
    }
    return { ...qualityFromDispatch(dispatch, agent), identity: { provider: harnessId, model: agent.model ?? null }, dispatchClass: dispatch.class };
  };
}

// Map a dispatch result CLASS to a routing-quality signal + evidence reference.
//   infra_failure → quality null (unknown, the harness never ran the work)
//   work_failure  → low bounded quality (it ran and failed)
//   ok            → an honest estimate from the agent's reliability prior (a single run
//                   is not proof; the evidence gate remains the real judge)
export function qualityFromDispatch(dispatch, agent) {
  if (dispatch.class === DISPATCH_CLASSES.INFRA_FAILURE) {
    return { quality: null, evidence: null };
  }
  const evidence = evidenceRef(dispatch, agent);
  if (dispatch.class === DISPATCH_CLASSES.WORK_FAILURE) {
    return { quality: 0.1, evidence };
  }
  // ok: estimate from the agent's proven reliability prior, defaulting conservatively
  // when unknown (never claim a high score from no history).
  const prior = agent.reliability?.successRate;
  const quality = typeof prior === "number" ? prior : 0.5;
  return { quality, evidence };
}

// Only a REFERENCE to the run is carried, never raw stdout — the org store forbids raw
// content, and the OKF mapping keeps run output as runtime-only. We record a hash-like
// reference (exit code + byte length) so provenance survives without leaking content.
function evidenceRef(dispatch, agent) {
  const len = (dispatch.stdout ?? "").length;
  return `run:${agent.id}:exit${dispatch.exitCode ?? 0}:bytes${len}`;
}

function defaultTaskFor(agent, subgoal) {
  return { role: agent.role, capability: agent.capabilities?.[0], subgoal: subgoal?.id, statement: subgoal?.statement };
}
