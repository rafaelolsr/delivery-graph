import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  planSigning,
  setupSigning,
  gitignoreCoversKeyDir,
  signingKeyPath
} from "../src/signing.mjs";

// DEM-020 Track 1 / NODE-079 (REQ-084): `dge setup signing` stands up the
// repo-private HMAC key at .dge/signing.key (mode 600, untracked by git) and
// REFUSES with a non-zero exit when .gitignore does not exclude .dge/. The key is
// the root of trust for the evidence-gate seal and must never enter git.

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dge-signing-"));
}

function initGitRepo(repo) {
  const run = (args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  run(["init", "-q"]);
  run(["config", "user.email", "t@t.test"]);
  run(["config", "user.name", "t"]);
  return run;
}

// ── Contract check 1: key exists with 600 perms and is untracked by git ──────

test("setup signing creates .dge/signing.key with 600 perms", () => {
  const repo = tmpRepo();
  try {
    fs.writeFileSync(path.join(repo, ".gitignore"), ".dge/\n");
    const result = setupSigning({ repoRoot: repo });

    assert.equal(result.ok, true, "setup succeeds when .gitignore covers .dge/");
    assert.equal(result.created, true, "a fresh key is written");
    const keyPath = signingKeyPath(repo);
    assert.ok(fs.existsSync(keyPath), "key file exists");
    const mode = fs.statSync(keyPath).mode & 0o777;
    assert.equal(mode, 0o600, `key mode is 600, got ${mode.toString(8)}`);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("the generated signing key is untracked by git", () => {
  const repo = tmpRepo();
  try {
    const run = initGitRepo(repo);
    fs.writeFileSync(path.join(repo, ".gitignore"), ".dge/\n");
    setupSigning({ repoRoot: repo });

    // git must not see the key as a candidate for tracking.
    const untracked = run(["status", "--porcelain", "--ignored", ".dge/signing.key"])
      .toString()
      .trim();
    assert.match(untracked, /^!!/, "key shows as git-ignored (!!), not tracked/untracked-addable");

    const tracked = run(["ls-files", ".dge/signing.key"]).toString().trim();
    assert.equal(tracked, "", "key is not in git ls-files");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ── Contract check 2: refuses (non-zero) when .gitignore lacks a .dge/ entry ──

test("planSigning blocks when .gitignore does not cover .dge/", () => {
  const repo = tmpRepo(); // no .gitignore at all
  try {
    const plan = planSigning({ repoRoot: repo });
    assert.equal(plan.blockers.length, 1, "one blocker: gitignore does not cover .dge/");
    assert.equal(plan.blockers[0].kind, "gitignore");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("setup signing writes NOTHING and reports not-ok when .dge/ is not ignored", () => {
  const repo = tmpRepo();
  try {
    fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n"); // covers something else
    const result = setupSigning({ repoRoot: repo });

    assert.equal(result.ok, false, "setup refuses when .dge/ is not ignored");
    assert.equal(result.created, false, "no key written");
    assert.ok(!fs.existsSync(signingKeyPath(repo)), "key file must not exist");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("the setup bin exits non-zero when .gitignore lacks a .dge/ entry", () => {
  const repo = tmpRepo();
  try {
    fs.writeFileSync(path.join(repo, ".gitignore"), "dist/\n");
    const bin = path.resolve("bin/dge-setup.mjs");
    let exitCode = 0;
    try {
      execFileSync("node", [bin, "signing"], { cwd: repo, stdio: "pipe" });
    } catch (err) {
      exitCode = err.status;
    }
    assert.equal(exitCode, 1, "`dge-setup signing` exits 1 when .dge/ is not git-ignored");
    assert.ok(!fs.existsSync(signingKeyPath(repo)), "no key written on refusal");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ── Guard behaviour: gitignore matcher accepts the human forms, rejects misses ─

test("gitignoreCoversKeyDir accepts .dge/ forms and rejects near-misses", () => {
  const repo = tmpRepo();
  try {
    const gi = path.join(repo, ".gitignore");
    for (const form of [".dge/", ".dge", "/.dge", "/.dge/"]) {
      fs.writeFileSync(gi, `# comment\n${form}\n`);
      assert.equal(gitignoreCoversKeyDir(repo), true, `accepts "${form}"`);
    }
    fs.writeFileSync(gi, ".dgexyz/\n");
    assert.equal(gitignoreCoversKeyDir(repo), false, "rejects a near-miss like .dgexyz/");
    fs.rmSync(gi);
    assert.equal(gitignoreCoversKeyDir(repo), false, "a missing .gitignore is not covered");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
