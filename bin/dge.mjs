#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveRuntimePath } from "../src/path-utils.mjs";
import {
  ConcurrentModificationError,
  getNextReadyNode,
  isNodeComplete,
  nodeDemandId,
  readGraph,
  readGraphRev,
  summarizeGraph,
  transitionNode,
  validateGraph,
  withStoreLock,
  writeGraph
} from "../src/graph-engine.mjs";
import {
  defaultStatusPath,
  renderStatus,
  writeStatusReport
} from "../src/status-renderer.mjs";
import {
  addCommandEvidence,
  addEvidence,
  getAllEvidenceStatuses,
  getEvidenceStatus,
  findNode,
  removeEvidence,
  verifyNode,
  waiveNode,
  writeCommandAttemptArtifact
} from "../src/evidence-engine.mjs";
import {
  defaultReviewPath,
  reviewGraph,
  writeReviewReport
} from "../src/review-engine.mjs";
import { regenerateArtifacts, writeRecordArtifact } from "../src/markdown-artifacts.mjs";
import { glyph, relativePath, renderNextSteps } from "../src/output.mjs";
import {
  createLinearSyncPlan,
  defaultLinearSyncPath
} from "../src/adapters/linear.mjs";
import {
  createAdoSyncPlan,
  defaultAdoSyncPath
} from "../src/adapters/ado.mjs";
import {
  addDemand,
  addGap,
  addNode,
  addRequirement,
  addTrack,
  createGraph,
  editDemand,
  editRequirement,
  removeDemand,
  removeNode,
  removeRequirement,
  resolveGap,
  setNodeValidation
} from "../src/graph-authoring.mjs";
import { installSkills } from "../src/skill-installer.mjs";
import { migrateStore } from "../src/store-migration.mjs";
import { graphToBundle, writeBundle, OKF_BUNDLE_SUBDIR } from "../src/okf-bundle.mjs";
import { planGovernance } from "../src/governance/govern-cli.mjs";
import { orchestrateGoal } from "../src/autonomy/orchestrate.mjs";
import { roundTrip, diffGraphs } from "../src/okf-compat.mjs";
import { validateBundle } from "../src/okf-conformance.mjs";
import { sealContract } from "../src/seal.mjs";
import { buildDemandView, renderDemandView } from "../src/show-renderer.mjs";
import { buildGraphBrief, renderGraphBrief } from "../src/brief-renderer.mjs";
import { findLearnings } from "../src/learnings-engine.mjs";
import { planIndependentVerification } from "../src/agentic-verification.mjs";
import { writeViewer } from "../src/viewer-renderer.mjs";

const DEFAULT_GRAPH_PATH = "delivery-graph/graph.json";

// Bounded retries for the optimistic-concurrency mutation loop before failing loud.
const MUTATION_RETRY_LIMIT = 10;

// DEM-020 Track 1 / NODE-081: the phrase a human types to confirm a seal in a
// non-interactive context. A `dge-*` skill is forbidden to pass it, so an
// autonomous run cannot seal. Declared at module top so it is initialized before
// main() dispatches (a const is not hoisted like a function).
const SEAL_CONFIRM_PHRASE = "i-approve-this-contract";

main();

