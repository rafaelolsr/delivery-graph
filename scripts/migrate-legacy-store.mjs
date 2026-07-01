#!/usr/bin/env node
// Migrate a legacy dge-intake store (version "1.0", flat demands/requirements/gaps,
// no nested `graph`) into the current CLI schema by replaying it through `dge`.
//
// DRY RUN BY DEFAULT: prints the exact commands it would run and writes nothing.
// Pass --apply to actually run them against a fresh graph.
//
// Usage:
//   node scripts/migrate-legacy-store.mjs <old-graph.json> <new-graph.json> [--title "..."] [--apply]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const positional = args.filter((a) => !a.startsWith("--"));
const [oldPath, newPath] = positional;
const titleIdx = args.indexOf("--title");
const title = titleIdx !== -1 ? args[titleIdx + 1] : "Migrated delivery graph";

if (!oldPath || !newPath) {
  console.error('Usage: node scripts/migrate-legacy-store.mjs <old-graph.json> <new-graph.json> [--title "..."] [--apply]');
  process.exit(1);
}

const dge = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "bin", "dge.mjs");
const old = JSON.parse(fs.readFileSync(oldPath, "utf8"));

const planned = [];
const plan = (...cliArgs) => planned.push(cliArgs);

plan("init", "--graph", newPath, "--title", title);

for (const d of old.demands ?? []) {
  const a = ["add-demand", "--graph", newPath, "--title", d.title, "--source", d.source ?? "migrated", "--outcome", d.outcome ?? ""];
  if (d.problem) a.push("--problem", d.problem);
  if (d.requester) a.push("--requester", d.requester);
  for (const ng of d.non_goals ?? []) a.push("--non-goal", ng);
  plan(...a);
}

for (const r of old.requirements ?? []) {
  const evidence = Array.isArray(r.validation?.required_evidence)
    ? r.validation.required_evidence.join(" | ")
    : (r.validation?.required_evidence ?? "Evidence required");
  const a = ["add-requirement", "--graph", newPath, "--demand", r.demand_id, "--statement", r.statement];
  if (r.priority) a.push("--priority", r.priority);
  for (const ac of r.acceptance ?? []) a.push("--acceptance", ac);
  if (r.validation?.method) a.push("--validation-method", r.validation.method);
  a.push("--evidence", evidence);
  plan(...a);
}

for (const g of old.gaps ?? []) {
  const a = ["add-gap", "--graph", newPath, "--type", g.type, "--severity", g.severity, "--question", g.question];
  for (const b of g.blocks ?? []) a.push("--blocks", b);
  plan(...a);
  if (g.resolution) {
    plan("resolve-gap", g.id, "--graph", newPath, "--resolution", g.resolution);
  }
}

console.log(`Legacy store: ${oldPath}`);
console.log(`Target store: ${newPath}`);
console.log(`Demands: ${(old.demands ?? []).length} · Requirements: ${(old.requirements ?? []).length} · Gaps: ${(old.gaps ?? []).length}`);
console.log(`Unresolved blocker gaps carried over: ${(old.gaps ?? []).filter((g) => g.severity === "blocker" && !g.resolution).length}`);
console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — ${planned.length} commands:\n`);

for (const cliArgs of planned) {
  console.log(`  dge ${cliArgs.map((x) => (/\s/.test(x) ? JSON.stringify(x) : x)).join(" ")}`);
  if (apply) {
    execFileSync(process.execPath, [dge, ...cliArgs], { stdio: ["ignore", "ignore", "inherit"] });
  }
}

if (!apply) {
  console.log(`\nDry run only. Re-run with --apply to write ${newPath}.`);
} else {
  console.log(`\nDone. Wrote ${newPath}. Note: ready_for_graph stays false until blocker gaps are resolved.`);
}
