import assert from "node:assert/strict";
import test from "node:test";
import {
  VERIFICATION_OUTCOMES,
  VERIFICATION_RISKS,
  VERIFICATION_VERDICTS,
  VERIFIER_CONTEXT_POLICY,
  VerificationPolicyError,
  buildVerifierTask,
  dispatchIndependentVerification,
  planIndependentVerification,
  verificationRisk
} from "../src/agentic-verification.mjs";
import { DISPATCH_CLASSES, makeAdapterRegistry } from "../src/harness-adapters.mjs";

const standardNode = { id: "NODE-001", title: "Implement feature", type: "implementation" };
const releaseNode = { id: "NODE-002", title: "Deploy release", type: "release" };
const builder = { runId: "build-001", harness: "claude", model: "builder-model" };

test("release nodes are high-risk; other nodes default to standard", () => {
  assert.equal(verificationRisk(standardNode), VERIFICATION_RISKS.STANDARD);
  assert.equal(verificationRisk(releaseNode), VERIFICATION_RISKS.HIGH);
});

test("project policy can promote a node or type to high-risk", () => {
  assert.equal(
    verificationRisk(standardNode, { highRiskNodeIds: [standardNode.id] }),
    VERIFICATION_RISKS.HIGH
  );
  assert.equal(
    verificationRisk({ ...standardNode, type: "eval" }, { highRiskTypes: ["eval"] }),
    VERIFICATION_RISKS.HIGH
  );
});

test("standard-risk verification prefers a different harness", () => {
  const plan = planIndependentVerification({
    node: standardNode,
    builder,
    availableHarnesses: ["claude", "copilot"]
  });
  assert.equal(plan.verifier.harness, "copilot");
  assert.equal(plan.requires_fresh_context, true);
  assert.equal(plan.context_policy, VERIFIER_CONTEXT_POLICY);
});

test("standard-risk verification may reuse the harness but never the run", () => {
  const plan = planIndependentVerification({
    node: standardNode,
    builder,
    availableHarnesses: ["claude"]
  });
  assert.equal(plan.verifier.harness, "claude");
  assert.throws(
    () =>
      buildVerifierTask({
        node: standardNode,
        plan,
        verifierRunId: builder.runId,
        contract: ["test"],
        diff: "diff",
        evidence: []
      }),
    VerificationPolicyError
  );
});

test("high-risk verification fails closed without another harness", () => {
  assert.throws(
    () =>
      planIndependentVerification({
        node: releaseNode,
        builder,
        availableHarnesses: ["claude"]
      }),
    /requires a verifier harness different/
  );
});

test("high-risk verification selects a different harness", () => {
  const plan = planIndependentVerification({
    node: releaseNode,
    builder,
    availableHarnesses: ["claude", "copilot"]
  });
  assert.equal(plan.risk, VERIFICATION_RISKS.HIGH);
  assert.equal(plan.verifier.harness, "copilot");
});

test("verifier context contains only node, contract, diff, and evidence", () => {
  const plan = planIndependentVerification({
    node: standardNode,
    builder,
    availableHarnesses: ["copilot"]
  });
  const task = buildVerifierTask({
    node: standardNode,
    plan,
    verifierRunId: "verify-001",
    contract: ["npm test"],
    diff: "abc123..def456",
    evidence: [{ command: "npm test", exitCode: 0 }]
  });
  assert.deepEqual(Object.keys(task.context), ["node", "contract", "diff", "evidence"]);
  assert.equal(task.role, "verifier");
  assert.notEqual(task.runId, builder.runId);
});

test("a clean independent verifier produces verified", async () => {
  const registry = makeAdapterRegistry([
    adapter("claude", DISPATCH_CLASSES.OK, VERIFICATION_VERDICTS.PASS),
    adapter("copilot", DISPATCH_CLASSES.OK, VERIFICATION_VERDICTS.PASS)
  ]);
  const result = await dispatchIndependentVerification({
    registry,
    node: standardNode,
    builder,
    contract: ["npm test"],
    diff: "diff",
    evidence: [],
    verifierRunId: "verify-001"
  });
  assert.equal(result.outcome, VERIFICATION_OUTCOMES.VERIFIED);
  assert.equal(result.verifier_harness, "copilot");
  assert.equal(result.verifier_run_id, "verify-001");
});

test("verifier work failure requires repair and never verifies", async () => {
  const registry = makeAdapterRegistry([
    adapter("claude", DISPATCH_CLASSES.OK),
    adapter("copilot", DISPATCH_CLASSES.WORK_FAILURE)
  ]);
  const result = await dispatchIndependentVerification({
    registry,
    node: standardNode,
    builder,
    contract: ["npm test"],
    diff: "diff",
    evidence: [],
    verifierRunId: "verify-002"
  });
  assert.equal(result.outcome, VERIFICATION_OUTCOMES.REPAIR_REQUIRED);
  assert.notEqual(result.outcome, VERIFICATION_OUTCOMES.VERIFIED);
});

test("an explicit fail verdict requires repair even when the verifier process exits cleanly", async () => {
  const registry = makeAdapterRegistry([
    adapter("claude", DISPATCH_CLASSES.OK, VERIFICATION_VERDICTS.PASS),
    adapter("copilot", DISPATCH_CLASSES.OK, VERIFICATION_VERDICTS.FAIL)
  ]);
  const result = await dispatchIndependentVerification({
    registry,
    node: standardNode,
    builder,
    contract: ["npm test"],
    diff: "diff",
    evidence: [],
    verifierRunId: "verify-fail"
  });
  assert.equal(result.outcome, VERIFICATION_OUTCOMES.REPAIR_REQUIRED);
  assert.equal(result.verdict, VERIFICATION_VERDICTS.FAIL);
});

test("a clean exit without a structured verdict escalates instead of verifying", async () => {
  const registry = makeAdapterRegistry([
    adapter("claude", DISPATCH_CLASSES.OK),
    adapter("copilot", DISPATCH_CLASSES.OK)
  ]);
  const result = await dispatchIndependentVerification({
    registry,
    node: standardNode,
    builder,
    contract: ["npm test"],
    diff: "diff",
    evidence: [],
    verifierRunId: "verify-no-verdict"
  });
  assert.equal(result.outcome, VERIFICATION_OUTCOMES.ESCALATION_REQUIRED);
  assert.equal(result.verdict, null);
});

test("verifier infrastructure failure requires escalation and never verifies", async () => {
  const registry = makeAdapterRegistry([
    adapter("claude", DISPATCH_CLASSES.INFRA_FAILURE)
  ]);
  const result = await dispatchIndependentVerification({
    registry,
    node: standardNode,
    builder,
    contract: ["npm test"],
    diff: "diff",
    evidence: [],
    verifierRunId: "verify-003"
  });
  assert.equal(result.outcome, VERIFICATION_OUTCOMES.ESCALATION_REQUIRED);
  assert.notEqual(result.outcome, VERIFICATION_OUTCOMES.VERIFIED);
});

function adapter(id, resultClass, verdict) {
  return {
    id,
    available: () => ({ ok: true }),
    dispatch: (task) => ({
      class: resultClass,
      exitCode: resultClass === DISPATCH_CLASSES.OK ? 0 : 1,
      stdout: verdict ? JSON.stringify({ verdict, summary: "checked" }) : "",
      task
    })
  };
}
