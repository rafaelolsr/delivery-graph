import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// DEM-020 Track 1 / NODE-079 (REQ-084): the repo-private HMAC signing key that
// the evidence-gate seal (NODE-080) is built on. This module OWNS the key
// foundation only — it generates `.dge/signing.key` and refuses to do so unless
// `.gitignore` already excludes `.dge/`, so the root of trust can never enter git.
// Seal minting and verifyNode enforcement live in later nodes; nothing here reads
// or writes graph.json.
//
// Split, like setup.mjs, into a pure planner (planSigning — no writes, no exit)
// and an effectful runner (setupSigning) so the guard logic is unit-testable
// without touching a real repo's keys.

export const KEY_DIR = ".dge";
export const KEY_FILE = "signing.key";
export const KEY_MODE = 0o600;

// The key path, relative to the repo root, as one place both the planner and the
// runner agree on.
export function signingKeyPath(repoRoot = process.cwd()) {
  return path.join(repoRoot, KEY_DIR, KEY_FILE);
}

// Does this repo's .gitignore keep .dge/ out of git? We accept the common forms a
// human would write to ignore the directory — `.dge/`, `.dge`, or a leading-slash
// anchored variant — but nothing broader, so a near-miss doesn't read as covered.
// A missing .gitignore is "not covered": the key would be trackable.
export function gitignoreCoversKeyDir(repoRoot = process.cwd()) {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return false;
  const lines = fs
    .readFileSync(gitignorePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const accepted = new Set([".dge", ".dge/", "/.dge", "/.dge/"]);
  return lines.some((line) => accepted.has(line));
}

// Pure planner: decide whether signing setup can proceed. Returns the key path and
// any blocker; performs NO writes and never exits. The one hard gate is that
// .gitignore must already exclude .dge/ — we never edit .gitignore ourselves, since
// silently making the key ignorable would hide exactly the mistake this guards.
export function planSigning({ repoRoot = process.cwd() } = {}) {
  const keyPath = signingKeyPath(repoRoot);
  const blockers = [];

  if (!gitignoreCoversKeyDir(repoRoot)) {
    blockers.push({
      kind: "gitignore",
      message:
        "Add `.dge/` to .gitignore before running setup signing — the HMAC signing key must never enter git."
    });
  }

  const exists = fs.existsSync(keyPath);
  return { repoRoot, keyPath, exists, blockers };
}

// Execute the plan: create .dge/ and write a fresh random key at 0600. If
// .gitignore does not cover .dge/, write NOTHING and return the blocker for the
// caller to report — a key that can leak into git is worse than no key. An
// existing key is left untouched (idempotent) unless `force` is set, so re-running
// setup never silently rotates the root of trust out from under a sealed graph.
export function setupSigning(
  options = {},
  { generateKey = defaultGenerateKey } = {}
) {
  const plan = planSigning(options);

  if (plan.blockers.length > 0) {
    return { ok: false, created: false, ...plan };
  }

  if (plan.exists && !options.force) {
    return { ok: true, created: false, ...plan };
  }

  const dir = path.dirname(plan.keyPath);
  fs.mkdirSync(dir, { recursive: true });
  // Write with the restrictive mode up front, then chmod to be explicit and to
  // correct a pre-existing loose-permissioned file when --force rotates it.
  fs.writeFileSync(plan.keyPath, generateKey(), { mode: KEY_MODE });
  fs.chmodSync(plan.keyPath, KEY_MODE);

  return { ok: true, created: true, ...plan };
}

function defaultGenerateKey() {
  // 32 bytes of CSPRNG entropy, hex-encoded — the HMAC key the seal digest uses.
  return `${crypto.randomBytes(32).toString("hex")}\n`;
}

// Is the signing key present on this host? The seal gate is fail-closed on a
// present-but-uncheckable seal, so callers need to distinguish "no key" from
// "wrong key".
export function signingKeyPresent(repoRoot = process.cwd()) {
  return fs.existsSync(signingKeyPath(repoRoot));
}

// Read the raw key bytes. Throws when absent — a caller that needs to sign or
// check a seal without a key cannot proceed, and silently treating that as
// "unsigned" would be the fail-open the seal exists to prevent.
export function readSigningKey(repoRoot = process.cwd()) {
  const keyPath = signingKeyPath(repoRoot);
  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `signing key not found at ${keyPath}; run \`dge setup signing\` before sealing or verifying a sealed contract`
    );
  }
  return fs.readFileSync(keyPath);
}

// HMAC-SHA256 of `payload` under the repo-private key, hex-encoded. This is the
// one place the digest algorithm lives, so the seal (mint) and the gate (verify)
// can never drift apart.
export function computeSealDigest(payload, repoRoot = process.cwd()) {
  return crypto.createHmac("sha256", readSigningKey(repoRoot)).update(payload).digest("hex");
}

// Render a signing result as human-facing lines for the bin wrapper, matching the
// bold-TL;DR + Next convention the rest of the CLI uses.
export function renderSigning(result) {
  const lines = [];
  if (!result.ok) {
    lines.push("**DGE signing setup could not complete — no key was written.**");
    lines.push("");
    for (const blocker of result.blockers) {
      lines.push(`  • ${blocker.message}`);
    }
    return lines.join("\n");
  }

  if (!result.created) {
    lines.push("**DGE signing key already present — left untouched.**");
    lines.push("");
    lines.push(`  • key: ${result.keyPath} (pass --force to rotate)`);
    return lines.join("\n");
  }

  lines.push("**DGE signing key created.**");
  lines.push("");
  lines.push(`  • key: ${result.keyPath} (mode 600, git-ignored)`);
  return lines.join("\n");
}
