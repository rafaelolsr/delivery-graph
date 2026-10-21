// Stage 6.5c — counterfactual A/B evaluation of a reorganization.
//
// The teeth of the loop. Stage 6 kept a reorg when the replaced agent's SELF-ASSIGNED
// quality rose. That is the failure mode the whole governance substrate exists to
// prevent: a system grading its own homework. This module instead runs the BEFORE-org
// and the AFTER-org on the SAME held-out task set and compares MEASURED outcomes, so a
// reorg is retained only if it demonstrably beats the org it replaced — not because it
// scored itself higher.
//
// Deterministic + offline: the executor is injected. The held-out set is passed in (work
// the org did not tune against), so improvement is not measured on the same signal that
// triggered the reorg — avoiding the classic overfit the M8/holdout work already guards.

// Measure one org's aggregate outcome on a held-out subgoal set. Returns a scalar in
// [0,1] plus the per-agent detail. Unknown-quality runs are EXCLUDED from the mean (they
// are not evidence), and an org that produced no measurable output scores null, not 0.
export function measureOrg(org, heldOutSubgoals, executor) {
  const scores = [];
  const detail = [];
  for (const sg of heldOutSubgoals) {
    for (const agent of org.agents.filter((a) => sg.requiredCapabilities.includes(a.role))) {
      const out = executor(agent, sg);
      if (out.quality === null || out.quality === undefined) {
        detail.push({ agent: agent.id, subgoal: sg.id, quality: null });
        continue; // unknown is not a data point
      }
      scores.push(out.quality);
      detail.push({ agent: agent.id, subgoal: sg.id, quality: out.quality });
    }
  }
  const measured = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return { measured, samples: scores.length, detail };
}

export const AB_VERDICTS = Object.freeze({
  KEEP_AFTER: "keep_after", // the reorg measurably won
  KEEP_BEFORE: "keep_before", // the reorg did not win → revert
  INCONCLUSIVE: "inconclusive" // not enough signal to justify the change → revert (conservative)
});

// Compare before vs after on held-out work. `minMargin` is how much better AFTER must
// measure to justify keeping the change — a tie or a marginal gain is INCONCLUSIVE and
// reverts, because a reorg must EARN its place (the org does not keep churn it cannot
// justify). Returns a full, auditable record.
export function counterfactualAB({ before, after, heldOutSubgoals, executor, minMargin = 0.05, at = null }) {
  const b = measureOrg(before, heldOutSubgoals, executor);
  const a = measureOrg(after, heldOutSubgoals, executor);

  let verdict;
  if (a.measured === null || b.measured === null) {
    // Could not measure one side → cannot claim improvement → keep the incumbent.
    verdict = AB_VERDICTS.INCONCLUSIVE;
  } else if (a.measured - b.measured >= minMargin) {
    verdict = AB_VERDICTS.KEEP_AFTER;
  } else {
    verdict = a.measured > b.measured ? AB_VERDICTS.INCONCLUSIVE : AB_VERDICTS.KEEP_BEFORE;
  }

  return {
    verdict,
    beforeScore: b.measured,
    afterScore: a.measured,
    margin: a.measured !== null && b.measured !== null ? Number((a.measured - b.measured).toFixed(4)) : null,
    minMargin,
    keptAfter: verdict === AB_VERDICTS.KEEP_AFTER,
    explanation:
      verdict === AB_VERDICTS.KEEP_AFTER
        ? `after measured ${a.measured} vs before ${b.measured} on ${heldOutSubgoals.length} held-out task(s) — margin ≥ ${minMargin}, kept`
        : verdict === AB_VERDICTS.KEEP_BEFORE
          ? `after (${a.measured}) did not beat before (${b.measured}) on held-out work — reverted`
          : `improvement below the ${minMargin} margin or unmeasurable — reverted (a reorg must earn its place)`,
    at
  };
}
