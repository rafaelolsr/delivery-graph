// Stage 6 — agent synthesis + topology construction (S6.2).
//
// Given the discovered capabilities and the subgoal graph, the system SYNTHESIZES the
// agent organization instead of a human authoring it: it creates agent specs (role,
// capabilities, tools, permissions, model-requirement) sufficient to cover every
// required capability, then constructs a TOPOLOGY (a supervisor plus agents, with edges
// derived from the subgoal dependencies) rather than hardcoding A→B→C.
//
// Cardinal safety rules (reuse the Stage-5 substrate):
//   - An agent is granted ONLY the permissions its role needs (least privilege). The
//     org never mints an agent with more authority than its capabilities justify.
//   - Permissions come from policy, not from the agent's own request (no self-grant).
//   - Every synthesized org is a data structure the mutation gate can later evaluate.

import { allocate } from "../governance/allocation.mjs";

// Least-privilege permission map per capability. A synthesized agent's permissions are
// the UNION of what its capabilities require — nothing more. This is policy-owned, not
// agent-requested, so an agent can never widen its own grant.
const CAPABILITY_PERMISSIONS = Object.freeze({
  research: ["read"],
  data_analysis: ["read", "query"],
  code_change: ["read", "write"],
  verification: ["read"],
  documentation: ["read", "write"]
});

// Synthesize an agent spec for a set of capabilities. `select(candidates)` picks the
// model/executor for the agent from the discovered providers (defaults to the governed
// allocator so the pick is explainable and eligibility-filtered).
export function synthesizeAgent({ id, role, capabilities, providers = [], candidates = [], risk = "medium" }) {
  const permissions = [...new Set(capabilities.flatMap((c) => CAPABILITY_PERMISSIONS[c] ?? []))];
  const requirements = { node_id: id, capabilities, permissions, evidence: capabilities.includes("verification") ? [] : ["test_results"] };
  const decision = candidates.length ? allocate(candidates, requirements, { risk }) : { selected: null, rationale: "no candidates (cold start)" };
  return {
    id, role, capabilities, permissions,
    tools: providers, // the providers that can back this role
    model: decision.selected,
    allocationRationale: decision.rationale,
    // an agent NEVER carries a forbidden/expanding permission; only least-privilege
    grantedBy: "policy", // provenance: permissions came from policy, not self-request
    createdFrom: capabilities
  };
}

// Build an organization from subgoals + discovered capabilities. One agent is
// synthesized per distinct capability (deduped), plus a supervisor. Topology edges are
// derived from the subgoal dependency graph, mapped onto the agents that serve them.
export function constructOrganization({ goal, subgoals, discovery, candidates = [], at = null }) {
  if (!discovery.satisfiable) {
    return { supervisor: null, agents: [], edges: [], satisfiable: false, gaps: discovery.gaps, at };
  }
  // One agent per distinct required capability (the minimal covering roster).
  const capToProviders = new Map(discovery.available.map((a) => [a.capability, a.providers]));
  const agents = [];
  const capToAgent = new Map();
  for (const cap of discovery.required) {
    const id = `AGENT-${cap}`;
    const agent = synthesizeAgent({
      id, role: cap, capabilities: [cap],
      providers: capToProviders.get(cap) ?? [],
      candidates, risk: goal.riskTolerance ?? "medium"
    });
    agents.push(agent);
    capToAgent.set(cap, id);
  }

  // Topology: a supervisor governs all agents; execution edges follow subgoal deps,
  // mapped from the subgoal's capability to the agent that provides it.
  const supervisor = { id: "SUPERVISOR", role: "supervisor", governs: agents.map((a) => a.id) };
  const edges = [];
  const subgoalAgent = (sg) => sg.requiredCapabilities.map((c) => capToAgent.get(c)).filter(Boolean);
  for (const sg of subgoals) {
    for (const dep of sg.dependsOn ?? []) {
      const from = subgoals.find((s) => s.id === dep);
      if (!from) continue;
      for (const a of subgoalAgent(from)) for (const b of subgoalAgent(sg)) {
        if (a !== b) edges.push({ from: a, to: b, viaSubgoal: sg.id });
      }
    }
  }
  return { supervisor, agents, edges, subgoals, satisfiable: true, gaps: [], goalId: goal.id, at };
}

// A stable, inspectable description of the org — used by the human report and by the
// mutation gate to reason about a proposed restructuring.
export function describeOrganization(org) {
  if (!org.satisfiable) return { satisfiable: false, gaps: org.gaps, agentCount: 0 };
  return {
    satisfiable: true,
    supervisor: org.supervisor.id,
    agentCount: org.agents.length,
    agents: org.agents.map((a) => ({ id: a.id, role: a.role, model: a.model, permissions: a.permissions })),
    topology: org.edges.map((e) => `${e.from}→${e.to}`),
    gaps: []
  };
}

// Capability coverage check: does the org's agent roster cover every capability the
// subgoals require? The supervisor uses this to guarantee a restructuring never drops
// coverage (the mutation gate's preservesRequirementCoverage input).
export function coversAllCapabilities(org, subgoals) {
  const covered = new Set(org.agents.flatMap((a) => a.capabilities));
  const required = new Set(subgoals.flatMap((s) => s.requiredCapabilities));
  const missing = [...required].filter((c) => !covered.has(c));
  return { covered: missing.length === 0, missing };
}
