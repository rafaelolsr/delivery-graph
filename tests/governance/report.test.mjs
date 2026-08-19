import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGovernanceReport, renderGovernanceReport, REQUIRED_REPORT_QUESTIONS
} from "../../src/governance/report.mjs";

function fullState() {
  return {
    intent: { outcome: "medium-risk code change", success_criteria: ["tests pass"], constraints: ["no paid model in CI"] },
    graphVersion: 4,
    allocations: [{ node_id: "NODE-1", selected: "haiku", rationale: "cheapest eligible under economy", confidence: "high", expected: { cost: { low: 1, expected: 2, high: 3 }, latency: null } }],
    adaptations: [{ id: "MUT-1", kind: "change_model", state: "retained", decision: "auto-approved", decisionMaker: "process:mutation-gate", resultAfterApplication: "retained" }],
    approvals: [{ subject: "MUT-2", approver: "human:rafael", approved: true }],
    observations: [{ attempt: 1, cost: 2, tokens: 1500, evidenceProduced: 3 }],
    result: { proven: true, evidence: ["independent verifier PASS", "npm test green"], verdict: "PASS" },
    learnings: [{ scope: "org", admitted: true, summary: "haiku reliable for low-risk review" }]
  };
}

test("the report answers every required question", () => {
  const md = renderGovernanceReport(fullState());
  for (const q of REQUIRED_REPORT_QUESTIONS) {
    assert.ok(md.includes(q), `report must answer: ${q}`);
  }
});

test("a human can trace agent selection, authorization, cost, evidence, and learning", () => {
  const md = renderGovernanceReport(fullState());
  assert.match(md, /haiku/); // which model
  assert.match(md, /cheapest eligible/); // why selected
  assert.match(md, /change_model.*retained/); // what changed
  assert.match(md, /auto-approved/); // why authorized
  assert.match(md, /tokens 1500/); // what it cost
  assert.match(md, /independent verifier PASS/); // evidence proving the Result
  assert.match(md, /haiku reliable for low-risk review/); // what was learned
});

test("unknown values render as 'unknown', never fabricated", () => {
  const sparse = { intent: {}, allocations: [{ node_id: "N", selected: "m", rationale: "x", confidence: null, expected: null }] };
  const md = renderGovernanceReport(sparse);
  assert.match(md, /Outcome: unknown/);
  assert.match(md, /confidence unknown/);
  assert.doesNotMatch(md, /confidence 0\b/, "confidence must not be fabricated as 0");
});

test("no Result yet is reported honestly (not a false proven)", () => {
  const md = renderGovernanceReport({ intent: { outcome: "x" } });
  assert.match(md, /Result proven: no/);
});

test("buildGovernanceReport is a pure structured projection (no raw logs inlined)", () => {
  const r = buildGovernanceReport(fullState());
  assert.equal(r.activeGraphVersion, 4);
  assert.equal(r.result.proven, true);
  assert.equal(r.allocations[0].selected, "haiku");
  // The structured form carries references/summaries, not raw tool dumps.
  assert.ok(!JSON.stringify(r).includes("stdout"));
});

test("soft cost estimates are labeled as estimates, and unknown ranges say unknown", () => {
  const md = renderGovernanceReport(fullState());
  assert.match(md, /soft estimate/);
  assert.match(md, /latency unknown/);
});
