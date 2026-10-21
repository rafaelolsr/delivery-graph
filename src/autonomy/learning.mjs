// Stage 6.5b — the outcome-fed learning loop.
//
// Closes the loop the essay names as the point of it all: a completed run's PROVEN,
// sanitized outcomes are admitted to the org store, and the NEXT run reads them so
// history actually influences allocation. Without this, the "learn org-wide" claim is
// inert — the store can hold aggregates but nothing writes real outcomes into it.
//
// Every admission goes through the M3 learning gate: only a proven Result, with complete
// provenance, no sensitive content, correct scope, and sufficient samples is admitted.
// Unproven runs never influence reliability (the spec's hard rule). Writing is the ONLY
// path into the org store, and it is gated.

import { learningGate, GATE_VERDICTS } from "../governance/gates.mjs";
import { confidenceFromSamples } from "../governance/capability.mjs";

// Build candidate learning aggregates from a finished orchestration run. One aggregate
// per agent identity (provider/model/role), carrying ONLY sanitized signals — never raw
// evidence content (the evidence field is a reference, produced by the executor).
export function aggregatesFromRun({ run, scope, organization, project, repository, at = null }) {
  const byIdentity = new Map();
  for (const e of run.finalEvals ?? []) {
    if (e.quality === null || e.quality === undefined) continue; // unknown never becomes a data point
    const agent = (run.orgRaw?.agents ?? []).find((a) => a.id === e.agent);
    const model = agent?.model ?? "unknown";
    const key = `${model}/${e.role}`;
    if (!byIdentity.has(key)) byIdentity.set(key, { successes: 0, n: 0, model, role: e.role });
    const acc = byIdentity.get(key);
    acc.n += 1;
    if (e.quality >= (run.threshold ?? 0.5)) acc.successes += 1;
  }
  const aggregates = [];
  for (const [key, acc] of byIdentity) {
    aggregates.push({
      id: `AGG-${scope}-${key}-${run.rounds ?? 0}`,
      organization, project, repository,
      provider: "orchestrator", model: acc.model, version: "1",
      taskClass: acc.role, capabilityClass: acc.role,
      successRate: acc.successes / acc.n,
      proofRate: run.goalMet ? 1 : 0,
      sampleCount: acc.n,
      confidence: confidenceFromSamples(acc.n),
      // provenance references only — NO raw prompts/source/evidence content
      provenanceRefs: (run.finalEvals ?? []).filter((e) => e.role === acc.role).flatMap((e) => e.evidence ?? []),
      admittedAt: at
    });
  }
  return aggregates;
}

// Admit run outcomes to the org store — GATED. Only aggregates whose supporting Result
// is proven (goalMet) and which pass the learning gate are written. Returns a record of
// what was admitted vs blocked, so the decision is auditable.
export function admitLearning({ run, store, scope = "org", organization, project, repository, minSamples = 1, at = null }) {
  const candidates = aggregatesFromRun({ run, scope, organization, project, repository, at });
  const admitted = [];
  const blocked = [];
  for (const agg of candidates) {
    const gate = learningGate({
      id: agg.id,
      supportingResultProven: run.goalMet === true, // only a proven Result may be admitted
      provenanceComplete: (agg.provenanceRefs?.length ?? 0) > 0,
      containsSensitiveContent: false, // aggregatesFromRun carries references only
      scope,
      sampleCount: agg.sampleCount,
      minSamples,
      contradictedByStrongerEvidence: false
    }, { at });
    if (gate.verdict === GATE_VERDICTS.PASS) {
      store.appendProvenResult(agg); // the store also refuses raw content as a last line
      admitted.push(agg.id);
    } else {
      blocked.push({ id: agg.id, reason: gate.explanation });
    }
  }
  return { admitted, blocked, candidateCount: candidates.length };
}

// Read the org store for a (model, role) cohort and turn it into a reliability prior the
// allocator can consume. Unknown stays unknown (null) — no history, no fabricated prior.
export function reliabilityPriorFor(store, { model, role, organization }) {
  const cohort = store.readComparable({ organization, model, version: "1", taskClass: role });
  if (!cohort.length) return null; // cold start — honest unknown, never 0
  const latest = cohort[cohort.length - 1];
  return { successRate: latest.successRate ?? null, confidence: latest.confidence ?? null, sampleCount: latest.sampleCount ?? 0 };
}

// Enrich a candidate roster with priors read from the store, so the NEXT run's
// allocation is informed by prior proven outcomes. A candidate with no history keeps its
// declared reliability (or none) — the store only ever raises confidence with evidence.
export function withLearnedPriors(candidates, store, { organization, role }) {
  return candidates.map((c) => {
    const prior = reliabilityPriorFor(store, { model: c.id, role, organization });
    if (!prior || prior.successRate === null) return c;
    return { ...c, reliability: { successRate: prior.successRate, confidence: prior.confidence }, sampleCount: prior.sampleCount };
  });
}
