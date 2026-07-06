#!/usr/bin/env node
// REQ-042 / NODE-049: the single npx one-shot bootstrap. One cross-platform code
// path (no per-OS shell script): it installs the /dge-* skills for the harness(es)
// the user selects, reusing installSkills. It does NOT install a harness or Node;
// a missing prerequisite yields a clear "install X first" message and installs
// nothing, rather than half-configuring the machine.
//
//   npx github:rafaelolsr/delivery-graph setup --harness claude [--harness copilot] [--force]
import { runSetup, renderSetup } from "../src/setup.mjs";

main();

function main() {
  const argv = process.argv.slice(2);
  // Drop a leading "setup" verb so both `dge-setup ...` and the package's
  // `setup` bin (`npx ... setup ...`) reach the same code.
  const args = parseArgs(argv[0] === "setup" ? argv.slice(1) : argv);

  const result = runSetup({
    harnesses: toList(args.harness),
    force: Boolean(args.force)
  });

  console.log(renderSetup(result, { ascii: args.ascii }));
  process.exit(result.ok ? 0 : 1);
}

function parseArgs(rawArgs) {
  const parsed = { _: [] };
  for (let i = 0; i < rawArgs.length; i += 1) {
    const token = rawArgs[i];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = rawArgs[i + 1];
    if (next === undefined || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      appendValue(parsed, key, next);
      i += 1;
    }
  }
  return parsed;
}

function appendValue(parsed, key, value) {
  if (parsed[key] === undefined) {
    parsed[key] = value;
    return;
  }
  if (!Array.isArray(parsed[key])) parsed[key] = [parsed[key]];
  parsed[key].push(value);
}

function toList(value) {
  if (value === undefined || value === true) return [];
  return Array.isArray(value) ? value : [value];
}
