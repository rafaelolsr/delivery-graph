import { randomUUID } from "node:crypto";
import { DISPATCH_CLASSES } from "./harness-adapters.mjs";

export const VERIFICATION_RISKS = Object.freeze({
  STANDARD: "standard",
  HIGH: "high"
});

export const VERIFICATION_OUTCOMES = Object.freeze({
  VERIFIED: "verified",
  REPAIR_REQUIRED: "repair_required",
  ESCALATION_REQUIRED: "escalation_required"
});

export const VERIFICATION_VERDICTS = Object.freeze({
  PASS: "pass",
  FAIL: "fail"
});

export const VERIFIER_CONTEXT_POLICY = "contract-diff-evidence-only";

const DEFAULT_HIGH_RISK_TYPES = new Set(["release"]);

export class VerificationPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "VerificationPolicyError";
  }
}

// Risk is explicit and inspectable. Release work is high-risk by default; projects
// can promote more node types or individual nodes without changing the engine.
export function verificationRisk(node, policy = {}) {
  const override = policy.riskByNode?.[node.id];
  if (override !== undefined) return requireRisk(override, node.id);

  const highRiskNodeIds = new Set(policy.highRiskNodeIds ?? []);
  const highRiskTypes = new Set(policy.highRiskTypes ?? DEFAULT_HIGH_RISK_TYPES);
  return highRiskNodeIds.has(node.id) || highRiskTypes.has(node.type)
    ? VERIFICATION_RISKS.HIGH
    : VERIFICATION_RISKS.STANDARD;
}

// Standard-risk verification prefers another harness but may reuse the builder's
// harness in a fresh process. High-risk verification fails closed unless a
// different harness is available. A project pin is honored only when it satisfies
// those independence rules.
export function planIndependentVerification({ node, builder, availableHarnesses, policy = {} }) {
  requireText(node?.id, "node id");
  requireText(builder?.runId, "builder run id");
  requireText(builder?.harness, "builder harness");

  const harnesses = uniqueStrings(availableHarnesses);
  if (harnesses.length === 0) {
    throw new VerificationPolicyError(`${node.id} has no available verifier harness`);
  }

  const risk = verificationRisk(node, policy);
  const pin = policy.verifierByNode?.[node.id] ?? policy.defaultVerifier ?? null;
  let verifierHarness;

  if (pin) {
    requireText(pin, `verifier pin for ${node.id}`);
    if (!harnesses.includes(pin)) {
      throw new VerificationPolicyError(`${node.id} verifier harness "${pin}" is not available`);
    }
    verifierHarness = pin;
  } else {
    verifierHarness = harnesses.find((candidate) => candidate !== builder.harness) ?? harnesses[0];
  }

  if (risk === VERIFICATION_RISKS.HIGH && verifierHarness === builder.harness) {
    throw new VerificationPolicyError(
      `${node.id} is high-risk and requires a verifier harness different from builder harness "${builder.harness}"`
    );
  }

  return {
    node_id: node.id,
    risk,
    builder: { run_id: builder.runId, harness: builder.harness, model: builder.model ?? null },
    verifier: { harness: verifierHarness },
    requires_fresh_context: true,
    context_policy: VERIFIER_CONTEXT_POLICY,
    rationale:
      risk === VERIFICATION_RISKS.HIGH
        ? "high-risk node requires a different harness"
        : verifierHarness === builder.harness
          ? "standard-risk node reuses the only available harness in a fresh context"
          : "standard-risk node prefers a different available harness"
  };
}

// Build the verifier task from an allowlist. Builder reasoning, chat history, and
// implementation prompts cannot leak through this API because they are not accepted
// or copied. The adapter starts a fresh CLI process for every dispatch.
export function buildVerifierTask({ node, plan, verifierRunId, contract, diff, evidence, cwd }) {
  const runId = verifierRunId ?? `verify-${randomUUID()}`;
  if (runId === plan.builder.run_id) {
    throw new VerificationPolicyError(`${node.id} verifier run must differ from builder run ${runId}`);
  }

  const context = {
    node: { id: node.id, title: node.title, type: node.type },
    contract,
    diff,
    evidence
  };

  return {
    role: "verifier",
    runId,
    cwd,
    prompt: renderVerifierPrompt(context),
    context
  };
}

// Execute an independent verifier and return the policy decision plus an auditable
// outcome. A verifier defect is repair work; an unavailable verifier is an
// escalation. Neither outcome can be interpreted as verified.
export async function dispatchIndependentVerification({
  registry,
  node,
  builder,
  contract,
  diff,
  evidence,
  cwd,
  policy = {},
  verifierRunId
}) {
  const availableHarnesses = registry.ids().filter((id) => registry.get(id).available().ok);
  const plan = planIndependentVerification({ node, builder, availableHarnesses, policy });
  const task = buildVerifierTask({
    node,
    plan,
    verifierRunId,
    contract,
    diff,
    evidence,
    cwd
  });
  const result = await registry.get(plan.verifier.harness).dispatch(task);
  const verdict = result.class === DISPATCH_CLASSES.OK ? verifierVerdict(result) : null;
  const outcome =
    verdict === VERIFICATION_VERDICTS.PASS
      ? VERIFICATION_OUTCOMES.VERIFIED
      : result.class === DISPATCH_CLASSES.WORK_FAILURE || verdict === VERIFICATION_VERDICTS.FAIL
        ? VERIFICATION_OUTCOMES.REPAIR_REQUIRED
        : VERIFICATION_OUTCOMES.ESCALATION_REQUIRED;

  return {
    outcome,
    plan,
    verifier_run_id: task.runId,
    verifier_harness: plan.verifier.harness,
    verdict,
    result
  };
}

function renderVerifierPrompt(context) {
  return [
    "Independently verify this node. Do not trust the builder's conclusion.",
    `Node: ${context.node.id} — ${context.node.title}`,
    `Contract: ${JSON.stringify(context.contract)}`,
    `Diff: ${JSON.stringify(context.diff)}`,
    `Evidence: ${JSON.stringify(context.evidence)}`,
    "Exit successfully only when the diff and evidence satisfy the complete contract.",
    'End with one JSON line: {"verdict":"pass","summary":"..."} or {"verdict":"fail","summary":"..."}.'
  ].join("\n");
}

// A clean process exit is transport success, not a verification verdict. Accept an
// explicit adapter verdict or a final JSON line from a CLI-backed agent. Anything
// missing or malformed stays null and therefore escalates rather than verifying.
export function verifierVerdict(result) {
  if (result?.verdict === VERIFICATION_VERDICTS.PASS || result?.verdict === VERIFICATION_VERDICTS.FAIL) {
    return result.verdict;
  }
  const lines = String(result?.stdout ?? "").trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed?.verdict === VERIFICATION_VERDICTS.PASS || parsed?.verdict === VERIFICATION_VERDICTS.FAIL) {
        return parsed.verdict;
      }
    } catch {
      // Keep searching earlier lines; agent CLIs may print non-JSON status text.
    }
  }
  return null;
}

function requireRisk(value, nodeId) {
  if (value !== VERIFICATION_RISKS.STANDARD && value !== VERIFICATION_RISKS.HIGH) {
    throw new VerificationPolicyError(`${nodeId} verification risk must be "standard" or "high", got: ${value}`);
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new VerificationPolicyError(`${label} is required`);
  }
  return value;
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() !== ""))];
}