function main() {
  const [command, ...rawArgs] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  try {
    const args = parseArgs(rawArgs);
    const graphPath = args.graph ?? DEFAULT_GRAPH_PATH;

    switch (command) {
      case "init":
        runInit(graphPath, args);
        break;
      case "preflight":
        runPreflight(graphPath, args);
        break;
      case "validate":
        runValidate(graphPath);
        break;
      case "migrate":
        runMigrate(graphPath, args);
        break;
      case "okf":
        runOkf(graphPath, args);
        break;
      case "govern":
        runGovern(graphPath, args);
        break;
      case "orchestrate":
        runOrchestrate(args);
        break;
      case "regenerate":
        runRegenerate(graphPath, args);
        break;
      case "show":
        runShow(graphPath, args);
        break;
      case "brief":
        runBrief(graphPath, args);
        break;
      case "status":
        runStatus(graphPath, args);
        break;
      case "next":
        runNext(graphPath, args);
        break;
      case "transition":
        runTransition(graphPath, args);
        break;
      case "evidence":
        runEvidence(graphPath, args);
        break;
      case "verify":
        runVerify(graphPath, args);
        break;
      case "verification-plan":
        runVerificationPlan(graphPath, args);
        break;
      case "done":
        runDone(graphPath, args);
        break;
      case "review":
        runReview(graphPath, args);
        break;
      case "sync":
        runSync(graphPath, args);
        break;
      case "add-demand":
        runMutation(graphPath, (graph) => addDemand(graph, mapDemandArgs(args)), args);
        break;
      case "add-requirement":
        runMutation(graphPath, (graph) => addRequirement(graph, mapRequirementArgs(args)), args);
        break;
      case "add-gap":
        runMutation(graphPath, (graph) => addGap(graph, mapGapArgs(args)), args);
        break;
      case "resolve-gap":
        runMutation(graphPath, (graph) => resolveGap(graph, args._[0] ?? args.id, args.resolution), args);
        break;
      case "add-track":
        runMutation(graphPath, (graph) => addTrack(graph, mapTrackArgs(args)), args);
        break;
      case "add-node":
        runMutation(graphPath, (graph) => addNode(graph, mapNodeArgs(args)), args);
        break;
      case "remove-node":
        runMutation(graphPath, (graph) => removeNode(graph, args._[0] ?? args.id), args);
        break;
      case "remove-requirement":
        runMutation(graphPath, (graph) => removeRequirement(graph, args._[0] ?? args.id), args);
        break;
      case "edit-requirement":
        runMutation(graphPath, (graph) => editRequirement(graph, args._[0] ?? args.id, mapRequirementArgs(args)), args);
        break;
      case "edit-demand":
        runMutation(graphPath, (graph) => editDemand(graph, args._[0] ?? args.id, mapDemandArgs(args)), args);
        break;
      case "remove-demand":
        runRemoveDemand(graphPath, args);
        break;
      case "set-validation":
        runMutation(graphPath, (graph) => setNodeValidation(graph, args._[0] ?? args.id, args.validation), args);
        break;
      case "seal-contract":
        runSealContract(graphPath, args);
        break;
      case "install-skills":
        runInstallSkills(args);
        break;
      case "learnings":
        runLearnings(graphPath, args);
        break;
      default:
        throw new Error(`Unknown command: ${command}\nRun \`dge help\` for available commands.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function runInit(graphPath, args) {
  if (fs.existsSync(graphPath) && !args.force) {
    throw new Error(`${graphPath} already exists. Pass --force to overwrite.`);
  }

  const graph = createGraph({
    id: args.id,
    title: args.title,
    source: args.source
  });
  writeGraph(graphPath, graph);
  const viewerPath = writeViewer(graphPath, graph);
  printRecord("graph", graph.graph, args);
  printViewerLink(viewerPath, graphPath, args);
}

function runInstallSkills(args) {
  const result = installSkills({
    harness: typeof args.harness === "string" ? args.harness : undefined,
    symlink: Boolean(args.symlink),
    force: Boolean(args.force)
  });

  console.log(`Installed DGE skills for ${result.harness} (${result.mode}) -> ${result.skillsDir}`);
  if (result.installed.length > 0) {
    console.log(`installed: ${result.installed.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    console.log(`skipped (already present, pass --force to overwrite): ${result.skipped.join(", ")}`);
  }
  if (result.installed.length === 0 && result.skipped.length === 0) {
    console.log("no dge-* skills found to install");
  }
}

function runValidate(graphPath) {
  const graph = readGraph(graphPath);
  const errors = validateGraph(graph);
  if (errors.length > 0) {
    throw new Error(`Delivery graph validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
  console.log(`Delivery graph valid: ${graph.graph.id} - ${graph.graph.title}`);
}

// The shared skill preamble, factored to one callable place (DEM-008 / NODE-026).
// Every dge-* skill and the /dge-deliver conductor run `dge preflight` instead of
// restating the CLI check + writer guardrail. Reaching this code proves the CLI is
// installed and on PATH; it then confirms the graph is present and valid (unless
// --no-graph, for design before `dge init`) and prints the "CLI is the only writer"
// reminder. Non-zero exit on a missing/invalid graph is the stop signal skills gate on.
function runPreflight(graphPath, args = {}) {
  const lines = ["dge CLI: reachable"];

  if (args["no-graph"]) {
    lines.push("graph: not required (pre-init)");
  } else {
    const graph = readGraph(graphPath); // throws (non-zero exit) if unreadable
    const errors = validateGraph(graph);
    if (errors.length > 0) {
      throw new Error(`Delivery graph invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    }
    lines.push(`graph: ${graph.graph.id} valid`);
  }

  lines.push("reminder: the dge CLI is the ONLY writer of delivery-graph/graph.json — never hand-edit it.");

  if (args.json) {
    console.log(JSON.stringify({ ok: true, cli: "reachable", graph_required: !args["no-graph"] }, null, 2));
    return;
  }
  console.log(lines.join("\n"));
}

// Relocate a flat store into the demand-centric layout. readGraph does not validate,
// so this works on a store whose evidence_paths are still flat (the pre-migration state).
function runMigrate(graphPath, args = {}) {
  const graph = readGraph(graphPath);
  const { graph: migrated, moves, removedDirs } = migrateStore(graph, graphPath);
  writeGraph(graphPath, migrated);
  writeViewer(graphPath, migrated);

  if (args.json) {
    console.log(JSON.stringify({ moves, removedDirs }, null, 2));
    return;
  }
  console.log(`${glyph("reports", args)} migrated store to demand-centric layout`);
  console.log(`   ${moves.length} paths relocated, ${removedDirs.length} empty dirs removed`);
}

// OKF bundle projection (DEM-021). Two subcommands, both leaving graph.json untouched:
//   dge okf preview [--json]  -> read-only: render a semantic diff + conformance, WRITE NOTHING
//   dge okf write --confirm    -> explicit: emit the bundle under delivery-graph/okf/
// The preview never writes, and the write requires --confirm, so there is no silent
// migration (ADR-001 D4). Neither path ever writes back to graph.json.
function runOkf(graphPath, args = {}) {
  const sub = args._[0];
  const graph = readGraph(graphPath);

  if (sub === "preview" || sub === undefined) {
    // Semantic diff: prove the projection loses nothing over the bundle's fields.
    const diffs = diffGraphs(graph, roundTrip(graph));
    const bundle = graphToBundle(graph);
    const conformance = validateBundle(bundle);
    const summary = {
      action: "preview",
      wrote: false,
      bundle_subdir: OKF_BUNDLE_SUBDIR,
      files: Object.keys(bundle).length,
      round_trip_lossless: diffs.length === 0,
      semantic_diff: diffs,
      conformant: conformance.conformant,
      conformance_errors: conformance.errors
    };
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(`${glyph("reports", args)} OKF bundle preview (nothing written)`);
    console.log(`   ${summary.files} concept files would be emitted under ${OKF_BUNDLE_SUBDIR}/`);
    console.log(`   round-trip lossless: ${summary.round_trip_lossless ? "yes" : "NO"}`);
    if (diffs.length) diffs.slice(0, 10).forEach((d) => console.log(`     - ${d}`));
    console.log(`   OKF v0.2 conformant: ${summary.conformant ? "yes" : "NO"}`);
    if (!conformance.conformant) {
      conformance.errors.slice(0, 10).forEach((e) => console.log(`     - ${e.file}: ${e.message} (${e.rule})`));
    }
    console.log(`   to write it: dge okf write --confirm`);
    return;
  }

  if (sub === "write") {
    if (!args.confirm) {
      throw new Error("Refusing to write the OKF bundle without --confirm. Run `dge okf preview` first, then `dge okf write --confirm`.");
    }
    const written = writeBundle(graphPath, graph);
    if (args.json) {
      console.log(JSON.stringify({ action: "write", wrote: true, files: written.map((p) => relativePath(p, graphPath)) }, null, 2));
      return;
    }
    console.log(`${glyph("reports", args)} wrote ${written.length} OKF concept files under ${OKF_BUNDLE_SUBDIR}/`);
    return;
  }

  throw new Error(`Unknown okf subcommand "${sub}". Use: dge okf preview | dge okf write --confirm`);
}

// Run the adaptive governor over the ready nodes and show what it WOULD allocate, with
// a governance report. This is the live wiring of the governance engine into the CLI.
// It is READ-ONLY: allocation is a planning decision, so it never mutates graph.json
// (applying a mutation stays behind the mutation gate + explicit write). Candidates and
// policy come from an explicitly-configured governance config (never a home-dir default).
function runGovern(graphPath, args = {}) {
  const graph = readGraph(graphPath);
  const demandId = args.demand ?? args._[0] ?? null;
  const config = loadGovernConfig(args.config);
  const { allocations, report, readyCount, candidateCount } = planGovernance(graph, config, { demandId });

  if (args.json) {
    console.log(JSON.stringify({ demand: demandId, readyCount, candidateCount, allocations, report }, null, 2));
    return;
  }

  console.log(`${glyph("reports", args)} Governor plan${demandId ? ` for ${demandId}` : ""} — ${readyCount} ready node(s), ${candidateCount} candidate(s)`);
  if (candidateCount === 0) {
    console.log("   no candidates configured — pass --config <path> with a governance config (candidates, policy).");
    console.log("   cold start: allocation cannot select without candidates. This is honest, not a failure.");
  }
  for (const a of allocations) {
    const mark = a.gate.verdict === "PASS" ? glyph("done", args) : glyph("blocked", args);
    console.log(`   ${mark} ${a.node_id} → ${a.selected ?? "(none eligible)"} [${a.risk}] — ${a.rationale ?? a.reason}`);
    if (a.gate.verdict !== "PASS") console.log(`      gate ${a.gate.verdict}: ${a.gate.explanation}`);
  }
  console.log("");
  console.log("Run `dge govern --json` for the full governance report (allocations, expectations, gates).");
}

// Stage 6 — autonomous orchestration. From a BARE GOAL, the system constructs its own
// agent organization and self-reorganizes through the governance gates. Deterministic +
// offline: the executor is a config-driven quality map (a fake), never a live agent.
//   dge orchestrate "reduce cloud cost by 20%" --config <registry+candidates+quality.json>
function runOrchestrate(args = {}) {
  const statement = args._[0] ?? args.goal;
  if (!statement) throw new Error('Usage: dge orchestrate "<goal statement>" --config <path> [--json]');
  const config = loadGovernConfig(args.config);
  const registry = config.registry ?? [];
  const candidates = config.candidates ?? [];
  const strongerCandidates = config.strongerCandidates ?? candidates;

  // A deterministic sim executor from the config's quality map: quality[role] (with an
  // optional quality[role + "-v2"] to model a stronger replacement). Defaults to healthy.
  const quality = config.quality ?? {};
  const executor = (agent) => {
    const key = agent.id.endsWith("-v2") ? `${agent.role}-v2` : agent.role;
    const q = quality[key] ?? quality[agent.role] ?? 0.9;
    return { quality: q, evidence: `${agent.id}:sim` };
  };

  const result = orchestrateGoal({
    goal: { id: config.goalId ?? "GOAL", statement, successCriteria: config.successCriteria ?? [], constraints: config.constraints ?? [], riskTolerance: config.riskTolerance ?? "medium" },
    registry, candidates, strongerCandidates, executor,
    maxRounds: config.maxRounds ?? 3, threshold: config.threshold ?? 0.5, at: config.at ?? null
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`${glyph("reports", args)} Autonomous orchestration — goal: ${statement}`);
  if (!result.organization) {
    console.log(`   ${glyph("blocked", args)} ${result.reason}`);
    return;
  }
  console.log(`   subgoals: ${result.subgoals.map((s) => s.id).join(" → ")}`);
  console.log(`   constructed org: ${result.organization.agentCount} agents — ${result.organization.agents.map((a) => `${a.role}:${a.model ?? "?"}`).join(", ")}`);
  console.log(`   topology: ${result.organization.topology.join(", ")}`);
  for (const l of result.ledger) {
    if (l.action === "reorganized") console.log(`   ${glyph("done", args)} reorganized: replaced ${l.replaced} → ${l.with} (benefit +${l.observedBenefit.toFixed(2)})`);
    else if (l.action === "rolled_back") console.log(`   ${glyph("blocked", args)} rolled back a reorg of ${l.agent} (no benefit)`);
    else if (l.action === "escalated") console.log(`   ${glyph("blocked", args)} escalated to human: ${l.worst ?? l.proposalId}`);
  }
  console.log(`   ${result.goalMet ? glyph("done", args) : glyph("blocked", args)} goal ${result.goalMet ? "MET" : "NOT met"} after ${result.rounds} round(s)`);
  console.log("");
  console.log("Run with --json for the full org, ledger, and governance report.");
}

// Load a governance config from an EXPLICIT path only (honors the no-home-dir rule).
// Returns {} when no path is given, so the governor runs in honest cold-start mode.
function loadGovernConfig(configPath) {
  if (!configPath) return {};
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) throw new Error(`governance config not found: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

// Re-emit all demand/requirement markdown from graph.json. Proves the folder tree is
// a derived projection: after `rm`-ing the tree, regenerate reproduces it byte-for-byte.
function runRegenerate(graphPath, args = {}) {
  const graph = readGraph(graphPath);
  const written = regenerateArtifacts(graphPath, graph);
  writeViewer(graphPath, graph);
  if (args.json) {
    console.log(JSON.stringify({ written: written.map((p) => relativePath(p, graphPath)) }, null, 2));
    return;
  }
  console.log(`${glyph("reports", args)} regenerated ${written.length} markdown artifacts from graph.json`);
}

// Retire a demand: purge its records from graph.json (with the cross-demand guard),
// then delete its scoped folder. The graph mutation runs and validates FIRST, so a
// rejected removal never deletes files.
function runRemoveDemand(graphPath, args = {}) {
  const demandId = args._[0] ?? args.id;
  if (!demandId) {
    throw new Error("Usage: dge remove-demand DEM-### [--graph path]");
  }
  const { graph, record } = removeDemand(readGraph(graphPath), demandId);
  writeGraph(graphPath, graph);
  writeViewer(graphPath, graph);

  const folder = resolveRuntimePath(graphPath, `delivery-graph/demands/${demandId}`);
  let folderRemoved = false;
  if (fs.existsSync(folder)) {
    fs.rmSync(folder, { recursive: true, force: true });
    folderRemoved = true;
  }

  if (args.json) {
    console.log(JSON.stringify({ removed: record.id, folderRemoved }, null, 2));
    return;
  }
  console.log(`${glyph("removed", args)} ${record.id}  ${record.title}`);
  console.log(`   purged from graph.json${folderRemoved ? ` and deleted demands/${demandId}/` : ""}`);
}

// Render everything a demand generated (requirements + serving nodes + evidence),
// derived from graph.json. The demand id is how a demand folder maps to its graph view.
function runShow(graphPath, args = {}) {
  const demandId = args._[0] ?? args.demand;
  if (!demandId) {
    throw new Error("Usage: dge show DEM-### [--graph path] [--json]");
  }
  const graph = readGraph(graphPath);
  const view = buildDemandView(graphPath, graph, demandId);
  if (args.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(renderDemandView(view, args));
}

// The two judgment-gate artifacts of the intent-driven flow, both derived from
// graph.json (never a separate log). `brief demand DEM-###` is gate #1 (reuses
// the demand view); `brief graph [DEM-###] [--mermaid]` is gate #2 (DAG + table).
function runBrief(graphPath, args = {}) {
  const kind = args._[0];
  const graph = readGraph(graphPath);

  if (kind === "demand") {
    const demandId = args._[1] ?? args.demand;
    if (!demandId) throw new Error("Usage: dge brief demand DEM-### [--json]");
    const view = buildDemandView(graphPath, graph, demandId);
    console.log(args.json ? JSON.stringify(view, null, 2) : renderDemandView(view, args));
    return;
  }

  if (kind === "graph") {
    // Optional demand scope: `dge brief graph DEM-###` scopes to one demand.
    const demandId = args._[1] ?? args.demand ?? null;
    const brief = buildGraphBrief(graphPath, graph, demandId);
    console.log(args.json ? JSON.stringify(brief, null, 2) : renderGraphBrief(brief, { mermaid: args.mermaid }));
    return;
  }

  throw new Error("Usage: dge brief demand DEM-### | dge brief graph [DEM-###] [--mermaid] [--json]");
}

// The READ side of the compound loop. dge-design/dge-plan-graph call this to
// surface relevant prior learnings before scoping new work, so the toolset
// compounds across demands. Terms come from positional args and/or --about.
function runLearnings(graphPath, args = {}) {
  const terms = [...(args._ ?? []), ...toList(args.about)].filter(Boolean);
  const learnings = findLearnings(graphPath, terms);

  if (args.json) {
    const withRelativePaths = learnings.map((learning) => ({
      ...learning,
      path: relativePath(learning.path, graphPath)
    }));
    console.log(JSON.stringify({ count: learnings.length, terms, learnings: withRelativePaths }, null, 2));
    return;
  }

  const g = (name) => glyph(name, args);
  if (learnings.length === 0) {
    const scope = terms.length > 0 ? ` matching ${terms.join(", ")}` : "";
    console.log(`No prior learnings${scope}. (Capture new ones with /dge-compound.)`);
    return;
  }

  const scope = terms.length > 0 ? ` (matching ${terms.join(", ")})` : "";
  console.log(`${g("requirements")} ${learnings.length} learning${learnings.length === 1 ? "" : "s"}${scope}`);
  for (const learning of learnings) {
    const tagHint = learning.tags.length > 0 ? `  [${learning.tags.join(", ")}]` : "";
    console.log(`\n• ${learning.title}${tagHint}`);
    console.log(`  ${learning.slug}.md`);
    if (learning.applies_when) {
      console.log(`  applies when: ${firstLine(learning.applies_when)}`);
    }
    if (learning.related.length > 0) {
      console.log(`  related: ${learning.related.join(", ")}`);
    }
  }
}

function toList(value) {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function firstLine(text) {
  return String(text).split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

function runStatus(graphPath, args = {}) {
  const graph = readGraph(graphPath);
  const demandId = args.demand ?? null;
  const shouldWriteReport = args.out !== undefined || args.save;
  const generatedAt = shouldWriteReport ? new Date() : null;
  const evidenceStatuses = getAllEvidenceStatuses(graphPath, graph).filter(
    (status) => !demandId || nodeDemandId(graph, findNode(graph, status.node_id)) === demandId
  );
  const markdown = renderStatus(graph, {
    ...args,
    demandId,
    evidenceStatuses,
    generatedAt: generatedAt?.toISOString()
  });
  process.stdout.write(markdown);

  if (shouldWriteReport) {
    if (args.out !== undefined && typeof args.out !== "string") {
      throw new Error("Missing value for --out");
    }
    const outputPath = typeof args.out === "string" ? args.out : defaultStatusPath(graphPath, generatedAt);
    writeStatusReport(outputPath, markdown);
    console.log(`status report: ${outputPath}`);
  }
}

function runNext(graphPath, args = {}) {
  const graph = readGraph(graphPath);
  const summary = summarizeGraph(graph);
  const next = getNextReadyNode(graph);
  const doneCount = (summary.statuses.get("done") ?? []).length;
  const result = {
    next: next ? { id: next.id, title: next.title, track: next.track, type: next.type } : null,
    ready_count: summary.readyNodes.length,
    done_count: doneCount,
    remaining_count: graph.nodes.length - doneCount,
    blocker_gap_count: summary.blockerGaps.length
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (next) {
    console.log(`next: ${next.id} ${next.title}`);
  } else if (result.remaining_count > 0) {
    console.log("next: none (remaining nodes are blocked or waiting on dependencies)");
  } else {
    console.log("next: none (all nodes done)");
  }
  console.log(`ready: ${result.ready_count} | done: ${result.done_count}/${graph.nodes.length} | blocker gaps: ${result.blocker_gap_count}`);
}

function runTransition(graphPath, args) {
  const [nodeId, nextStatus] = args._;
  if (!nodeId || !nextStatus) {
    throw new Error("Usage: dge transition NODE-### <status> [--graph path]");
  }

  const graph = readGraph(graphPath);
  if (["verified", "done"].includes(nextStatus)) {
    const evidenceStatus = getEvidenceStatus(graphPath, graph, findNode(graph, nodeId));
    if (!evidenceStatus.complete) {
      throw new Error(`${nodeId} is missing validation evidence: ${evidenceStatus.missing.join(", ")}`);
    }
  }

  const nextGraph = transitionNode(graph, nodeId, nextStatus);
  writeGraph(graphPath, nextGraph);
  writeViewer(graphPath, nextGraph);
  console.log(`${nodeId} -> ${nextStatus}`);
}

function runEvidence(graphPath, args) {
  const [subcommand, nodeId, thirdArg] = args._;
  if (!nodeId || !["add", "run", "playwright", "remove"].includes(subcommand)) {
    throw new Error("Usage: dge evidence add NODE-### --satisfies \"...\" --summary \"...\" [--result pass|fail|ambiguous] [--kind command] [--artifact path]\n       dge evidence run NODE-### --satisfies \"...\" [--summary \"...\"] -- <command>\n       dge evidence playwright NODE-### --satisfies \"...\" [--url URL] [--script test.spec.ts] [--artifacts test-results] -- <command>\n       dge evidence remove NODE-### EVD-###");
  }

  const graph = readGraph(graphPath);

  if (subcommand === "remove") {
    if (!thirdArg) {
      throw new Error("Usage: dge evidence remove NODE-### EVD-###");
    }
    const { record } = removeEvidence(graphPath, graph, nodeId, thirdArg);
    writeViewer(graphPath, graph);
    console.log(`removed evidence ${record.id} from ${nodeId} (satisfied: ${record.satisfies})`);
    return;
  }

  const { record } = runEvidenceSubcommand(graphPath, graph, nodeId, subcommand, args);
  writeViewer(graphPath, graph);
  printRecord("evidence", record, args);
}

function runEvidenceSubcommand(graphPath, graph, nodeId, subcommand, args) {
  if (subcommand === "add") {
    return addEvidence(graphPath, graph, nodeId, {
      kind: args.kind,
      summary: args.summary,
      satisfies: args.satisfies,
      result: args.result,
      artifact: args.artifact
    });
  }
  if (subcommand === "playwright") {
    return runPlaywrightEvidence(graphPath, graph, nodeId, args);
  }
  return runCommandEvidence(graphPath, graph, nodeId, args);
}

function runCommandEvidence(graphPath, graph, nodeId, args) {
  return runCapturedEvidence(graphPath, graph, nodeId, {
    kind: "command",
    command: args.command,
    satisfies: args.satisfies,
    summary: args.summary
  });
}

function runPlaywrightEvidence(graphPath, graph, nodeId, args) {
  return runCapturedEvidence(graphPath, graph, nodeId, {
    kind: "playwright",
    command: buildPlaywrightCommand(args),
    satisfies: args.satisfies,
    summary: args.summary,
    artifacts: args.artifacts ?? args.artifact,
    metadata: removeUndefined({
      url: args.url,
      script: args.script
    }),
    env: removeUndefined({
      DGE_EVIDENCE_URL: args.url,
      DGE_EVIDENCE_SCRIPT: args.script
    })
  });
}

function runCapturedEvidence(graphPath, graph, nodeId, input) {
  if (!Array.isArray(input.command) || input.command.length === 0) {
    throw new Error("Usage: dge evidence run NODE-### --satisfies \"...\" [--summary \"...\"] -- <command>");
  }

  const result = spawnSync(input.command[0], input.command.slice(1), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(input.env ?? {})
    },
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.error) {
    throw new Error(`Command failed to start: ${result.error.message}`);
  }

  const exitCode = result.status ?? 1;
  if (exitCode !== 0) {
    const { artifactPath } = writeCommandAttemptArtifact(graphPath, graph, nodeId, {
      kind: input.kind,
      satisfies: input.satisfies,
      command: input.command,
      exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      metadata: input.metadata,
      artifacts: input.artifacts
    });
    throw new Error(`Command failed with exit code ${exitCode}; output artifact: ${relativePath(artifactPath, graphPath)}`);
  }

  return addCommandEvidence(graphPath, graph, nodeId, {
    kind: input.kind,
    satisfies: input.satisfies,
    summary: input.summary,
    command: input.command,
    exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    metadata: input.metadata,
    artifacts: input.artifacts
  });
}

function buildPlaywrightCommand(args) {
  if (Array.isArray(args.command) && args.command.length > 0) return args.command;
  const command = ["npx", "playwright", "test"];
  if (args.script) command.push(args.script);
  return command;
}

function runVerify(graphPath, args) {
  const [nodeId] = args._;
  if (!nodeId) {
    throw new Error("Usage: dge verify NODE-### [--graph path]");
  }

  const { graph, evidenceStatus, verificationPath } = verifyNode(graphPath, readGraph(graphPath), nodeId);
  writeGraph(graphPath, graph);
  writeViewer(graphPath, graph);

  if (args.json) {
    console.log(JSON.stringify({
      node: { id: nodeId, status: "verified" },
      verification_path: relativePath(verificationPath, graphPath),
      evidence: { ...evidenceStatus, manifest_path: relativePath(evidenceStatus.manifest_path, graphPath) }
    }, null, 2));
    return;
  }

  const g = (name) => glyph(name, args);
  const count = evidenceStatus.required.length;
  console.log(`${g("verified")} ${nodeId} verified — evidence ${count}/${count} passed`);
  console.log(`   ${g("reports")} report  ${relativePath(verificationPath, graphPath)}`);
}

function runVerificationPlan(graphPath, args) {
  const [nodeId] = args._;
  const builderRun = args["builder-run"] ?? args.builderRun;
  const builderHarness = args["builder-harness"] ?? args.builderHarness;
  const availableHarnesses = toList(args.harness);
  if (!nodeId || !builderRun || !builderHarness || availableHarnesses.length === 0) {
    throw new Error(
      "Usage: dge verification-plan NODE-### --builder-run RUN-ID --builder-harness HARNESS --harness HARNESS [--harness HARNESS] [--risk standard|high]"
    );
  }

  const node = findNode(readGraph(graphPath), nodeId);
  const policy = args.risk ? { riskByNode: { [nodeId]: args.risk } } : {};
  const plan = planIndependentVerification({
    node,
    builder: { runId: builderRun, harness: builderHarness, model: args["builder-model"] ?? args.builderModel },
    availableHarnesses,
    policy
  });

  if (args.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(`${glyph("verified", args)} ${nodeId} verification plan — ${plan.risk} risk`);
  console.log(`   builder   ${plan.builder.harness} (${plan.builder.run_id})`);
  console.log(`   verifier  ${plan.verifier.harness} (fresh context)`);
  console.log(`   context   ${plan.context_policy}`);
}

function runDone(graphPath, args) {
  const [nodeId] = args._;
  if (!nodeId) {
    throw new Error("Usage: dge done NODE-### [--waive <reason>] [--graph path] [--out review-report.md]");
  }

  if (typeof args.waive === "string") {
    runWaive(graphPath, args, nodeId, args.waive);
    return;
  }

  const graph = readGraph(graphPath);
  const node = findNode(graph, nodeId);
  if (node.status === "done") {
    console.log(`${nodeId} already done`);
    return;
  }
  if (!["ready", "in_progress", "review", "verified"].includes(node.status)) {
    throw new Error(`${nodeId} must be ready, in_progress, review, or verified before it can be done`);
  }

  const incompleteDependencies = node.depends_on.filter((dependencyId) =>
    !isNodeComplete(graph.nodes.find((candidate) => candidate.id === dependencyId))
  );
  if (incompleteDependencies.length > 0) {
    throw new Error(`${nodeId} cannot be done; incomplete dependencies: ${incompleteDependencies.join(", ")}`);
  }

  const evidenceStatus = getEvidenceStatus(graphPath, graph, node);
  if (!evidenceStatus.complete) {
    throw new Error(`${nodeId} is missing validation evidence: ${evidenceStatus.missing.join(", ")}`);
  }

  const generatedAt = new Date();
  const { report, markdown } = reviewGraph(graphPath, graph, { generatedAt: generatedAt.toISOString(), ascii: args.ascii });
  const reviewPath = args.out ?? defaultReviewPath(graphPath, generatedAt);
  writeReviewReport(reviewPath, markdown);
  const blockers = report.findings.filter((finding) => finding.severity === "blocker");
  if (blockers.length > 0) {
    throw new Error(`Review blockers prevent done: ${blockers.map((finding) => finding.message).join("; ")}\nreview report: ${reviewPath}`);
  }

  const verified = node.status === "verified" ? { graph } : verifyNode(graphPath, graph, nodeId);
  const doneGraph = transitionNode(verified.graph, nodeId, "done");
  writeGraph(graphPath, doneGraph);
  writeViewer(graphPath, doneGraph);

  const doneNode = findNode(doneGraph, nodeId);
  const unblocked = newlyUnblockedNodes(doneGraph, nodeId);
  const doneCount = doneGraph.nodes.filter((candidate) => candidate.status === "done").length;
  const readyCount = doneGraph.nodes.filter((candidate) => candidate.status === "ready").length;
  const requiredCount = doneNode.validation.required.length;

  if (args.json) {
    console.log(JSON.stringify({
      node: { id: doneNode.id, title: doneNode.title, status: "done" },
      requirements: doneNode.requirement_ids,
      evidence: { required: requiredCount, satisfied: requiredCount, manifest_path: relativePath(verified.evidenceStatus.manifest_path, graphPath) },
      verification_path: relativePath(verified.verificationPath, graphPath),
      review_path: relativePath(reviewPath, graphPath),
      unblocked,
      progress: { done: doneCount, ready: readyCount, total: doneGraph.nodes.length }
    }, null, 2));
    return;
  }

  const g = (name) => glyph(name, args);
  console.log(`${g("done")} ${nodeId} done — ${doneNode.title}`);
  // Bold TL;DR lead: the node title is the one-line story of what just got proven.
  console.log("");
  console.log(`**${doneNode.title}**`);
  console.log("");
  console.log(`   ${g("requirements")} requirements  ${doneNode.requirement_ids.join(", ") || "-"}`);
  console.log(`   ${g("pass")} evidence      ${requiredCount}/${requiredCount} passed`);
  console.log(`   ${g("unblocked")} unblocked     ${unblocked.length ? unblocked.join(", ") : "none"}`);
  console.log(`   ${g("progress")} progress      ${doneCount}/${doneGraph.nodes.length} done · ${readyCount} ready`);
  console.log(`   ${g("reports")} reports       ${relativePath(verified.verificationPath, graphPath)}`);
  console.log(`                 ${relativePath(reviewPath, graphPath)}`);
  // Always end with the shared Next block: point at what just unblocked, or the
  // ready-queue depth, or a fully-done graph.
  const nextItems = unblocked.length
    ? [`Work ${unblocked.join(", ")} (newly unblocked)`]
    : readyCount > 0
      ? [`${readyCount} node(s) still ready — run dge next`]
      : doneCount === doneGraph.nodes.length
        ? ["All nodes done — run /dge-review"]
        : ["Nothing ready — resolve upstream nodes to unblock the queue"];
  console.log("");
  console.log(renderNextSteps(nextItems, args));
}

// `dge done --waive <reason>` routes here. All enforcement (reason required,
// review-only source, dependencies complete, no existing evidence) lives in
// waiveNode() in the engine, so this raw CLI call is governed identically to
// any other caller — the CLI adds no extra leniency or extra restriction.
function runWaive(graphPath, args, nodeId, reason) {
  const graph = readGraph(graphPath);
  const { graph: waivedGraph } = waiveNode(graphPath, graph, nodeId, { reason });
  writeGraph(graphPath, waivedGraph);
  writeViewer(graphPath, waivedGraph);

  const waivedNode = findNode(waivedGraph, nodeId);
  const unblocked = newlyUnblockedNodes(waivedGraph, nodeId);
  const doneCount = waivedGraph.nodes.filter((candidate) => isNodeComplete(candidate)).length;
  const readyCount = waivedGraph.nodes.filter((candidate) => candidate.status === "ready").length;

  if (args.json) {
    console.log(JSON.stringify({
      node: { id: waivedNode.id, title: waivedNode.title, status: "done-waived" },
      requirements: waivedNode.requirement_ids,
      waiver: waivedNode.waiver,
      unblocked,
      progress: { done: doneCount, ready: readyCount, total: waivedGraph.nodes.length }
    }, null, 2));
    return;
  }

  const g = (name) => glyph(name, args);
  console.log(`${g("done")} ${nodeId} done-waived — ${waivedNode.title}`);
  console.log("");
  console.log(`**${waivedNode.title}**`);
  console.log("");
  console.log(`   ${g("requirements")} requirements  ${waivedNode.requirement_ids.join(", ") || "-"}`);
  console.log(`   reason        ${reason}`);
  console.log(`   ${g("unblocked")} unblocked     ${unblocked.length ? unblocked.join(", ") : "none"}`);
  console.log(`   ${g("progress")} progress      ${doneCount}/${waivedGraph.nodes.length} done · ${readyCount} ready`);
  const nextItems = unblocked.length
    ? [`Work ${unblocked.join(", ")} (newly unblocked)`]
    : readyCount > 0
      ? [`${readyCount} node(s) still ready — run dge next`]
      : doneCount === waivedGraph.nodes.length
        ? ["All nodes done — run /dge-review"]
        : ["Nothing ready — resolve upstream nodes to unblock the queue"];
  console.log("");
  console.log(renderNextSteps(nextItems, args));
}

// Nodes that become ready because this node just completed: they depend on it
// and all their dependencies are now complete (done or done-waived).
function newlyUnblockedNodes(graph, doneNodeId) {
  const completeIds = new Set(graph.nodes.filter((n) => isNodeComplete(n)).map((n) => n.id));
  return graph.nodes
    .filter((n) => n.status === "ready" && n.depends_on.includes(doneNodeId) && n.depends_on.every((d) => completeIds.has(d)))
    .map((n) => n.id);
}

function runReview(graphPath, args) {
  const graph = readGraph(graphPath);
  const generatedAt = new Date();
  const { report, markdown } = reviewGraph(graphPath, graph, { generatedAt: generatedAt.toISOString(), ascii: args.ascii });
  const outputPath = args.out ?? defaultReviewPath(graphPath, generatedAt);
  writeReviewReport(outputPath, markdown);

  if (args.json) {
    console.log(JSON.stringify({ ...report, report_path: relativePath(outputPath, graphPath) }, null, 2));
    return;
  }

  const g = (name) => glyph(name, args);
  const blockers = report.findings.filter((f) => f.severity === "blocker").length;
  const marker = blockers > 0 ? g("blocked") : g("pass");
  console.log(`${marker} review — ${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}${blockers ? ` (${blockers} blocker)` : ""}`);
  console.log(`   ${g("reports")} report  ${relativePath(outputPath, graphPath)}`);
}

function runSync(graphPath, args) {
  const [target] = args._;
  if (target === "linear") {
    runLinearSync(graphPath, args);
    return;
  }
  if (target === "ado") {
    runAdoSync(graphPath, args);
    return;
  }
  throw new Error("Usage: dge sync linear [--graph path] [--out path] [--team-id id] [--project-id id]\n       dge sync ado [--graph path] [--out path] [--org name] [--project name] [--area path] [--iteration path]");
}

function runLinearSync(graphPath, args) {
  const outputPath = args.out ?? defaultLinearSyncPath(graphPath);
  const graph = readGraph(graphPath);
  const existingSync = readOptionalJson(outputPath);
  const syncPlan = createLinearSyncPlan(graph, {
    existingSync,
    teamId: args["team-id"] ?? args.teamId,
    projectId: args["project-id"] ?? args.projectId
  });

  writeSyncPlan(outputPath, syncPlan);
  console.log(`linear sync dry-run: ${syncPlan.operations.length} operation${syncPlan.operations.length === 1 ? "" : "s"} -> ${outputPath}`);
}

function runAdoSync(graphPath, args) {
  const outputPath = args.out ?? defaultAdoSyncPath(graphPath);
  const graph = readGraph(graphPath);
  const existingSync = readOptionalJson(outputPath);
  const syncPlan = createAdoSyncPlan(graph, {
    existingSync,
    organization: args.org ?? args.organization,
    project: args.project,
    areaPath: args.area ?? args.areaPath,
    iterationPath: args.iteration ?? args.iterationPath
  });

  writeSyncPlan(outputPath, syncPlan);
  console.log(`ado sync dry-run: ${syncPlan.operations.length} operation${syncPlan.operations.length === 1 ? "" : "s"} -> ${outputPath}`);
}

function writeSyncPlan(outputPath, syncPlan) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(syncPlan, null, 2)}\n`);
}

// Apply a mutation atomically across processes. The read-modify-write runs inside
// an exclusive store lock, so no two writers can interleave — closing the lost-update
// race. The rev compare-and-swap remains as a second line of defence (it catches the
// rare case where a stale lock was broken mid-cycle) and retries a bounded number of
// times, failing loudly rather than clobbering or looping forever.
// REQ-041 / NODE-048: the first mutation in a repo with no graph auto-creates the
// store — but ONLY at the default path, and never silently when the user pointed
// --graph at a specific file. An explicit --graph at a missing path still fails
// loudly (via readGraph below), so a typo can't spawn an accidental second store.
function ensureStoreForMutation(graphPath, args) {
  if (args.graph !== undefined) return; // explicit --graph: never auto-create
  if (graphPath !== DEFAULT_GRAPH_PATH) return;
  if (fs.existsSync(graphPath)) return;

  const graph = createGraph({});
  writeGraph(graphPath, graph);
  if (!args.json) {
    console.log(`${glyph("added", args)} created store at ${graphPath} (no graph found; run \`dge init --title\` to set a title)`);
  }
}

function runMutation(graphPath, mutate, args = {}) {
  ensureStoreForMutation(graphPath, args);
  let record;
  for (let attempt = 0; ; attempt += 1) {
    try {
      withStoreLock(graphPath, () => {
        const expectedRev = readGraphRev(graphPath);
        const result = mutate(readGraph(graphPath));
        record = result.record;
        writeGraph(graphPath, result.graph, { expectedRev });
      });
      break;
    } catch (error) {
      if (error instanceof ConcurrentModificationError && attempt < MUTATION_RETRY_LIMIT) {
        continue;
      }
      throw error;
    }
  }
  const artifactPath = writeRecordArtifact(graphPath, record);
  const viewerPath = writeViewer(graphPath, readGraph(graphPath));
  printRecord("record", record, args);
  if (artifactPath && !args.json) {
    console.log(`   ${glyph("reports", args)} ${relativePath(artifactPath, graphPath)}`);
  }
  printViewerLink(viewerPath, graphPath, args);
}

function runSealContract(graphPath, args) {
  const nodeId = args._[0] ?? args.id;
  if (!nodeId) {
    throw new Error("Usage: dge seal-contract NODE-### --by <signer> [--reseal] [--confirm i-approve-this-contract]");
  }
  const sealedBy = args.by ?? args.signer;
  if (!sealedBy) {
    throw new Error("seal-contract requires --by <signer>: the seal records who approved the contract");
  }

  // Human gate. An interactive TTY is treated as the human being present; a
  // non-TTY (headless agent, CI, pipe) must carry the explicit typed phrase, which
  // a skill may not supply. Either way, without human intent there is no seal.
  const interactive = Boolean(process.stdin.isTTY);
  const confirmed = args.confirm === SEAL_CONFIRM_PHRASE;
  if (!interactive && !confirmed) {
    console.error(
      "seal-contract refused: no interactive terminal detected and the confirmation phrase was not provided.\n" +
        "Sealing is a human-only action — an autonomous agent run cannot complete it.\n" +
        `If you are a human running headless, re-run with: --confirm ${SEAL_CONFIRM_PHRASE}`
    );
    process.exit(1);
  }

  const sealedAt = new Date().toISOString();
  runMutation(
    graphPath,
    (graph) => sealContract(graph, nodeId, { sealedBy, sealedAt, reseal: Boolean(args.reseal) }),
    args
  );
}

function printViewerLink(viewerPath, graphPath, args = {}) {
  if (args.json) return;
  console.log(`   viewer  ${relativePath(viewerPath, graphPath)}`);
}

function mapDemandArgs(args) {
  return {
    id: args.id,
    title: args.title,
    source: args.source,
    requester: args.requester,
    summary: args.summary,
    problem: args.problem,
    outcome: args.outcome,
    constraints: args.constraint ?? args.constraints,
    nonGoals: args["non-goal"] ?? args.nonGoals
  };
}

function mapRequirementArgs(args) {
  return {
    id: args.id,
    demandId: args.demand ?? args.demandId,
    statement: args.statement,
    priority: args.priority,
    acceptance: args.acceptance,
    validationMethod: args["validation-method"] ?? args.validationMethod,
    evidence: args.evidence
  };
}

function mapGapArgs(args) {
  return {
    id: args.id,
    type: args.type,
    severity: args.severity,
    question: args.question,
    blocks: args.blocks,
    resolution: args.resolution
  };
}

function mapTrackArgs(args) {
  return {
    id: args.id,
    title: args.title,
    description: args.description,
    owner: args.owner
  };
}

function mapNodeArgs(args) {
  return {
    id: args.id,
    title: args.title,
    type: args.type,
    track: args.track,
    requirements: args.requirements ?? args.requirement,
    dependsOn: args["depends-on"] ?? args.dependsOn,
    status: args.status,
    validation: args.validation,
    evidencePath: args["evidence-path"] ?? args.evidencePath,
    linearIssueId: args["linear-issue-id"] ?? args.linearIssueId,
    adoTaskId: args["ado-task-id"] ?? args.adoTaskId
  };
}

function parseArgs(rawArgs) {
  const parsed = { _: [] };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index];
    if (token === "--") {
      parsed.command = rawArgs.slice(index + 1);
      break;
    }

    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    const [key, inlineValue] = withoutPrefix.split("=", 2);
    const value = inlineValue ?? rawArgs[index + 1];

    if (inlineValue === undefined && (value === undefined || value.startsWith("--"))) {
      parsed[key] = true;
      continue;
    }

    if (inlineValue === undefined) index += 1;
    appendArgValue(parsed, key, value);
  }

  return parsed;
}

function readOptionalJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read existing sync plan at ${filePath}: ${error.message}`);
  }
}

function appendArgValue(parsed, key, value) {
  if (parsed[key] === undefined) {
    parsed[key] = value;
    return;
  }

  if (!Array.isArray(parsed[key])) {
    parsed[key] = [parsed[key]];
  }
  parsed[key].push(value);
}

function removeUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function printRecord(label, record, args = {}) {
  if (args.json) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }
  // A recorded evidence item with result "fail" does not satisfy its contract
  // (see isPassing in evidence-engine): flag it so the user is not misled by an
  // "added" glyph into thinking it moved verification forward.
  const isFailingEvidence = record.result === "fail";
  const g = glyph(isFailingEvidence ? "fail" : "added", args);
  // A concise one-liner: glyph, id/title, and a short type/track/req hint when present.
  const hint = [record.type, record.track, (record.requirement_ids ?? []).join(", ") || null]
    .filter(Boolean)
    .join(" · ");
  const note = isFailingEvidence ? "  (does not satisfy contract)" : "";
  console.log(`${g} ${record.id ?? record.title}  ${record.title ?? ""}${hint ? `  [${hint}]` : ""}${note}`.trimEnd());
}

function printHelp() {
  console.log(`Delivery Graph Engineering CLI

Usage:
  dge init --title "Graph title" [--graph delivery-graph/graph.json]
  dge install-skills [--harness claude|copilot] [--symlink] [--force]
  dge validate [--graph path]
  dge migrate [--graph path] [--json]
  dge okf preview [--graph path] [--json]      # read-only: semantic diff + conformance, writes nothing
  dge okf write --confirm [--graph path]        # explicit: emit the OKF bundle under delivery-graph/okf/
  dge govern [DEM-###] [--config path] [--json]  # run the adaptive governor over ready nodes (read-only plan + report)
  dge orchestrate "<goal>" [--config path] [--json]  # Stage 6: system builds & self-reorganizes its own agent org from a bare goal
  dge regenerate [--graph path] [--json]
  dge show DEM-001 [--graph path] [--json]
  dge learnings [search terms...] [--about "topic"] [--graph path] [--json]
  dge status [--demand DEM-001] [--graph path] [--out delivery-graph/reports/status.md | --save]
  dge next [--graph path] [--json]
  dge evidence add NODE-001 --satisfies "npm test" --summary "npm test passed" [--result pass|fail] [--artifact output.txt]
  dge evidence run NODE-001 --satisfies "npm test" -- npm test
  dge evidence playwright NODE-001 --satisfies "checkout works" --url http://localhost:3000 --script tests/e2e/checkout.spec.ts [--artifacts test-results]
  dge evidence remove NODE-001 EVD-001
  dge verify NODE-001 [--graph path]
  dge verification-plan NODE-001 --builder-run RUN-ID --builder-harness claude --harness claude --harness copilot [--risk standard|high] [--json]
  dge done NODE-001 [--graph path]
  dge done NODE-001 --waive "<reason>" [--graph path]
  dge review [--graph path] [--out path]
  dge sync linear [--graph path] [--out delivery-graph/sync/linear.json]
  dge sync ado [--graph path] [--out delivery-graph/sync/ado.json] [--org name] [--project name] [--area path] [--iteration path]
  dge transition NODE-001 review [--graph path]
  dge add-demand --title "..." --source "..." --outcome "..." [--summary "one-line TL;DR"] [--graph path]
  dge add-requirement --demand DEM-001 --statement "..." --acceptance "..." --evidence "..."
  dge add-gap --type validation --severity blocker --question "..." --blocks REQ-001
  dge resolve-gap GAP-001 --resolution "..."
  dge add-track --title "Implementation"
  dge add-node --title "..." --type implementation --track TRK-implementation --requirements REQ-001 --validation "npm test"
  dge remove-node NODE-001
  dge remove-requirement REQ-001
  dge edit-requirement REQ-001 --statement "..." --priority should --validation-method automated-test --evidence "..."
  dge edit-demand DEM-001 --summary "..." --problem "..." --outcome "..." --non-goal "..." --constraint "..."
  dge remove-demand DEM-001 [--graph path]
  dge set-validation NODE-001 --validation "npm test" --validation "lint passes"
`);
}
