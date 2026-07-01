#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  readGraph,
  transitionNode,
  validateGraph,
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
  verifyNode,
  writeCommandAttemptArtifact
} from "../src/evidence-engine.mjs";
import {
  defaultReviewPath,
  reviewGraph,
  writeReviewReport
} from "../src/review-engine.mjs";
import { writeRecordArtifact } from "../src/markdown-artifacts.mjs";
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
        runStatus(graphPath, args);
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

function runStatus(graphPath, args = {}) {
  const graph = readGraph(graphPath);
  const shouldWriteReport = args.out !== undefined || args.save;
  const generatedAt = shouldWriteReport ? new Date() : null;
  const markdown = renderStatus(graph, {
    evidenceStatuses: getAllEvidenceStatuses(graphPath, graph),
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
  console.log(`${nodeId} -> ${nextStatus}`);
}

function runEvidence(graphPath, args) {
  const [subcommand, nodeId] = args._;
  if (!nodeId || !["add", "run", "playwright"].includes(subcommand)) {
    throw new Error("Usage: dge evidence add NODE-### --satisfies \"...\" --summary \"...\" [--kind command] [--artifact path]\n       dge evidence run NODE-### --satisfies \"...\" [--summary \"...\"] -- <command>\n       dge evidence playwright NODE-### --satisfies \"...\" [--url URL] [--script test.spec.ts] [--artifacts test-results] -- <command>");
  }

  const graph = readGraph(graphPath);
  const { record } = runEvidenceSubcommand(graphPath, graph, nodeId, subcommand, args);
  printRecord("evidence", record);
}

function runEvidenceSubcommand(graphPath, graph, nodeId, subcommand, args) {
  if (subcommand === "add") {
    return addEvidence(graphPath, graph, nodeId, {
      kind: args.kind,
      summary: args.summary,
      satisfies: args.satisfies,
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
    throw new Error(`Command failed with exit code ${exitCode}; output artifact: ${artifactPath}`);
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
  console.log(`${nodeId} verified`);
  console.log(`verification report: ${verificationPath}`);
  console.log(JSON.stringify(evidenceStatus, null, 2));
}

function runDone(graphPath, args) {
  const [nodeId] = args._;
  if (!nodeId) {
    throw new Error("Usage: dge done NODE-### [--graph path] [--out review-report.md]");
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
    graph.nodes.find((candidate) => candidate.id === dependencyId)?.status !== "done"
  );
  if (incompleteDependencies.length > 0) {
    throw new Error(`${nodeId} cannot be done; incomplete dependencies: ${incompleteDependencies.join(", ")}`);
  }

  const evidenceStatus = getEvidenceStatus(graphPath, graph, node);
  if (!evidenceStatus.complete) {
    throw new Error(`${nodeId} is missing validation evidence: ${evidenceStatus.missing.join(", ")}`);
  }

  const generatedAt = new Date();
  const { report, markdown } = reviewGraph(graphPath, graph, { generatedAt: generatedAt.toISOString() });
  const reviewPath = args.out ?? defaultReviewPath(graphPath, generatedAt);
  writeReviewReport(reviewPath, markdown);
  const blockers = report.findings.filter((finding) => finding.severity === "blocker");
  if (blockers.length > 0) {
    throw new Error(`Review blockers prevent done: ${blockers.map((finding) => finding.message).join("; ")}\nreview report: ${reviewPath}`);
  }

  const verified = verifyNode(graphPath, graph, nodeId);
  const doneGraph = transitionNode(verified.graph, nodeId, "done");
  writeGraph(graphPath, doneGraph);
  console.log(`${nodeId} done`);
  console.log(`evidence manifest: ${verified.evidenceStatus.manifest_path}`);
  console.log(`verification report: ${verified.verificationPath}`);
  console.log(`review report: ${reviewPath}`);
}

function runReview(graphPath, args) {
  const graph = readGraph(graphPath);
  const generatedAt = new Date();
  const { report, markdown } = reviewGraph(graphPath, graph, { generatedAt: generatedAt.toISOString() });
  const outputPath = args.out ?? defaultReviewPath(graphPath, generatedAt);
  writeReviewReport(outputPath, markdown);
  console.log(`review report: ${outputPath}`);
  console.log(JSON.stringify(report, null, 2));
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

function runMutation(graphPath, mutate) {
  const { graph, record } = mutate(readGraph(graphPath));
  writeGraph(graphPath, graph);
  const artifactPath = writeRecordArtifact(graphPath, record);
  printRecord("record", record);
  if (artifactPath) {
    console.log(`artifact: ${artifactPath}`);
  }
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

function removeUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
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
  dge status [--graph path] [--out delivery-graph/reports/status.md | --save]
  dge evidence add NODE-001 --satisfies "npm test" --summary "npm test passed" [--artifact output.txt]
  dge evidence run NODE-001 --satisfies "npm test" -- npm test
  dge evidence playwright NODE-001 --satisfies "checkout works" --url http://localhost:3000 --script tests/e2e/checkout.spec.ts [--artifacts test-results]
  dge verify NODE-001 [--graph path]
  dge done NODE-001 [--graph path]
  dge review [--graph path] [--out path]
  dge sync linear [--graph path] [--out delivery-graph/sync/linear.json]
  dge sync ado [--graph path] [--out delivery-graph/sync/ado.json] [--org name] [--project name] [--area path] [--iteration path]
  dge transition NODE-001 review [--graph path]
  dge add-demand --title "..." --source "..." --outcome "..." [--graph path]
  dge add-requirement --demand DEM-001 --statement "..." --acceptance "..." --evidence "..."
  dge add-gap --type validation --severity blocker --question "..." --blocks REQ-001
  dge resolve-gap GAP-001 --resolution "..."
  dge add-track --title "Implementation"
  dge add-node --title "..." --type implementation --track TRK-implementation --requirements REQ-001 --validation "npm test"
`);
}
