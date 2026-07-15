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

const AUTHORING_SKILLS = ["dge-design", "dge-plan-graph"];

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
  assert.match(text, /sequences the nine|does not replace the nine|dge-design/);
});

// dge-design must carry the grill-me interrogation mechanics (map, one-question
// push-back, recommended answers, lock-in) so a future edit can't quietly revert
// it to a form that accepts fuzzy input.
test("dge-design carries the grill-me interrogation mechanics", () => {
  const text = readSkill("dge-design");
  assert.match(text, /Map the decision tree/i);
  assert.match(text, /one question at a time/i);
  assert.match(text, /My recommendation:/);
  assert.match(text, /Locked:/);
  assert.match(text, /Confirmed decisions/i);
});

// DEM-013 / NODE-054: design must capture a one-line summary and cap the outcome so
// the captured prose stops becoming a wall of text. Guard the behavior (a summary
// discipline + an outcome length cap + the --summary CLI affordance), not the exact
// phrasing (per learning skill-prose-can-drift-from-code).
test("dge-design captures a one-line summary and caps the outcome length", () => {
  const text = readSkill("dge-design");
  assert.match(text, /summary/i);
  assert.match(text, /--summary/);            // the CLI affordance is offered
  assert.match(text, /at most 3 sentences|3 sentences|wall of text/i); // outcome cap
});

test("dge-verify requires risk-based independent verification", () => {
  const text = readSkill("dge-verify");
  assert.match(text, /fresh agent context/i);
  assert.match(text, /contract, implementation diff, and evidence/i);
  assert.match(text, /high-risk nodes require a different harness/i);
  assert.match(text, /failure returns the node for bounded repair/i);
});

// DEM-013 / NODE-054: the run summaries must lead with a synthesis and end with a
// Next block — the same skeleton the CLI surfaces use. Guard the behavior so a
// future edit can't revert them to a flat enumeration.
const ALL_SKILLS = [
  "dge-design", "dge-plan-graph", "dge-review", "dge-status", "dge-work-node",
  "dge-verify", "dge-compound", "dge-sync", "dge-deliver", "dge-execute-graph"
];

for (const skill of ["dge-deliver", "dge-execute-graph"]) {
  test(`${skill} final summary leads with a synthesis and ends with a Next block`, () => {
    const text = readSkill(skill);
    assert.match(text, /synthesis/i);          // lead-with-the-story requirement
    assert.match(text, /##\s*Next/);           // mandatory Next block
  });
}

// DEM-015: every skill's conversational output — not just dge-deliver and
// dge-execute-graph — must reference the shared output convention (bold
// one-line lead + Next block) rather than reporting as a flat enumeration.
// Guard the behavior (a reference to the shared convention plus a mandatory
// Next block), not exact phrasing, per skill-prose-can-drift-from-code.
for (const skill of ALL_SKILLS) {
  test(`${skill} references the shared output convention and ends with a Next block`, () => {
    const text = readSkill(skill);
    assert.match(text, /shared output convention|synthesis/i);
    assert.match(text, /##\s*Next/);
  });
}

// DEM-015: skills/README.md is the single source of truth for the output
// convention — guard that it actually defines the convention so the per-skill
// references above point at something real.
test("skills/README.md defines the output convention", () => {
  const text = fs.readFileSync(path.join(skillsDir, "README.md"), "utf8");
  assert.match(text, /Output convention/i);
  assert.match(text, /bold one-line synthesis/i);
  assert.match(text, /##\s*Next/);
});

// Demand-level progress indicator: the 5 skills that mutate a demand's
// requirements/nodes must each print the derived lifecycle line (Design ->
// Plan -> Execute -> Verify -> Done) between the synthesis and the detail.
// Guard the behavior (a reference to the progress indicator convention), not
// exact phrasing, per skill-prose-can-drift-from-code.
const PROGRESS_SKILLS = ["dge-design", "dge-plan-graph", "dge-work-node", "dge-execute-graph", "dge-verify"];

for (const skill of PROGRESS_SKILLS) {
  test(`${skill} references the demand progress indicator`, () => {
    const text = readSkill(skill);
    assert.match(text, /progress indicator/i);
  });
}

test("skills/README.md defines the demand progress indicator convention", () => {
  const text = fs.readFileSync(path.join(skillsDir, "README.md"), "utf8");
  assert.match(text, /progress indicator/i);
  assert.match(text, /Design.*Plan.*Execute.*Verify.*Done/s);
});

// DEM-013 (and the standing mirror rule): when a local .claude/skills/ mirror
// exists (it is a local `dge install-skills` artifact, NOT tracked source — the
// package ships `skills/` only), it must stay byte-identical to canonical
// `skills/`. This catches editing one copy and forgetting the other during local
// dogfooding. It SKIPS when the mirror is absent (e.g. a clean CI checkout) so it
// never depends on untracked files — `skills/` is the single source of truth.
const mirrorRoot = path.join(repoRoot, ".claude", "skills");
for (const skill of ALL_SKILLS) {
  test(`${skill} SKILL.md mirror (if present) is byte-identical to canonical skills/`, (t) => {
    const mirrorPath = path.join(mirrorRoot, skill, "SKILL.md");
    if (!fs.existsSync(mirrorPath)) {
      t.skip("no local .claude/skills mirror (untracked install artifact) — skills/ is the source of truth");
      return;
    }
    const canonical = fs.readFileSync(path.join(skillsDir, skill, "SKILL.md"), "utf8");
    assert.equal(fs.readFileSync(mirrorPath, "utf8"), canonical);
  });
}
