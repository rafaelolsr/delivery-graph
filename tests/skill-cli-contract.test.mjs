import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const skillsDir = path.join(repoRoot, "skills");

function readSkill(name) {
  return fs.readFileSync(path.join(skillsDir, name, "SKILL.md"), "utf8");
}

const AUTHORING_SKILLS = ["dge-intake", "dge-plan-graph"];

// DEM-005: skills must require the CLI and never silently hand-write graph.json
// (the StarBase drift root cause). Guard both invariants so a future edit can't
// reintroduce the fallback.
for (const skill of AUTHORING_SKILLS) {
  test(`${skill} has a CLI preflight that stops when dge is missing`, () => {
    const text = readSkill(skill);
    assert.match(text, /Preflight: require the DGE CLI/);
    // DEM-008 / NODE-026: the preflight is now the shared `dge preflight` command,
    // not a per-skill `dge --help` block. Guard that the skill calls it and stops.
    assert.match(text, /dge preflight/);
    assert.match(text, /stop/i);
  });

  test(`${skill} does not instruct writing graph.json directly`, () => {
    const text = readSkill(skill);
    // The forbidden fallback: telling the agent to write/update graph.json itself.
    assert.doesNotMatch(text, /write\s+`?delivery-graph\/graph\.json`?\s+with/i);
    assert.doesNotMatch(text, /^Update `delivery-graph\/graph\.json`\.$/m);
    // The old permissive "when available / prefer" fallback must be gone.
    assert.doesNotMatch(text, /When local tooling is available, prefer/i);
    // The explicit guardrail must be present.
    assert.match(text, /Do not write `graph\.json` yourself|never hand-write or hand-edit/i);
  });

  // The compound loop's READ side: authoring skills must pull prior learnings
  // before scoping/planning, or the toolset stops compounding across demands.
  test(`${skill} reads prior learnings before authoring`, () => {
    assert.match(readSkill(skill), /dge learnings/);
  });
}

// DEM-008: dge-execute-graph must carry AMBIGUOUS as a third loop outcome
// (beyond transient/structural), covering both result- and fix-ambiguity and the
// pause-once contract, so the intent-driven conductor never silently guesses on a
// genuine fork or self-certifies a weak pass.
test("dge-execute-graph carries the AMBIGUOUS third outcome", () => {
  const text = readSkill("dge-execute-graph");
  assert.match(text, /Ambiguous \(pause once, ask once, resume\)/i);
  assert.match(text, /result-ambiguity/i);
  assert.match(text, /fix-ambiguity/i);
  assert.match(text, /--result ambiguous/);
  // Must tie ambiguity to structural, detectable triggers (missing/non-executable
  // contract, unresolved blocker GAP), not subjective judgment. NB: "blast radius"
  // is intentionally NOT asserted — it was aspirational prose with no backing model
  // and was descoped; do not reintroduce a phrase-only assertion (F3).
  assert.match(text, /missing or non-executable/i);
  assert.match(text, /blocker GAP/i);
  // The append-only adjudication rule: a resolved ambiguity must be removed, not
  // just overridden by a later pass (the moat fix, F1).
  assert.match(text, /dge evidence remove/);
});

// DEM-008 / NODE-029: quiet mode must change only reporting, never gating. Guard
// that the evidence gate survives suppression so a future edit can't turn "silent
// success" into "silent skip".
test("dge-execute-graph quiet mode never skips the evidence gate", () => {
  const text = readSkill("dge-execute-graph");
  assert.match(text, /Quiet mode/i);
  assert.match(text, /compact completion line/i);
  assert.match(text, /re-render the live status board|dge status/i);
  // The load-bearing invariant: quiet changes reporting, not gating.
  assert.match(text, /no path to `?done`? that skips evidence|never suppress the gate|changes only what is \*reported\*/i);
});

// DEM-008: the /dge-deliver conductor must hold the intent-driven posture so a
// future edit can't quietly turn it back into a command palette or drop a gate.
test("dge-deliver holds the intent-driven posture (one verb, two gates, sacred evidence)", () => {
  const text = readSkill("dge-deliver");
  // Single entry verb / no skill names after it.
  assert.match(text, /never types another `?dge-\*`? skill name|one entry verb/i);
  // Exactly two judgment gates, gate 2 always required.
  assert.match(text, /Demand Brief/);
  assert.match(text, /Graph Brief/);
  assert.match(text, /always required/i);
  // The design rule: automate which-skill-runs, never whether-the-outcome-is-acceptable.
  assert.match(text, /which skill runs/i);
  assert.match(text, /whether the outcome is acceptable|acceptable/i);
  // Evidence gate stays sacred; conductor uses the CLI, never hand-edits graph.json.
  assert.match(text, /evidence gate is sacred|never weakens a validation contract|fabricate/i);
  assert.match(text, /never hand-edit|CLI is the only writer/i);
  // Resume-from-queue and abandon-clean.
  assert.match(text, /resume from the ready queue|resume, not restart/i);
  assert.match(text, /[Aa]bandon is clean|preserved and resumable/);
  // It sequences the existing skills rather than reimplementing them.
  assert.match(text, /sequences the nine|does not replace the nine|dge-intake/);
});

// dge-intake must carry the grill-me interrogation mechanics (map, one-question
// push-back, recommended answers, lock-in) so a future edit can't quietly revert
// it to a form that accepts fuzzy input.
test("dge-intake carries the grill-me interrogation mechanics", () => {
  const text = readSkill("dge-intake");
  assert.match(text, /Map the decision tree/i);
  assert.match(text, /one question at a time/i);
  assert.match(text, /My recommendation:/);
  assert.match(text, /Locked:/);
  assert.match(text, /Confirmed decisions/i);
});
