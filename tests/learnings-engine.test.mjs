import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findLearnings, learningsDir, listLearnings } from "../src/learnings-engine.mjs";

function makeStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dge-learnings-"));
  const graphPath = path.join(root, "delivery-graph", "graph.json");
  fs.mkdirSync(learningsDir(graphPath), { recursive: true });
  return { root, graphPath };
}

function writeLearning(graphPath, slug, contents) {
  fs.writeFileSync(path.join(learningsDir(graphPath), `${slug}.md`), contents);
}

test("lists nothing when there are no learnings", () => {
  const { graphPath } = makeStore();
  assert.deepEqual(listLearnings(graphPath), []);
});

test("parses a legacy learning with no frontmatter", () => {
  const { graphPath } = makeStore();
  writeLearning(
    graphPath,
    "evidence-add-can-falsely-satisfy",
    [
      "# `dge evidence add` can falsely satisfy a contract",
      "",
      "## Applies when",
      "",
      "Capturing manual/external evidence.",
      "",
      "## Related graph ids",
      "",
      "NODE-003, NODE-004, DEM-002",
      ""
    ].join("\n")
  );

  const [learning] = listLearnings(graphPath);
  assert.equal(learning.title, "`dge evidence add` can falsely satisfy a contract");
  assert.equal(learning.applies_when, "Capturing manual/external evidence.");
  assert.deepEqual(learning.related, ["NODE-003", "NODE-004", "DEM-002"]);
  assert.deepEqual(learning.tags, []);
});

test("parses frontmatter tags and related ids", () => {
  const { graphPath } = makeStore();
  writeLearning(
    graphPath,
    "with-frontmatter",
    [
      "---",
      "title: Substring evidence is weak",
      "tags: [evidence, validation, correctness]",
      "related: [NODE-003, DEM-002]",
      "---",
      "",
      "# Substring evidence is weak",
      "",
      "## Applies when",
      "",
      "Writing documentation-correctness contracts.",
      ""
    ].join("\n")
  );

  const [learning] = listLearnings(graphPath);
  assert.equal(learning.title, "Substring evidence is weak");
  assert.deepEqual(learning.tags, ["evidence", "validation", "correctness"]);
  assert.deepEqual(learning.related, ["NODE-003", "DEM-002"]);
});

test("findLearnings returns all with no terms", () => {
  const { graphPath } = makeStore();
  writeLearning(graphPath, "a", "# A\n\n## Applies when\n\nx\n");
  writeLearning(graphPath, "b", "# B\n\n## Applies when\n\ny\n");
  assert.equal(findLearnings(graphPath).length, 2);
});

test("findLearnings matches title, tag, applies-when, and related id", () => {
  const { graphPath } = makeStore();
  writeLearning(
    graphPath,
    "evidence",
    "---\ntitle: Evidence gate\ntags: [gate]\nrelated: [NODE-003]\n---\n\n# Evidence gate\n\n## Applies when\n\nCapturing proof.\n"
  );
  writeLearning(graphPath, "plugin", "# Plugin manifest\n\n## Applies when\n\nPackaging.\n");

  assert.deepEqual(findLearnings(graphPath, ["gate"]).map((l) => l.slug), ["evidence"]);
  assert.deepEqual(findLearnings(graphPath, ["proof"]).map((l) => l.slug), ["evidence"]);
  assert.deepEqual(findLearnings(graphPath, ["NODE-003"]).map((l) => l.slug), ["evidence"]);
  assert.deepEqual(findLearnings(graphPath, ["packaging"]).map((l) => l.slug), ["plugin"]);
  assert.deepEqual(findLearnings(graphPath, ["nonexistent"]), []);
});

test("matching is case-insensitive", () => {
  const { graphPath } = makeStore();
  writeLearning(graphPath, "x", "---\ntitle: X\ntags: [Evidence]\n---\n\n# X\n");
  assert.equal(findLearnings(graphPath, ["EVIDENCE"]).length, 1);
});
