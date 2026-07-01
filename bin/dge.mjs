#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  readGraph,
  transitionNode,
  validateGraph,
  writeGraph
} from "../src/graph-engine.mjs";
import { renderStatus } from "../src/status-renderer.mjs";
import {
  createLinearSyncPlan,
  defaultLinearSyncPath
} from "../src/adapters/linear.mjs";
import {
  addDemand,
  addGap,
  addNode,
  addRequirement,
  addTrack,
  createGraph,
  resolveGap
} from "../src/graph-authoring.mjs";

const DEFAULT_GRAPH_PATH = "delivery-graph/graph.json";

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
      case "validate":
        runValidate(graphPath);
        break;
      case "status":
        process.stdout.write(renderStatus(readGraph(graphPath)));
        break;
      case "transition":
        runTransition(graphPath, args);
        break;
      case "sync":
        runSync(graphPath, args);
        break;
      case "add-demand":
        runMutation(graphPath, (graph) => addDemand(graph, mapDemandArgs(args)));
        break;
      case "add-requirement":
        runMutation(graphPath, (graph) => addRequirement(graph, mapRequirementArgs(args)));
        break;
      case "add-gap":
        runMutation(graphPath, (graph) => addGap(graph, mapGapArgs(args)));
        break;
      case "resolve-gap":
        runMutation(graphPath, (graph) => resolveGap(graph, args._[0] ?? args.id, args.resolution));
        break;
      case "add-track":
        runMutation(graphPath, (graph) => addTrack(graph, mapTrackArgs(args)));
        break;
      case "add-node":
        runMutation(graphPath, (graph) => addNode(graph, mapNodeArgs(args)));
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
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
  printRecord("graph", graph.graph);
}

function runValidate(graphPath) {
  const graph = readGraph(graphPath);
  const errors = validateGraph(graph);
  if (errors.length > 0) {
    throw new Error(`Delivery graph validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
  console.log(`Delivery graph valid: ${graph.graph.id} - ${graph.graph.title}`);
}

function runTransition(graphPath, args) {
  const [nodeId, nextStatus] = args._;
  if (!nodeId || !nextStatus) {
    throw new Error("Usage: dge transition NODE-### <status> [--graph path]");
  }

  const nextGraph = transitionNode(readGraph(graphPath), nodeId, nextStatus);
  writeGraph(graphPath, nextGraph);
  console.log(`${nodeId} -> ${nextStatus}`);
}

function runSync(graphPath, args) {
  const [target] = args._;
  if (target !== "linear") {
    throw new Error("Usage: dge sync linear [--graph path] [--out path] [--team-id id] [--project-id id]");
  }

  const outputPath = args.out ?? defaultLinearSyncPath(graphPath);
  const graph = readGraph(graphPath);
  const existingSync = readOptionalJson(outputPath);
  const syncPlan = createLinearSyncPlan(graph, {
    existingSync,
    teamId: args["team-id"] ?? args.teamId,
    projectId: args["project-id"] ?? args.projectId
  });

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(syncPlan, null, 2)}\n`);
  console.log(`linear sync dry-run: ${syncPlan.operations.length} operation${syncPlan.operations.length === 1 ? "" : "s"} -> ${outputPath}`);
}

function runMutation(graphPath, mutate) {
  const { graph, record } = mutate(readGraph(graphPath));
  writeGraph(graphPath, graph);
  printRecord("record", record);
}

function mapDemandArgs(args) {
  return {
    id: args.id,
    title: args.title,
    source: args.source,
    requester: args.requester,
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
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function printRecord(label, record) {
  console.log(`${label}: ${record.id ?? record.title}`);
  console.log(JSON.stringify(record, null, 2));
}

function printHelp() {
  console.log(`Delivery Graph Engineering CLI

Usage:
  dge init --title "Graph title" [--graph delivery-graph/graph.json]
  dge validate [--graph path]
  dge status [--graph path]
  dge sync linear [--graph path] [--out delivery-graph/sync/linear.json]
  dge transition NODE-001 review [--graph path]
  dge add-demand --title "..." --source "..." --outcome "..." [--graph path]
  dge add-requirement --demand DEM-001 --statement "..." --acceptance "..." --evidence "..."
  dge add-gap --type validation --severity blocker --question "..." --blocks REQ-001
  dge resolve-gap GAP-001 --resolution "..."
  dge add-track --title "Implementation"
  dge add-node --title "..." --type implementation --track TRK-implementation --requirements REQ-001 --validation "npm test"
`);
}
