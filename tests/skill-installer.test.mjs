import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  detectHarnesses,
  installSkills,
  listPackagedSkills,
  packagedSkillsDir
} from "../src/skill-installer.mjs";

function tempRepo(...markers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-skills-"));
  for (const marker of markers) {
    fs.mkdirSync(path.join(dir, marker), { recursive: true });
  }
  return dir;
}

test("lists the packaged dge-* skills", () => {
  const skills = listPackagedSkills();
  assert.ok(skills.includes("dge-design"));
  assert.ok(skills.includes("dge-execute-graph"));
  assert.ok(skills.every((skill) => skill.startsWith("dge-")));
});

test("copies every packaged skill into the harness skills folder", () => {
  const repoRoot = tempRepo(".claude");
  const result = installSkills({ repoRoot });

  assert.equal(result.harness, "claude");
  assert.equal(result.mode, "copy");
  assert.equal(result.skillsDir, ".claude/skills");
  assert.deepEqual(result.installed, listPackagedSkills());
  assert.deepEqual(result.skipped, []);

  for (const skill of result.installed) {
    const skillFile = path.join(repoRoot, ".claude", "skills", skill, "SKILL.md");
    assert.ok(fs.existsSync(skillFile), `expected ${skill}/SKILL.md`);
  }
});

test("auto-detects the copilot harness from .github", () => {
  const repoRoot = tempRepo(".github");
  assert.deepEqual(detectHarnesses(repoRoot), ["copilot"]);
  const result = installSkills({ repoRoot });
  assert.equal(result.harness, "copilot");
  assert.equal(result.skillsDir, ".github/skills");
});

test("errors when no harness directory is present", () => {
  const repoRoot = tempRepo();
  assert.throws(() => installSkills({ repoRoot }), /No harness directory detected/);
});

test("errors when multiple harnesses are ambiguous without --harness", () => {
  const repoRoot = tempRepo(".claude", ".github");
  assert.throws(() => installSkills({ repoRoot }), /Multiple harnesses detected/);
});

test("an explicit harness overrides auto-detection", () => {
  const repoRoot = tempRepo(".claude", ".github");
  const result = installSkills({ repoRoot, harness: "copilot" });
  assert.equal(result.harness, "copilot");
});

test("rejects an unknown harness", () => {
  const repoRoot = tempRepo(".claude");
  assert.throws(() => installSkills({ repoRoot, harness: "vim" }), /Unknown harness/);
});

test("symlink mode links back to the packaged skill", () => {
  const repoRoot = tempRepo(".claude");
  const result = installSkills({ repoRoot, symlink: true });
  assert.equal(result.mode, "symlink");

  const linkPath = path.join(repoRoot, ".claude", "skills", "dge-design");
  assert.ok(fs.lstatSync(linkPath).isSymbolicLink());
  assert.equal(fs.realpathSync(linkPath), fs.realpathSync(path.join(packagedSkillsDir(), "dge-design")));
});

test("re-running skips existing skills unless --force is passed", () => {
  const repoRoot = tempRepo(".claude");
  installSkills({ repoRoot });

  const skipped = installSkills({ repoRoot });
  assert.deepEqual(skipped.installed, []);
  assert.deepEqual(skipped.skipped, listPackagedSkills());

  const forced = installSkills({ repoRoot, force: true });
  assert.deepEqual(forced.installed, listPackagedSkills());
  assert.deepEqual(forced.skipped, []);
});
