// OKF v0.2 conformance validator (DEM-021 / REQ-094, NODE-089).
//
// Implements the conformance rules from OKF SPEC §11 (pinned commit 3fcbb9f):
//
//   A bundle is conformant with OKF v0.2 if:
//   1. Every non-reserved `.md` file contains a parseable YAML frontmatter block.
//   2. Every frontmatter block contains a non-empty `type` field.
//   3. Every reserved filename (index.md, log.md) follows §8/§9 when present.
//
// Plus the DGE packaging rule (ADR-001 / SPEC §12): the bundle-root index.md MUST
// carry okf_version. Per §11 the validator is permissive about everything else —
// unknown types, unknown keys, missing optional families, and broken links are NOT
// errors and are never reported as failures.
//
// Operates on an in-memory bundle map { path -> content } so it is pure and testable
// against both the generator's output and hand-built fixtures.

import { splitFrontmatter } from "./okf-concept.mjs";

const RESERVED = new Set(["index.md", "log.md"]);

// True when the frontmatter declares a `type` whose *value* is a non-empty string,
// unwrapping a quoted empty string (`type: ""`) which is still empty (§11.2).
function hasNonEmptyType(frontmatter) {
  const match = frontmatter.match(/(?:^|\n)type:[ \t]*(.*)/);
  if (!match) return false;
  let value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value.trim() !== "";
}

function isReserved(relativePath) {
  const base = relativePath.split("/").pop();
  return RESERVED.has(base);
}

// validateBundle(bundle) -> { conformant: boolean, errors: [{ file, rule, message }] }
export function validateBundle(bundle) {
  const errors = [];

  for (const [file, content] of Object.entries(bundle)) {
    if (!file.endsWith(".md")) continue;

    if (isReserved(file)) {
      validateReserved(file, content, errors);
      continue;
    }

    // Rule 1 + 2: non-reserved concept files need parseable frontmatter (§11.1) and a
    // non-empty type (§11.2). Split first so we can distinguish an *unparseable* block
    // (§11.1) from a parseable block whose `type` is missing/empty (§11.2) — parseConcept
    // conflates the two by throwing on an empty type, which would mislabel the rule.
    let frontmatter;
    try {
      ({ frontmatter } = splitFrontmatter(content));
    } catch (error) {
      errors.push({ file, rule: "§11.1", message: `unparseable frontmatter: ${error.message}` });
      continue;
    }
    if (!hasNonEmptyType(frontmatter)) {
      errors.push({ file, rule: "§11.2", message: "frontmatter `type` is missing or empty" });
    }
  }

  // Packaging rule: the bundle-root index.md must exist and carry okf_version (§8/§12).
  validateRootIndex(bundle, errors);

  return { conformant: errors.length === 0, errors };
}

// Reserved files: index.md may carry ONLY okf_version frontmatter (and only at the
// root); log.md carries no frontmatter (§8, §9). We do not reject a non-root index
// for lacking frontmatter — §8 permits a bare index. We only reject a reserved file
// that carries a *malformed* frontmatter block (opens `---` but never closes).
function validateReserved(file, content, errors) {
  const base = file.split("/").pop();
  const opensFrontmatter = content.replace(/\r\n/g, "\n").startsWith("---\n");
  if (base === "log.md" && opensFrontmatter) {
    errors.push({ file, rule: "§9", message: "log.md must not carry a frontmatter block" });
    return;
  }
  if (opensFrontmatter) {
    // If it opens a block it must close it (otherwise it is not parseable, §11.1).
    try {
      splitFrontmatter(content);
    } catch (error) {
      errors.push({ file, rule: "§11.1", message: `malformed frontmatter: ${error.message}` });
    }
  }
}

function validateRootIndex(bundle, errors) {
  const index = bundle["index.md"];
  if (index === undefined) {
    errors.push({ file: "index.md", rule: "§8/§12", message: "bundle-root index.md is missing" });
    return;
  }
  const opensFrontmatter = index.replace(/\r\n/g, "\n").startsWith("---\n");
  if (!opensFrontmatter) {
    errors.push({ file: "index.md", rule: "§12", message: "root index.md must carry an okf_version frontmatter block" });
    return;
  }
  let frontmatter;
  try {
    ({ frontmatter } = splitFrontmatter(index));
  } catch (error) {
    errors.push({ file: "index.md", rule: "§11.1", message: `malformed root index frontmatter: ${error.message}` });
    return;
  }
  if (!/(^|\n)okf_version:\s*\S+/.test(frontmatter)) {
    errors.push({ file: "index.md", rule: "§12", message: "root index.md frontmatter is missing okf_version" });
  }
}
