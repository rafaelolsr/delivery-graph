import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  VERIFICATION_OUTCOMES,
  VERIFICATION_VERDICTS,
  planIndependentVerification,
  dispatchIndependentVerification,
  harnessFamily
} from "../src/agentic-verification.mjs";
import { DISPATCH_CLASSES, makeAdapterRegistry } from "../src/harness-adapters.mjs";

// DEM-020 Track 2 / NODE-082 (REQ-087): high-risk nodes require a cross-FAMILY
// verifier prompted to refute; fail-closed when none exists; a fixtured REFUTED
// verdict catches a planted fail-open bug that green deterministic evidence cannot.

const releaseNode = { id: "NODE-002", title: "Deploy release", type: "release" };
const builder = { runId: "build-001", harness: "claude", model: "m" };
const FAMILIES = { claude: "anthropic", copilot: "openai", "claude-alt": "anthropic" };

// ── Contract item 1: same-family verifier is blocked ─────────────────────────

test("a high-risk node verified only by the SAME family is blocked with cross-family-required error", () => {
  assert.throws(
    () =>
      planIndependentVerification({
        node: releaseNode,
        builder,
        // A second harness that is a DIFFERENT harness but the SAME family.
        availableHarnesses: ["claude", "claude-alt"],
        policy: { harnessFamilies: FAMILIES }
      }),
    /requires a cross-family verifier/,
    "different harness, same family must not satisfy high-risk independence"
  );
});

// ── Contract item 2: no cross-family verifier → escalate, never self-certify ──

test("verify escalates with an honest error and never self-certifies when no cross-family verifier is configured", () => {
  // Families unconfigured → every harness is family "unknown" → never cross-family.
  assert.throws(
    () =>
      planIndependentVerification({
        node: releaseNode,
        builder,
        availableHarnesses: ["claude", "copilot"] // no policy.harnessFamilies
      }),
    /requires a cross-family verifier/,
    "unconfigured families must fail closed, not fall through to same-family"
  );
  assert.equal(harnessFamily("claude"), "unknown", "unmapped harness is family unknown");
});

// ── Contract item 3: fixtured REFUTED catches a planted fail-open bug ─────────

// A cross-family verifier adapter that REFUTES (verdict fail) even though the
// deterministic evidence is green — modelling a fail-open bug the checks can't see.
function refutingAdapter(id) {
  return {
    id,
    available: () => ({ ok: true }),
    dispatch: (task) => ({
      class: DISPATCH_CLASSES.OK,
      exitCode: 0,
      // The transcript is a fixture: a real cross-family run that returned fail.
      stdout: JSON.stringify({
        verdict: VERIFICATION_VERDICTS.FAIL,
        summary: "Refuted: endpoint returns 200 on auth failure (fail-open) despite passing tests."
      }),
      task
    })
  };
}
function passingAdapter(id) {
  return {
    id,
    available: () => ({ ok: true }),
    dispatch: (task) => ({
      class: DISPATCH_CLASSES.OK,
      exitCode: 0,
      stdout: JSON.stringify({ verdict: VERIFICATION_VERDICTS.PASS, summary: "ok" }),
      task
    })
  };
}

test("a fixtured REFUTED transcript catches a planted fail-open bug despite green evidence", async () => {
  const registry = makeAdapterRegistry([passingAdapter("claude"), refutingAdapter("copilot")]);
  const result = await dispatchIndependentVerification({
    registry,
    node: releaseNode,
    builder,
    contract: ["auth returns 401 on bad credentials"],
    // Green deterministic evidence — the exact fail-open scenario Converge proved.
    diff: "handler returns 200 on missing token",
    evidence: [{ command: "npm test", exitCode: 0 }],
    policy: { harnessFamilies: FAMILIES },
    verifierRunId: "verify-xf-001"
  });

  assert.equal(result.verifier_harness, "copilot", "cross-family verifier chosen");
  assert.equal(result.plan.verifier.cross_family, true);
  assert.equal(result.plan.stance, "refute", "high-risk verifier is prompted to refute");
  assert.equal(result.verdict, VERIFICATION_VERDICTS.FAIL, "cross-family verifier REFUTED");
  assert.equal(
    result.outcome,
    VERIFICATION_OUTCOMES.REPAIR_REQUIRED,
    "a REFUTED verdict returns the node for repair — green evidence is necessary, not sufficient"
  );
});

// ── The refute prompt actually instructs refutation ──────────────────────────

test("high-risk cross-family verifier prompt is refute-oriented", () => {
  const plan = planIndependentVerification({
    node: releaseNode,
    builder,
    availableHarnesses: ["claude", "copilot"],
    policy: { harnessFamilies: FAMILIES }
  });
  assert.equal(plan.stance, "refute");
});

// ── Contract item 4: live REFUTED proof receipt exists on disk ───────────────

test("a live cross-family REFUTED run is captured as a durable proof receipt under docs/proof/", () => {
  const receipt = path.resolve("docs/proof/cross-family-refuted.md");
  assert.ok(fs.existsSync(receipt), "the durable proof receipt must exist");
  const body = fs.readFileSync(receipt, "utf8");
  assert.match(body, /REFUTED/, "receipt records a REFUTED verdict");
  assert.match(body, /fail-open/i, "receipt describes the fail-open bug caught");
});
