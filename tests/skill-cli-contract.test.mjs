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
    assert.match(text, /dge --help/);
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
