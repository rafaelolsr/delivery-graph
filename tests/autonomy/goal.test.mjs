import assert from "node:assert/strict";
import test from "node:test";
import { makeGoal, makeSubgoal, decomposeGoal, discoverCapabilities } from "../../src/autonomy/goal.mjs";

test("a goal requires an id and a statement", () => {
  assert.throws(() => makeGoal({ statement: "x" }), /id/);
  assert.throws(() => makeGoal({ id: "G", statement: "" }), /statement/);
  assert.doesNotThrow(() => makeGoal({ id: "G", statement: "reduce cost" }));
});

test("a bare cost goal decomposes into investigate → analyze → implement → prove", () => {
  const goal = makeGoal({ id: "G", statement: "Reduce cloud infrastructure cost by 20% without degrading reliability" });
  const subgoals = decomposeGoal(goal);
  const ids = subgoals.map((s) => s.id);
  assert.deepEqual(ids, ["SG-investigate", "SG-analyze", "SG-implement", "SG-prove"]);
  // Always ends with an independent-proof subgoal — the org cannot self-certify.
  assert.deepEqual(subgoals.at(-1).requiredCapabilities, ["verification"]);
  assert.deepEqual(subgoals.at(-1).evidence, ["independent_verification"]);
});

test("decomposition rejects a dangling or self dependency", () => {
  const bad = () => decomposeGoal({ id: "G", statement: "x" }, { decomposer: () => [makeSubgoal({ id: "A", dependsOn: ["ZZ"] })] });
  assert.throws(bad, /missing subgoal/);
  const selfdep = () => decomposeGoal({ id: "G", statement: "x" }, { decomposer: () => [makeSubgoal({ id: "A", dependsOn: ["A"] })] });
  assert.throws(selfdep, /depends on itself/);
});

test("an injected decomposer is used (deterministic, no live model)", () => {
  const subgoals = decomposeGoal({ id: "G", statement: "x" }, {
    decomposer: () => [makeSubgoal({ id: "ONE", statement: "only", requiredCapabilities: ["code_change"] })]
  });
  assert.deepEqual(subgoals.map((s) => s.id), ["ONE"]);
});

test("capability discovery matches required capabilities against an explicit registry", () => {
  const goal = makeGoal({ id: "G", statement: "Reduce cloud cost by 20%" });
  const subgoals = decomposeGoal(goal);
  const registry = [
    { id: "researcher", capabilities: ["research"] },
    { id: "analyst", capabilities: ["data_analysis"] },
    { id: "coder", capabilities: ["code_change"] },
    { id: "verifier", capabilities: ["verification"] }
  ];
  const disco = discoverCapabilities(subgoals, registry);
  assert.equal(disco.satisfiable, true);
  assert.deepEqual(disco.gaps, []);
  assert.ok(disco.available.find((a) => a.capability === "code_change").providers.includes("coder"));
});

test("a missing capability is surfaced as a GAP, never silently dropped", () => {
  const goal = makeGoal({ id: "G", statement: "Reduce cloud cost by 20%" });
  const subgoals = decomposeGoal(goal);
  // registry lacks a verifier → verification is a gap → not satisfiable
  const registry = [
    { id: "researcher", capabilities: ["research"] },
    { id: "analyst", capabilities: ["data_analysis"] },
    { id: "coder", capabilities: ["code_change"] }
  ];
  const disco = discoverCapabilities(subgoals, registry);
  assert.equal(disco.satisfiable, false);
  assert.ok(disco.gaps.includes("verification"));
});

test("no registry means everything is a gap (honest, not a crash)", () => {
  const subgoals = decomposeGoal(makeGoal({ id: "G", statement: "do a thing" }));
  const disco = discoverCapabilities(subgoals, []);
  assert.equal(disco.satisfiable, false);
  assert.ok(disco.gaps.length > 0);
});
