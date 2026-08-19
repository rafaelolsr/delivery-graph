import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateBundle } from "../src/okf-conformance.mjs";
import { graphToBundle } from "../src/okf-bundle.mjs";

// A committed golden snapshot of the canonical delivery-graph/graph.json.
// The live store is gitignored (.gitignore ignores delivery-graph/), so the
// test cannot read it in CI or a fresh clone — it reads this fixture instead.
// Refresh with: cp delivery-graph/graph.json tests/fixtures/canonical-graph.json
const GRAPH_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "canonical-graph.json",
);

function goodBundle() {
  // Generate from the real canonical store so the positive fixture is real output.
  const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"));
  return graphToBundle(graph);
}

test("a conformant generated bundle passes (SPEC §11)", () => {
  const result = validateBundle(goodBundle());
  assert.equal(result.conformant, true, `expected conformant, errors: ${JSON.stringify(result.errors.slice(0, 3))}`);
  assert.deepEqual(result.errors, []);
});

test("a small hand-built conformant bundle passes", () => {
  const bundle = {
    "index.md": '---\nokf_version: "0.2"\n---\n\n# Bundle\n',
    "tasks/NODE-1.md": "---\ntype: Task\ntitle: A\n---\n\nbody\n"
  };
  assert.equal(validateBundle(bundle).conformant, true);
});

test("FAIL: a concept with no type is rejected (§11.2)", () => {
  const bundle = {
    "index.md": '---\nokf_version: "0.2"\n---\n',
    "tasks/NODE-1.md": "---\ntitle: no type here\n---\nbody\n"
  };
  const result = validateBundle(bundle);
  assert.equal(result.conformant, false);
  assert.ok(result.errors.some((e) => e.file === "tasks/NODE-1.md" && e.rule.startsWith("§11")),
    "expected a §11 type error");
});

test("FAIL: a concept whose type is an empty string is rejected under §11.2 (not §11.1)", () => {
  const bundle = {
    "index.md": '---\nokf_version: "0.2"\n---\n',
    "tasks/NODE-1.md": '---\ntype: ""\ntitle: empty type\n---\nbody\n'
  };
  const result = validateBundle(bundle);
  assert.equal(result.conformant, false);
  const err = result.errors.find((e) => e.file === "tasks/NODE-1.md");
  assert.equal(err.rule, "§11.2", "empty type is a type error (§11.2), not an unparseable-block error");
});

test("FAIL: an unparseable frontmatter block is rejected (§11.1)", () => {
  const bundle = {
    "index.md": '---\nokf_version: "0.2"\n---\n',
    "tasks/NODE-1.md": "no frontmatter at all, just prose\n"
  };
  const result = validateBundle(bundle);
  assert.equal(result.conformant, false);
  assert.ok(result.errors.some((e) => e.file === "tasks/NODE-1.md" && e.rule === "§11.1"));
});

test("FAIL: a root index.md without okf_version is rejected (§12)", () => {
  const bundle = {
    "index.md": "---\ntitle: no version\n---\n",
    "tasks/NODE-1.md": "---\ntype: Task\n---\nbody\n"
  };
  const result = validateBundle(bundle);
  assert.equal(result.conformant, false);
  assert.ok(result.errors.some((e) => e.file === "index.md" && e.rule === "§12"));
});

test("FAIL: a missing root index.md is rejected (§8/§12)", () => {
  const bundle = { "tasks/NODE-1.md": "---\ntype: Task\n---\nbody\n" };
  const result = validateBundle(bundle);
  assert.equal(result.conformant, false);
  assert.ok(result.errors.some((e) => e.file === "index.md"));
});

test("FAIL: a log.md carrying frontmatter is rejected (§9)", () => {
  const bundle = {
    "index.md": '---\nokf_version: "0.2"\n---\n',
    "log.md": "---\ntype: nope\n---\n# Log\n"
  };
  const result = validateBundle(bundle);
  assert.equal(result.conformant, false);
  assert.ok(result.errors.some((e) => e.file === "log.md" && e.rule === "§9"));
});

test("permissive: unknown type values and unknown keys do NOT fail conformance (§11)", () => {
  const bundle = {
    "index.md": '---\nokf_version: "0.2"\n---\n',
    "concepts/x.md": "---\ntype: SomeUnregisteredType\nweird_future_key: 1\n---\nbody\n"
  };
  assert.equal(validateBundle(bundle).conformant, true);
});
