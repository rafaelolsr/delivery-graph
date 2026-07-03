import fs from "node:fs";
import path from "node:path";
import {
  installSkills,
  resolveHarnessTarget,
  packagedSkillsDir
} from "./skill-installer.mjs";

// REQ-042 / NODE-049: one cross-platform code path that sets up everything DGE
// OWNS on a new machine — it installs the /dge-* skills for the harness(es) the
// user selects, reusing installSkills. It does NOT install a harness or Node
// itself; when a selected harness (or Node) is missing it reports a clear
// "install X first" message instead of silently half-configuring.
//
// The module is split into a pure planner (runSetup, no process/exit) and a bin
// wrapper (bin/dge-setup.mjs) so the guidance logic is unit-testable without
// spawning real harnesses.

export const SUPPORTED_HARNESSES = ["claude", "copilot"];

// How to tell the user to get a missing prerequisite. Kept as data so the
// message is one place and the same on every OS.
const INSTALL_HINTS = {
  node: "Install Node.js >= 20 first: https://nodejs.org",
  claude: "Install Claude Code first, then re-run setup: it creates the .claude/ directory this step needs.",
  copilot: "Install GitHub Copilot CLI first, then re-run setup: it creates the .github/ directory this step needs."
};

export const MIN_NODE_MAJOR = 20;

export function parseNodeMajor(version) {
  const match = String(version).match(/^v?(\d+)\./);
  return match ? Number(match[1]) : NaN;
}

// A harness is "present" when its marker directory exists in the repo — the same
// signal skill-installer uses to target a harness. We never create the marker
// ourselves; that belongs to the harness install, and creating it here would be
// exactly the silent half-configuration REQ-042 forbids.
function harnessPresent(repoRoot, harness) {
  const target = resolveHarnessTarget(harness);
  return fs.existsSync(path.join(repoRoot, target.marker));
}

// Pure planner: given the selected harnesses and the environment, decide what to
// install and what to block on. Returns a structured plan; performs NO writes
// and never exits the process. `installer` is injectable for tests.
export function planSetup({
  repoRoot = process.cwd(),
  harnesses = [],
  nodeVersion = process.version
} = {}) {
  const blockers = [];
  const targets = [];

  const nodeMajor = parseNodeMajor(nodeVersion);
  if (!Number.isFinite(nodeMajor) || nodeMajor < MIN_NODE_MAJOR) {
    blockers.push({ kind: "node", message: INSTALL_HINTS.node });
  }

  const selection = harnesses.length > 0 ? harnesses : [];
  for (const harness of selection) {
    if (!SUPPORTED_HARNESSES.includes(harness)) {
      blockers.push({ kind: harness, message: `Unknown harness "${harness}". Supported: ${SUPPORTED_HARNESSES.join(", ")}.` });
      continue;
    }
    if (!harnessPresent(repoRoot, harness)) {
      blockers.push({ kind: harness, message: INSTALL_HINTS[harness] });
      continue;
    }
    targets.push(harness);
  }

  if (selection.length === 0) {
    blockers.push({ kind: "selection", message: `Select at least one harness to set up: ${SUPPORTED_HARNESSES.join(", ")} (e.g. --harness claude).` });
  }

  return { repoRoot, targets, blockers };
}

// Execute a plan: install skills for every target harness. If ANY selected
// harness is blocked, we install nothing and return the plan for the caller to
// report — half-configuration is the failure mode REQ-042 exists to prevent.
export function runSetup(options = {}, { installer = installSkills, skillsDir = packagedSkillsDir() } = {}) {
  const plan = planSetup(options);

  if (plan.blockers.length > 0) {
    return { ok: false, installed: [], ...plan };
  }

  const installed = [];
  for (const harness of plan.targets) {
    const result = installer({
      repoRoot: plan.repoRoot,
      harness,
      force: Boolean(options.force),
      skillsDir
    });
    installed.push(result);
  }

  return { ok: true, installed, ...plan };
}

// Render a plan/result as human-facing lines for the bin wrapper.
export function renderSetup(result) {
  const lines = [];
  if (!result.ok) {
    lines.push("DGE setup could not complete — resolve these first, then re-run:");
    for (const blocker of result.blockers) {
      lines.push(`  • ${blocker.message}`);
    }
    lines.push("");
    lines.push("Nothing was installed (setup never half-configures a machine).");
    return lines.join("\n");
  }

  lines.push("DGE setup complete.");
  for (const install of result.installed) {
    const count = install.installed.length;
    lines.push(`  • ${install.harness}: ${count} skill${count === 1 ? "" : "s"} -> ${install.skillsDir}`);
    if (install.skipped.length > 0) {
      lines.push(`    (${install.skipped.length} already present; pass --force to overwrite)`);
    }
  }
  lines.push("");
  lines.push("Next: `dge init --title \"...\"` (optional) then `dge add-demand ...`.");
  return lines.join("\n");
}
