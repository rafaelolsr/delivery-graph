import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planSetup, runSetup, renderSetup, SUPPORTED_HARNESSES } from "../src/setup.mjs";

// REQ-042 / NODE-049: one cross-platform bootstrap that installs the /dge-* skills
// for the selected harness(es) reusing installSkills, and prints "install X first"
// guidance when a harness (or Node) is absent rather than half-configuring.

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dge-setup-"));
}

// A fake installer so we assert setup REUSES installSkills without touching disk.
function fakeInstaller(calls) {
  return (opts) => {
    calls.push(opts);
    return { harness: opts.harness, skillsDir: `${opts.harness}/skills`, mode: "copy", installed: ["dge-deliver"], skipped: [] };
  };
}

test("installs skills for a present harness, reusing installSkills", () => {
  const repo = tmpRepo();
  try {
    fs.mkdirSync(path.join(repo, ".claude")); // harness marker present
    const calls = [];
    const result = runSetup({ repoRoot: repo, harnesses: ["claude"] }, { installer: fakeInstaller(calls) });

    assert.equal(result.ok, true, "setup succeeds when the harness is present");
    assert.deepEqual(result.targets, ["claude"]);
    assert.equal(calls.length, 1, "installSkills invoked once");
    assert.equal(calls[0].harness, "claude");
    assert.equal(result.installed[0].installed.length, 1);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("a missing harness is blocked with install-first guidance and installs NOTHING", () => {
  const repo = tmpRepo(); // no .claude/ marker
  try {
    const calls = [];
    const result = runSetup({ repoRoot: repo, harnesses: ["claude"] }, { installer: fakeInstaller(calls) });

    assert.equal(result.ok, false, "setup blocks when the harness is absent");
    assert.equal(calls.length, 0, "installer never called — no half-configuration");
    assert.equal(result.blockers.length, 1);
    assert.match(result.blockers[0].message, /Install Claude Code first/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("if ANY selected harness is blocked, no harness is configured", () => {
  const repo = tmpRepo();
  try {
    fs.mkdirSync(path.join(repo, ".claude")); // claude present, copilot absent
    const calls = [];
    const result = runSetup({ repoRoot: repo, harnesses: ["claude", "copilot"] }, { installer: fakeInstaller(calls) });

    assert.equal(result.ok, false, "one blocked harness blocks the whole run");
    assert.equal(calls.length, 0, "no partial install even though claude was ready");
    assert.ok(result.blockers.some((b) => /Install GitHub Copilot CLI first/.test(b.message)));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("an unsupported Node version blocks with an install-Node message", () => {
  const repo = tmpRepo();
  try {
    fs.mkdirSync(path.join(repo, ".claude"));
    const plan = planSetup({ repoRoot: repo, harnesses: ["claude"], nodeVersion: "v18.0.0" });
    assert.ok(plan.blockers.some((b) => b.kind === "node" && /Node\.js >= 20/.test(b.message)));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("selecting no harness is a blocker, not a silent no-op", () => {
  const repo = tmpRepo();
  try {
    const result = runSetup({ repoRoot: repo, harnesses: [] }, { installer: fakeInstaller([]) });
    assert.equal(result.ok, false);
    assert.ok(result.blockers.some((b) => b.kind === "selection"));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("renderSetup surfaces guidance on failure and next-steps on success", () => {
  const repo = tmpRepo();
  try {
    fs.mkdirSync(path.join(repo, ".claude"));
    const ok = renderSetup(runSetup({ repoRoot: repo, harnesses: ["claude"] }, { installer: fakeInstaller([]) }));
    assert.match(ok, /DGE setup complete/);
    assert.match(ok, /^## Next$/m); // shared skeleton: always a Next block

    const blocked = renderSetup(runSetup({ repoRoot: tmpRepo(), harnesses: ["claude"] }, { installer: fakeInstaller([]) }));
    assert.match(blocked, /could not complete/);
    assert.match(blocked, /nothing was installed/i);
    assert.match(blocked, /^## Next$/m);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("SUPPORTED_HARNESSES matches the skill-installer's targets", () => {
  assert.deepEqual([...SUPPORTED_HARNESSES].sort(), ["claude", "copilot"]);
});
