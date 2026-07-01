import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_TARGETS = {
  claude: { marker: ".claude", skillsDir: ".claude/skills" },
  copilot: { marker: ".github", skillsDir: ".github/skills" }
};

export function packagedSkillsDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(path.dirname(here), "skills");
}

export function listPackagedSkills(skillsDir = packagedSkillsDir()) {
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`Packaged skills directory not found: ${skillsDir}`);
  }
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("dge-"))
    .map((entry) => entry.name)
    .sort();
}

export function detectHarnesses(repoRoot) {
  return Object.entries(HARNESS_TARGETS)
    .filter(([, target]) => fs.existsSync(path.join(repoRoot, target.marker)))
    .map(([name]) => name);
}

export function resolveHarnessTarget(harness) {
  const target = HARNESS_TARGETS[harness];
  if (!target) {
    const supported = Object.keys(HARNESS_TARGETS).join(", ");
    throw new Error(`Unknown harness "${harness}". Supported harnesses: ${supported}`);
  }
  return target;
}

export function installSkills({
  repoRoot = process.cwd(),
  harness,
  symlink = false,
  force = false,
  skillsDir = packagedSkillsDir()
} = {}) {
  const resolvedHarness = harness ?? pickHarness(repoRoot);
  const target = resolveHarnessTarget(resolvedHarness);
  const skills = listPackagedSkills(skillsDir);
  const destRoot = path.resolve(repoRoot, target.skillsDir);
  fs.mkdirSync(destRoot, { recursive: true });

  const installed = [];
  const skipped = [];
  for (const skill of skills) {
    const source = path.join(skillsDir, skill);
    const dest = path.join(destRoot, skill);

    if (fs.existsSync(dest) || isDanglingSymlink(dest)) {
      if (!force) {
        skipped.push(skill);
        continue;
      }
      fs.rmSync(dest, { recursive: true, force: true });
    }

    if (symlink) {
      fs.symlinkSync(source, dest, "dir");
    } else {
      fs.cpSync(source, dest, { recursive: true });
    }
    installed.push(skill);
  }

  return {
    harness: resolvedHarness,
    skillsDir: target.skillsDir,
    destination: destRoot,
    mode: symlink ? "symlink" : "copy",
    installed,
    skipped
  };
}

function pickHarness(repoRoot) {
  const detected = detectHarnesses(repoRoot);
  if (detected.length === 0) {
    const supported = Object.keys(HARNESS_TARGETS).join(", ");
    throw new Error(
      `No harness directory detected in ${repoRoot}. Create one (e.g. .claude/) or pass --harness <${supported}>.`
    );
  }
  if (detected.length > 1) {
    throw new Error(
      `Multiple harnesses detected (${detected.join(", ")}). Pass --harness <name> to choose one.`
    );
  }
  return detected[0];
}

function isDanglingSymlink(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}
