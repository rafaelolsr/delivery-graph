import assert from "node:assert/strict";
import test from "node:test";
import {
  makeConcept,
  serializeConcept,
  parseConcept,
  splitFrontmatter,
  OKF_VERSION,
  DGE_EXTENSION_KEY,
  DGE_EXTENSION_VERSION
} from "../src/okf-concept.mjs";

test("a concept requires a non-empty type (SPEC §4.1)", () => {
  assert.throws(() => makeConcept({ type: "" }), /non-empty `type`/);
  assert.throws(() => makeConcept({}), /non-empty `type`/);
  assert.doesNotThrow(() => makeConcept({ type: "Task" }));
});

test("round-trips scalars, lists, nested mappings, and body losslessly", () => {
  const concept = makeConcept({
    type: "Attested Computation",
    title: "Revenue for fiscal year",
    description: "One row per completed order.",
    tags: ["finance", "revenue"],
    parameters: [{ name: "year", type: "integer", required: true }],
    executor: { resource: "references/skills/run.md", receipt: ["job_id", "result"] },
    generated: { by: "reference_agent/gemini-2.5-pro", at: "2026-06-20T22:53:05Z" },
    verified: [{ by: "human:ahormati", at: "2026-06-25T09:00:00Z" }],
    body: "# Computation\n\n    SELECT 1\n"
  });
  const text = serializeConcept(concept);
  const parsed = parseConcept(text);
  assert.equal(parsed.type, "Attested Computation");
  assert.equal(parsed.title, "Revenue for fiscal year");
  assert.deepEqual(parsed.tags, ["finance", "revenue"]);
  assert.deepEqual(parsed.parameters, [{ name: "year", type: "integer", required: true }]);
  assert.deepEqual(parsed.executor, { resource: "references/skills/run.md", receipt: ["job_id", "result"] });
  assert.deepEqual(parsed.generated, { by: "reference_agent/gemini-2.5-pro", at: "2026-06-20T22:53:05Z" });
  assert.deepEqual(parsed.verified, [{ by: "human:ahormati", at: "2026-06-25T09:00:00Z" }]);
  assert.match(parsed.body, /SELECT 1/);
});

test("serialization is deterministic (byte-stable across two passes)", () => {
  const concept = makeConcept({
    type: "Task",
    title: "A task",
    tags: ["a", "b"],
    body: "Body text."
  });
  const once = serializeConcept(concept);
  const twice = serializeConcept(parseConcept(once));
  assert.equal(once, twice);
});

test("unknown/producer keys are preserved through a round trip (SPEC §11)", () => {
  const text = [
    "---",
    "type: Reference",
    "some_future_field: hello",
    "nested_unknown:",
    "  a: 1",
    "  b: two",
    "---",
    "body"
  ].join("\n");
  const parsed = parseConcept(text);
  assert.equal(parsed.some_future_field, "hello");
  assert.deepEqual(parsed.nested_unknown, { a: 1, b: "two" });
  // re-serializing keeps them
  const reparsed = parseConcept(serializeConcept(parsed));
  assert.equal(reparsed.some_future_field, "hello");
  assert.deepEqual(reparsed.nested_unknown, { a: 1, b: "two" });
});

test("DGE-only fields serialize ONLY under the namespaced x-dge key, never as native keys", () => {
  const concept = makeConcept({
    type: "Task",
    title: "Node 42",
    ext: { kind: "Task", status: "ready", track: "TRK-x", risk: "medium" }
  });
  const text = serializeConcept(concept);
  // The extension block is present and versioned.
  assert.match(text, new RegExp(`^${DGE_EXTENSION_KEY}:`, "m"));
  assert.match(text, new RegExp(`version: "${DGE_EXTENSION_VERSION}"`));
  // DGE-only fields must NOT appear as top-level native frontmatter keys. In
  // particular `status` is a NATIVE OKF field (§5.4); a DGE status must not leak
  // to the top level where it would collide.
  assert.doesNotMatch(text, /^status:/m, "DGE status must not appear as a native top-level key");
  assert.doesNotMatch(text, /^track:/m);
  assert.doesNotMatch(text, /^risk:/m);
  assert.doesNotMatch(text, /^kind:/m);
  // …and they ARE reachable under the extension after a round trip.
  const parsed = parseConcept(text);
  assert.equal(parsed[DGE_EXTENSION_KEY].kind, "Task");
  assert.equal(parsed[DGE_EXTENSION_KEY].status, "ready");
  assert.equal(parsed[DGE_EXTENSION_KEY].version, DGE_EXTENSION_VERSION);
});

test("a native OKF status and a DGE status coexist without collision", () => {
  const concept = makeConcept({
    type: "Task",
    status: "stable", // native OKF lifecycle (§5.4)
    ext: { status: "ready" } // DGE node status
  });
  const parsed = parseConcept(serializeConcept(concept));
  assert.equal(parsed.status, "stable"); // native preserved
  assert.equal(parsed[DGE_EXTENSION_KEY].status, "ready"); // dge preserved separately
});

test("splitFrontmatter rejects a missing or unclosed block", () => {
  assert.throws(() => splitFrontmatter("no frontmatter here"), /must open with a `---`/);
  assert.throws(() => splitFrontmatter("---\ntype: X\nno close"), /not closed/);
});

test("OKF_VERSION is pinned to 0.2", () => {
  assert.equal(OKF_VERSION, "0.2");
});
