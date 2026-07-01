import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const binDge = path.join(repoRoot, "bin", "dge");
const binDgeMjs = path.join(repoRoot, "bin", "dge.mjs");

// The plugin exposes bin/ files to the harness PATH by filename, so an
// extensionless bin/dge is what makes the bare `dge` command work without a
// separate npm install. See DEM-005 / the StarBase drift root cause.
test("bin/dge exists", () => {
  assert.ok(fs.existsSync(binDge), "bin/dge must exist so the plugin PATH exposes a bare `dge`");
});

test("bin/dge is executable", () => {
  const mode = fs.statSync(binDge).mode;
  assert.ok(mode & 0o111, "bin/dge must have the executable bit set");
});

test("bin/dge has a node shebang", () => {
  const firstLine = fs.readFileSync(binDge, "utf8").split("\n")[0];
  assert.match(firstLine, /^#!.*\bnode\b/);
});

test("bin/dge runs the same CLI as bin/dge.mjs", () => {
  const viaShim = execFileSync(binDge, { encoding: "utf8" });
  const viaMjs = execFileSync(process.execPath, [binDgeMjs], { encoding: "utf8" });
  assert.equal(viaShim, viaMjs);
  assert.match(viaShim, /Delivery Graph Engineering CLI/);
});

test("package.json ships bin/ so bin/dge reaches consumers", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.ok((pkg.files ?? []).some((f) => f === "bin/" || f === "bin"), "files[] must include bin/");
});
