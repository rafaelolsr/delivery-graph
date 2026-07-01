import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rootManifest = path.join(repoRoot, "plugin.json");
const claudeManifest = path.join(repoRoot, ".claude-plugin", "plugin.json");

// Copilot CLI silently fails to load a plugin whose manifest lives ONLY in
// .claude-plugin/ (github/copilot-cli issue #2010). It checks a root-level
// plugin.json first. Claude Code reads .claude-plugin/plugin.json. So both
// files must exist and stay identical for the plugin to load in both harnesses.
test("a root-level plugin.json exists (required by Copilot CLI, issue #2010)", () => {
  assert.ok(fs.existsSync(rootManifest), "plugin.json must exist at the repo root for Copilot CLI");
});

test("root plugin.json and .claude-plugin/plugin.json are byte-identical", () => {
  assert.ok(fs.existsSync(claudeManifest), ".claude-plugin/plugin.json must exist for Claude Code");
  const root = fs.readFileSync(rootManifest, "utf8");
  const claude = fs.readFileSync(claudeManifest, "utf8");
  assert.equal(root, claude, "the two plugin manifests must stay identical to avoid harness drift");
});

test("plugin.json has a kebab-case name and no `skills` field (Claude rejects `skills`)", () => {
  const manifest = JSON.parse(fs.readFileSync(rootManifest, "utf8"));
  assert.match(manifest.name, /^[a-z][a-z0-9-]*$/, "name must be kebab-case");
  assert.equal(
    "skills" in manifest,
    false,
    "must omit `skills`: Copilot auto-scans skills/, and Claude Code rejects a manifest containing `skills`"
  );
});
