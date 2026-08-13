// Observation + stall/marginal-progress detection (M6).
//
// Captures meaningful execution signals and decides whether continuing is worthwhile.
// The spec is explicit: do NOT stop merely because a task exceeded a guessed duration;
// use progress and the expected value of continuing. Do NOT create heavyweight records
// for every token — an observation summarizes an interval.

// makeObservation: a single progress snapshot. Deltas are computed against the prior
// observation by observeProgress; raw token/cost streams are NOT stored here (they are
// runtime-only per the OKF mapping) — only summarized signals.
export function makeObservation({
  attempt = 1, evidenceProduced = 0, toolSuccess = null,
  tokens = null, cost = null, elapsedMs = null,
  contextSaturation = null, invalidatedAssumptions = [], newRisks = [], at = null
} = {}) {
  return {
    attempt, evidenceProduced, toolSuccess, tokens, cost, elapsedMs,
    contextSaturation, invalidatedAssumptions, newRisks, at
  };
}

export const PROGRESS_SIGNALS = Object.freeze({
  HEALTHY: "healthy",
  STALLED: "stalled", // repeated attempts, no new evidence
  MARGINAL: "marginal", // still moving, but each attempt yields little
  SATURATED: "saturated", // context is (near) full
  ASSUMPTION_INVALIDATED: "assumption_invalidated" // a spec assumption broke
});

// observeProgress: compare a window of observations (oldest→newest) and classify.
// Returns { signal, reason, evidenceDelta, attempts }.
export function observeProgress(observations = [], { stallAttempts = 3, saturationThreshold = 0.9 } = {}) {
  if (observations.length === 0) return { signal: PROGRESS_SIGNALS.HEALTHY, reason: "no observations yet", evidenceDelta: 0, attempts: 0 };
  const latest = observations[observations.length - 1];
  const attempts = latest.attempt;

  // A broken assumption is the strongest signal — it can invalidate the spec (§ return-to-Spec).
  if (latest.invalidatedAssumptions.length > 0) {
    return { signal: PROGRESS_SIGNALS.ASSUMPTION_INVALIDATED, reason: `invalidated: ${latest.invalidatedAssumptions.join("; ")}`, evidenceDelta: 0, attempts };
  }
  if (latest.contextSaturation !== null && latest.contextSaturation >= saturationThreshold) {
    return { signal: PROGRESS_SIGNALS.SATURATED, reason: `context saturation ${latest.contextSaturation}`, evidenceDelta: 0, attempts };
  }

  // Evidence delta across the observed window.
  const first = observations[0];
  const evidenceDelta = latest.evidenceProduced - first.evidenceProduced;

  // Stall: enough attempts, zero new evidence across the window.
  if (attempts >= stallAttempts && evidenceDelta === 0) {
    return { signal: PROGRESS_SIGNALS.STALLED, reason: `${attempts} attempts with no new evidence`, evidenceDelta, attempts };
  }
  // Marginal: multiple attempts, but evidence per attempt is tiny.
  if (observations.length >= 2 && evidenceDelta > 0 && evidenceDelta < observations.length) {
    return { signal: PROGRESS_SIGNALS.MARGINAL, reason: `only ${evidenceDelta} new evidence over ${observations.length} observations`, evidenceDelta, attempts };
  }
  return { signal: PROGRESS_SIGNALS.HEALTHY, reason: `${evidenceDelta} new evidence`, evidenceDelta, attempts };
}

// Given a progress signal, recommend an intervention. This never STOPS on duration
// alone — a healthy/marginal task with positive expected value continues. Returns one
// of the spec's intervention verbs plus a rationale.
export const INTERVENTIONS = Object.freeze({
  CONTINUE: "continue",
  MORE_CONTEXT: "provide_more_context",
  CHANGE_CONTEXT_STRATEGY: "change_context_strategy",
  SWITCH_MODEL: "switch_model",
  SWITCH_AGENT: "switch_agent",
  ESCALATE_REASONING: "escalate_reasoning",
  RETRY_DIFFERENT_STRATEGY: "retry_with_different_strategy",
  SPLIT: "split_task",
  RETURN_TO_SPEC: "return_to_spec",
  STOP_ASK_HUMAN: "stop_request_human_judgment"
});

export function recommendIntervention(progress, { hasStrongerModel = false, expectedValueOfContinuing = null } = {}) {
  switch (progress.signal) {
    case PROGRESS_SIGNALS.ASSUMPTION_INVALIDATED:
      return { intervention: INTERVENTIONS.RETURN_TO_SPEC, reason: "an observation invalidated the specification" };
    case PROGRESS_SIGNALS.SATURATED:
      return { intervention: INTERVENTIONS.CHANGE_CONTEXT_STRATEGY, reason: "context is saturated; change strategy before continuing" };
    case PROGRESS_SIGNALS.STALLED:
      // Repeated attempts with no new evidence must NOT continue indefinitely. Prefer a
      // stronger model if one exists; otherwise stop and ask a human.
      return hasStrongerModel
        ? { intervention: INTERVENTIONS.SWITCH_MODEL, reason: "stalled with a stronger eligible model available" }
        : { intervention: INTERVENTIONS.STOP_ASK_HUMAN, reason: "stalled with no stronger strategy; requesting human judgment" };
    case PROGRESS_SIGNALS.MARGINAL:
      // Only continue if the expected value justifies the marginal progress.
      if (expectedValueOfContinuing !== null && expectedValueOfContinuing <= 0) {
        return { intervention: INTERVENTIONS.RETRY_DIFFERENT_STRATEGY, reason: "marginal progress with non-positive expected value" };
      }
      return { intervention: INTERVENTIONS.CONTINUE, reason: "marginal but positive expected value of continuing" };
    default:
      return { intervention: INTERVENTIONS.CONTINUE, reason: progress.reason };
  }
}
