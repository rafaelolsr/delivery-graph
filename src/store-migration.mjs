import fs from "node:fs";
import path from "node:path";
import { resolveRuntimePath } from "./path-utils.mjs";
import { assertValidGraph, demandEvidencePath, nodeDemandId } from "./graph-engine.mjs";

// Migrate a flat type-centric store to the demand-centric layout:
//   demands/DEM-###.md            -> demands/DEM-###/DEM-###.md
//   requirements/REQ-###.md       -> demands/<demand>/requirements/REQ-###.md
//   evidence/NODE-###/            -> demands/<demand>/evidence/NODE-###/
// and rewrite every node.validation.evidence_path to the demand-scoped path.
//
// Returns { graph, moves, removedDirs } describing what changed. The returned graph
// is validated against the demand-centric schema before it is handed back.
export function migrateStore(graph, graphPath) {
  const moves = [];
  const runtime = (relative) => resolveRuntimePath(graphPath, `delivery-graph/${relative}`);

  const move = (fromRel, toRel) => {
    const from = runtime(fromRel);
    const to = runtime(toRel);
    if (!fs.existsSync(from)) return; // already migrated or never existed
    if (fs.existsSync(to)) {
      throw new Error(`migration target already exists: delivery-graph/${toRel}`);
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    moves.push({ from: `delivery-graph/${fromRel}`, to: `delivery-graph/${toRel}` });
  };

  // Demand markdown into its own folder.
  for (const demand of graph.demands ?? []) {
    move(`demands/${demand.id}.md`, `demands/${demand.id}/${demand.id}.md`);
  }

  // Requirement markdown under its owning demand.
  for (const requirement of graph.requirements ?? []) {
    move(
      `requirements/${requirement.id}.md`,
      `demands/${requirement.demand_id}/requirements/${requirement.id}.md`
    );
  }

  // Evidence directories under the node's owning demand; rewrite evidence_path.
  const nodes = (graph.nodes ?? []).map((node) => {
    const demandId = nodeDemandId(graph, node);
    if (!demandId) return node; // no owning demand to scope under; leave untouched
    move(`evidence/${node.id}/`, `demands/${demandId}/evidence/${node.id}/`);
    const evidencePath = demandEvidencePath(demandId, node.id);
    if (node.validation?.evidence_path === evidencePath) return node;
    return { ...node, validation: { ...node.validation, evidence_path: evidencePath } };
  });

  const nextGraph = { ...graph, nodes };

  // Remove the now-empty flat directories so no orphaned layout remains.
  const removedDirs = [];
  for (const dir of ["requirements", "evidence"]) {
    const abs = runtime(dir);
    if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) {
      fs.rmdirSync(abs);
      removedDirs.push(`delivery-graph/${dir}`);
    }
  }

  assertValidGraph(nextGraph);
  return { graph: nextGraph, moves, removedDirs };
}
