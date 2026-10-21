// Governor ↔ live CLI integration (wires the adaptive engine into `dge govern`).
//
// This is the seam that makes the governor operate on a REAL graph.json. It is a thin,
// read-only planner: for each ready node it derives requirements + risk from the node's
// own traits, runs the real allocation + allocation-gate, and produces a governance
// report. It NEVER mutates graph.json (allocation is a planning decision; applying a
// mutation stays behind the mutation gate + explicit write, per ADR-001).
//
// Candidates and policy come from a governance config (see loadGovernConfig); with no
// config, allocation runs in honest cold-start mode over any declared candidates.

import { getReadyNodes } from "../graph-engine.mjs";
import { allocate, RISK_BANDS, OPTIMIZATION_PROFILES } from "./allocation.mjs";
import { allocationGate, GATE_VERDICTS } from "./gates.mjs";
import { buildGovernanceReport } from "./report.mjs";

// Derive a risk band from a node's traits. Deliberately coarse and legible; config may
// override per node type. Implementation/release lean higher-risk; research/docs lower.
export function riskForNode(node, config = {}) {
  const override = config.riskByType?.[node.type];
  if (override) return override;
  if (node.type === "release") return RISK_BANDS.HIGH;
  if (node.type === "research" || node.type === "docs") return RISK_BANDS.LOW;
  return RISK_BANDS.MEDIUM;
}

// Derive allocation requirements from a node. Capabilities map from node type unless
// the config supplies an explicit map; evidence requirements come from whether the
// node has a validation contract (it needs a candidate that can produce evidence).
export function requirementsForNode(node, config = {}) {
  const capByType = config.capabilitiesByType ?? {};
  const capabilities = capByType[node.type] ?? [defaultCapability(node.type)];
  const reqs = {
    node_id: node.id,
    capabilities,
    // A node with a validation contract needs a candidate that produces evidence, and
    // an independent verifier (executor≠verifier) when the contract must be proven.
    evidence: node.validation?.required?.length ? [config.evidenceType ?? "test_results"] : [],
    independentVerifier: !!node.validation?.required?.length
  };
  if (config.requiredPermissionsByType?.[node.type]) reqs.permissions = config.requiredPermissionsByType[node.type];
  if (config.requiredDomains) reqs.domains = config.requiredDomains;
  return reqs;
}

function defaultCapability(type) {
  switch (type) {
    case "research": return "research";
    case "docs": return "documentation";
    case "test": case "eval": return "verification";
    default: return "code_change";
  }
}

// Plan allocations for every ready node in a demand (or the whole graph). Pure/read-only.
// Returns { allocations: [...], report } — allocations each carry the gate verdict.
export function planGovernance(graph, config = {}, { demandId = null, at = null } = {}) {
  const candidates = config.candidates ?? [];
  const profile = config.profile ?? OPTIMIZATION_PROFILES.BALANCED;

  let ready = getReadyNodes(graph);
  if (demandId) ready = ready.filter((n) => nodeBelongsToDemand(graph, n, demandId));

  const allocations = [];
  for (const node of ready) {
    const requirements = requirementsForNode(node, config);
    const risk = riskForNode(node, config);
    const decision = allocate(candidates, requirements, { risk, profile, at });

    // Gate the allocation (eligibility, independence, explainability).
    const gate = allocationGate({
      node_id: node.id,
      selected: decision.selected,
      rationale: decision.rationale,
      eligible: decision.selected !== null,
      verifierIndependenceRequired: requirements.independentVerifier,
      // an independent verifier must differ from the executor; pick the top alternative
      verifier: decision.alternatives?.[0]?.id ?? null
    }, { at });

    allocations.push({ ...decision, risk, gate: { verdict: gate.verdict, explanation: gate.explanation } });
  }

  const report = buildGovernanceReport({
    intent: demandIntent(graph, demandId),
    graphVersion: graph.version ?? graph.graph?.rev ?? 0,
    allocations,
    adaptations: [],
    gates: allocations.map((a) => ({ gate: "allocation", subject: a.node_id, verdict: a.gate.verdict })),
    observations: [],
    result: null,
    learnings: []
  });

  return { allocations, report, readyCount: ready.length, candidateCount: candidates.length };
}

function nodeBelongsToDemand(graph, node, demandId) {
  const reqIds = new Set((graph.requirements ?? []).filter((r) => r.demand_id === demandId).map((r) => r.id));
  return (node.requirement_ids ?? []).some((r) => reqIds.has(r));
}

function demandIntent(graph, demandId) {
  const demand = (graph.demands ?? []).find((d) => d.id === demandId) ?? (graph.demands ?? [])[0];
  if (!demand) return {};
  return { id: demand.id, outcome: demand.outcome, success_criteria: [], constraints: demand.constraints ?? [] };
}
