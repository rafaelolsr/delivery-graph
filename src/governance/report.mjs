// Human projection: the governance report (M7).
//
// Renders a concise, human-readable account derived from the same canonical truth the
// machine records hold. It must answer the spec's required questions without the reader
// touching raw logs:
//
//   What was requested? · What graph version is active? · Which agents/models were
//   used? · Why were they selected? · What changed? · Why was the change authorized? ·
//   What did it cost? · What evidence proves the Result? · What was learned?
//
// Raw tool output and token events are referenced, not inlined — they never dominate
// the report. Unknown values are shown as "unknown", never invented.

function u(value) {
  return value === null || value === undefined ? "unknown" : value;
}

// buildGovernanceReport(state) -> a structured report object. `state` composes the
// governance pieces: intent, active graph version, allocations, adaptations, gates,
// approvals, resource observations vs expectations, result evidence, learnings.
export function buildGovernanceReport(state = {}) {
  const {
    intent = {}, graphVersion = null, allocations = [], adaptations = [],
    gates = [], approvals = [], observations = [], result = null, learnings = []
  } = state;

  return {
    requested: {
      outcome: u(intent.outcome),
      successCriteria: intent.success_criteria ?? [],
      constraints: intent.constraints ?? []
    },
    activeGraphVersion: u(graphVersion),
    allocations: allocations.map((a) => ({
      node: u(a.node_id), selected: u(a.selected),
      why: u(a.rationale),
      confidence: u(a.confidence),
      expected: a.expected ?? null // soft estimates, may be unknown
    })),
    adaptations: adaptations.map((p) => ({
      id: p.id, kind: p.kind, state: p.state,
      why: u(p.decision),
      authorizedBy: u(p.decisionMaker),
      outcome: u(p.resultAfterApplication)
    })),
    approvals: approvals.map((ap) => ({ subject: u(ap.subject), approver: u(ap.approver), approved: !!ap.approved })),
    resources: observations.map((o) => ({ attempt: o.attempt, cost: u(o.cost), tokens: u(o.tokens), evidence: o.evidenceProduced })),
    result: result
      ? { proven: !!result.proven, evidence: result.evidence ?? [], verdict: u(result.verdict) }
      : { proven: false, evidence: [], verdict: "no Result yet" },
    learnings: learnings.map((l) => ({ scope: u(l.scope), admitted: !!l.admitted, summary: u(l.summary) }))
  };
}

// renderGovernanceReport(state) -> markdown. Answers each required question under a
// clear heading so a human can explain what DGE did and why without reading logs.
export function renderGovernanceReport(state = {}) {
  const r = buildGovernanceReport(state);
  const lines = [];
  lines.push("# Governance report", "");

  lines.push("## What was requested?", "");
  lines.push(`- Outcome: ${r.requested.outcome}`);
  if (r.requested.successCriteria.length) lines.push(`- Success: ${r.requested.successCriteria.join("; ")}`);
  if (r.requested.constraints.length) lines.push(`- Hard constraints: ${r.requested.constraints.join("; ")}`);
  lines.push("");

  lines.push(`## What graph version is active?`, "", `- v${r.activeGraphVersion}`, "");

  lines.push("## Which agents/models were used, and why?", "");
  if (!r.allocations.length) lines.push("- (no allocations recorded)");
  for (const a of r.allocations) {
    lines.push(`- ${a.node} → **${a.selected}** (confidence ${a.confidence}) — ${a.why}`);
    if (a.expected) lines.push(`  - expected: cost ${describeRange(a.expected.cost)}, latency ${describeRange(a.expected.latency)} (soft estimate)`);
  }
  lines.push("");

  lines.push("## What changed, and why was it authorized?", "");
  if (!r.adaptations.length) lines.push("- (no adaptations)");
  for (const a of r.adaptations) {
    lines.push(`- ${a.id} ${a.kind}: ${a.state} — ${a.why} (authorized by ${a.authorizedBy}; outcome ${a.outcome})`);
  }
  lines.push("");

  if (r.approvals.length) {
    lines.push("## Pending / recorded human approvals", "");
    for (const ap of r.approvals) lines.push(`- ${ap.subject}: ${ap.approved ? "approved" : "PENDING"} by ${ap.approver}`);
    lines.push("");
  }

  lines.push("## What did it cost? (observed vs expected)", "");
  if (!r.resources.length) lines.push("- (no resource observations)");
  for (const o of r.resources) lines.push(`- attempt ${o.attempt}: cost ${o.cost}, tokens ${o.tokens}, evidence ${o.evidence}`);
  lines.push("");

  lines.push("## What evidence proves the Result?", "");
  lines.push(`- Result proven: ${r.result.proven ? "yes" : "no"} (${r.result.verdict})`);
  for (const e of r.result.evidence) lines.push(`  - ${e}`);
  lines.push("");

  lines.push("## What was learned?", "");
  if (!r.learnings.length) lines.push("- (nothing admitted to organizational learning)");
  for (const l of r.learnings) lines.push(`- [${l.scope}] ${l.admitted ? "admitted" : "not admitted"}: ${l.summary}`);
  lines.push("");

  return lines.join("\n");
}

function describeRange(range) {
  if (!range) return "unknown";
  return `${u(range.low)}–${u(range.high)} (≈${u(range.expected)})`;
}

// The set of questions a compliant report MUST answer — exported so a test can assert
// coverage without brittle string matching.
export const REQUIRED_REPORT_QUESTIONS = Object.freeze([
  "What was requested?",
  "What graph version is active?",
  "Which agents/models were used, and why?",
  "What changed, and why was it authorized?",
  "What did it cost? (observed vs expected)",
  "What evidence proves the Result?",
  "What was learned?"
]);
