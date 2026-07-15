import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../bin/dge.mjs", import.meta.url));

test("design mutations create and refresh one stable viewer link", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dge-viewer-cli-"));
  const graphPath = path.join(root, "delivery-graph", "graph.json");
  const viewerPath = path.join(root, "delivery-graph", "view", "index.html");

  const init = run(root, "init", "--graph", graphPath, "--title", "Viewer graph");
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /viewer\s+delivery-graph\/view\/index\.html/);
  assert.ok(fs.existsSync(viewerPath));

  const demand = run(root, "add-demand", "--graph", graphPath, "--title", "Demand one", "--source", "test", "--outcome", "Visible");
  assert.equal(demand.status, 0, demand.stderr);
  assert.match(demand.stdout, /viewer\s+delivery-graph\/view\/index\.html/);
  assert.match(fs.readFileSync(viewerPath, "utf8"), /Demand one/);

  const second = run(root, "add-demand", "--graph", graphPath, "--title", "Demand two", "--source", "test", "--outcome", "Also visible");
  assert.equal(second.status, 0, second.stderr);
  assert.equal([...fs.readFileSync(viewerPath, "utf8").matchAll(/class="demand"/g)].length, 2);
  assert.equal(fs.readdirSync(path.dirname(viewerPath)).filter((name) => name.endsWith(".html")).length, 1);
});

function run(cwd, ...args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}
