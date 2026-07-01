import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(".");
const REQUIRED_EVIDENCE = "Gap register and requirement artifact";

test("installed package runs DGE intake and evidence loop from another repo", () => {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-pack-"));
  const consumerDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-consumer-"));
  const tarball = packPackage(packDir);

  run("npm", ["init", "-y"], consumerDir);
  run("npm", ["install", "--silent", "--no-audit", "--no-fund", tarball], consumerDir);

  runDge(consumerDir, "init", "--title", "External consumer graph");
  runDge(
    consumerDir,
    "add-demand",
    "--title",
    "Replace grill-me with DGE intake",
    "--source",
    "user",
    "--problem",
    "Raw demands need structured challenge before planning",
    "--outcome",
    "Intake produces machine-readable requirements and explicit gaps",
    "--constraint",
    "Ask one clarification at a time",
    "--non-goal",
    "Implementation planning during intake"
  );
  runDge(
    consumerDir,
    "add-requirement",
    "--demand",
    "DEM-001",
    "--statement",
    "Intake captures blocker gaps before planning",
    "--acceptance",
    "A blocker gap prevents track and node creation",
    "--evidence",
    REQUIRED_EVIDENCE
  );
  runDge(
    consumerDir,
    "add-gap",
    "--type",
    "validation",
    "--severity",
    "blocker",
    "--question",
    "What evidence proves the intake is complete?",
    "--blocks",
    "REQ-001"
  );

  assert.throws(
    () => runDge(consumerDir, "add-track", "--title", "Planning"),
    /blocker and must be resolved/
  );

  runDge(
    consumerDir,
    "resolve-gap",
    "GAP-001",
    "--resolution",
    "Require a persisted gap register, requirement artifact, and verification report"
  );
  runDge(consumerDir, "add-track", "--title", "Validation");
  runDge(
    consumerDir,
    "add-node",
    "--title",
    "Prove external evidence gate",
    "--type",
    "test",
    "--track",
    "TRK-validation",
    "--requirements",
    "REQ-001",
    "--validation",
    REQUIRED_EVIDENCE
  );

  const graphPath = path.join(consumerDir, "delivery-graph", "graph.json");
  assert.ok(fs.existsSync(graphPath));
  assert.ok(fs.existsSync(path.join(consumerDir, "delivery-graph", "demands", "DEM-001.md")));
  assert.ok(fs.existsSync(path.join(consumerDir, "delivery-graph", "requirements", "REQ-001.md")));
  assert.match(runDge(consumerDir, "status"), new RegExp(`NODE-001: ${REQUIRED_EVIDENCE}`));

  assert.throws(
    () => runDge(consumerDir, "verify", "NODE-001"),
    /missing validation evidence/
  );

  runDge(
    consumerDir,
    "evidence",
    "run",
    "NODE-001",
    "--satisfies",
    REQUIRED_EVIDENCE,
    "--summary",
    "Intake artifacts and blocker resolution are persisted in delivery-graph/",
    "--",
    process.execPath,
    "-e",
    "console.log('intake evidence captured')"
  );
  const doneOutput = runDge(consumerDir, "done", "NODE-001");
  assert.match(doneOutput, /NODE-001 done/);
  assert.match(doneOutput, /delivery-graph\/evidence\/NODE-001\/verification\.md/);
  assert.match(doneOutput, /delivery-graph\/reports\/review-/);

  const verificationPath = path.join(consumerDir, "delivery-graph", "evidence", "NODE-001", "verification.md");
  assert.match(fs.readFileSync(verificationPath, "utf8"), new RegExp(`${REQUIRED_EVIDENCE}: satisfied`));

  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  assert.equal(graph.nodes[0].status, "done");

  const statusOutput = runDge(consumerDir, "status", "--save");
  assert.match(statusOutput, /status report:/);
  assert.equal(fs.readdirSync(path.join(consumerDir, "delivery-graph", "reports")).some((file) => file.startsWith("status-")), true);

  const adoOutput = runDge(consumerDir, "sync", "ado", "--org", "ORG", "--project", "PROJECT");
  assert.match(adoOutput, /ado sync dry-run:/);
  assert.equal(fs.existsSync(path.join(consumerDir, "delivery-graph", "sync", "ado.json")), true);
});

test("installed package installs the dge-* skills into a consuming harness", () => {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-pack-"));
  const consumerDir = fs.mkdtempSync(path.join(os.tmpdir(), "dge-consumer-"));
  const tarball = packPackage(packDir);

  run("npm", ["init", "-y"], consumerDir);
  run("npm", ["install", "--silent", "--no-audit", "--no-fund", tarball], consumerDir);
  fs.mkdirSync(path.join(consumerDir, ".claude"), { recursive: true });

  const output = runDge(consumerDir, "install-skills");
  assert.match(output, /Installed DGE skills for claude \(copy\)/);

  const skillsRoot = path.join(consumerDir, ".claude", "skills");
  const packagedSkills = fs
    .readdirSync(path.join(repoRoot, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("dge-"))
    .map((entry) => entry.name);

  for (const skill of packagedSkills) {
    assert.ok(
      fs.existsSync(path.join(skillsRoot, skill, "SKILL.md")),
      `expected ${skill}/SKILL.md to be installed`
    );
  }
});

function packPackage(packDir) {
  run("npm", ["pack", "--silent", "--pack-destination", packDir], repoRoot);
  const tarballs = fs.readdirSync(packDir).filter((file) => file.endsWith(".tgz"));
  assert.equal(tarballs.length, 1);
  return path.join(packDir, tarballs[0]);
}

function runDge(cwd, ...args) {
  const dgePath = path.join(cwd, "node_modules", ".bin", process.platform === "win32" ? "dge.cmd" : "dge");
  return run(dgePath, args, cwd);
}

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}
