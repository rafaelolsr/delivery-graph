// Stage 6 — goal decomposition + capability discovery (S6.1).
//
// The inversion from Stage 5: instead of a human authoring the task graph and the agent
// roster, the system takes a BARE GOAL plus constraints and derives the subgoals and the
// capabilities they require. It then DISCOVERS which capabilities are actually available
// from an explicit capability registry (never a hardcoded workflow, never a home-dir
// default). A goal whose required capability has no provider is surfaced as a gap, not
// silently dropped — the supervisor must not pretend it can do what nothing can.
//
// This module is pure and deterministic: decomposition is driven by an injectable
// decomposer (a rule set or, later, a model) so tests never call a live model.

// A Goal contract — the human-authored top of Stage 6. Humans specify WHAT and the
// bounds; the system decides HOW (agents, topology, workflow).
export function makeGoal({
  id, statement, successCriteria = [], constraints = [], forbidden = [],
  riskTolerance = "medium", resources = null
} = {}) {
  if (!id) throw new Error("a goal requires an id");
  if (!statement || !statement.trim()) throw new Error("a goal requires a statement");
  return { id, statement, successCriteria, constraints, forbidden, riskTolerance, resources };
}

// A subgoal produced by decomposition. `requiredCapabilities` are capability KEYS the
// registry is asked to satisfy; `dependsOn` expresses ordering discovered by the
// decomposer (a subgoal graph, not a flat list).
export function makeSubgoal({ id, statement, requiredCapabilities = [], dependsOn = [], evidence = [] } = {}) {
  return { id, statement, requiredCapabilities, dependsOn, evidence };
}

// Decompose a goal into subgoals. `decomposer(goal) -> subgoal[]` is injected so the
// rule/model is swappable and tests are deterministic. The default decomposer is a
// legible keyword rule set — deliberately simple, since the decomposition is an
// unproven judgment whose value rests on inspectability, exactly like the M5 router.
export function decomposeGoal(goal, { decomposer = defaultDecomposer } = {}) {
  const subgoals = decomposer(goal);
  if (!Array.isArray(subgoals) || subgoals.length === 0) {
    throw new Error(`decomposition produced no subgoals for goal ${goal.id}`);
  }
  // Validate the subgoal graph: no dangling dependency, no self-dependency.
  const ids = new Set(subgoals.map((s) => s.id));
  for (const s of subgoals) {
    if ((s.dependsOn ?? []).includes(s.id)) throw new Error(`${s.id} depends on itself`);
    for (const d of s.dependsOn ?? []) if (!ids.has(d)) throw new Error(`${s.id} depends on missing subgoal ${d}`);
  }
  return subgoals;
}

// The default keyword decomposer. It reads the goal statement and constraints and emits
// a small, ordered subgoal graph. It is NOT trying to be clever — it is a transparent
// baseline the supervisor can improve on, and it always emits an independent-proof
// subgoal so the org can never mark itself done without verification.
function defaultDecomposer(goal) {
  const text = `${goal.statement} ${(goal.successCriteria ?? []).join(" ")}`.toLowerCase();
  const subgoals = [];
  const needs = (kw) => text.includes(kw);

  // Investigation is almost always the first move on a bare goal.
  subgoals.push(makeSubgoal({ id: "SG-investigate", statement: `Investigate the current state relevant to: ${goal.statement}`, requiredCapabilities: ["research"] }));

  if (needs("cost") || needs("reduce") || needs("optimi") || needs("spend")) {
    subgoals.push(makeSubgoal({ id: "SG-analyze", statement: "Analyze data to find opportunities", requiredCapabilities: ["data_analysis"], dependsOn: ["SG-investigate"] }));
    subgoals.push(makeSubgoal({ id: "SG-implement", statement: "Implement the changes", requiredCapabilities: ["code_change"], dependsOn: ["SG-analyze"] }));
  } else {
    subgoals.push(makeSubgoal({ id: "SG-implement", statement: `Implement: ${goal.statement}`, requiredCapabilities: ["code_change"], dependsOn: ["SG-investigate"] }));
  }

  // Always require independent proof — the org cannot self-certify (reuses the M3 rule).
  subgoals.push(makeSubgoal({
    id: "SG-prove",
    statement: "Independently verify the outcome against the success criteria",
    requiredCapabilities: ["verification"],
    dependsOn: [subgoals[subgoals.length - 1].id],
    evidence: ["independent_verification"]
  }));
  return subgoals;
}

// ---- capability discovery --------------------------------------------------

// A capability registry lists what providers exist and which capability keys each can
// satisfy. It is passed in explicitly (discovered from the environment/config), never
// assumed. discoverCapabilities matches subgoal requirements against it.
export function discoverCapabilities(subgoals, registry = []) {
  const provided = new Map(); // capability key -> providers[]
  for (const provider of registry) {
    for (const cap of provider.capabilities ?? []) {
      if (!provided.has(cap)) provided.set(cap, []);
      provided.get(cap).push(provider.id);
    }
  }
  const required = new Set(subgoals.flatMap((s) => s.requiredCapabilities));
  const available = [];
  const gaps = [];
  for (const cap of required) {
    const providers = provided.get(cap) ?? [];
    if (providers.length) available.push({ capability: cap, providers });
    else gaps.push(cap); // no provider — a real gap, surfaced not hidden
  }
  return { required: [...required], available, gaps, satisfiable: gaps.length === 0 };
}
