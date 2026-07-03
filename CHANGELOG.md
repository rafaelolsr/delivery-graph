# Changelog

## 0.2.1

Authoring-correctness fixes.

### Added
- **`dge remove-node NODE-###`** — delete a node via the CLI; refuses removal when other nodes depend on it.
- **`dge set-validation NODE-### --validation "..."`** — replace a node's validation contract via the CLI instead of hand-editing `graph.json`.

### Fixed
- **`--validation` items are no longer comma-split** — each flag is exactly one contract item, so validation prose can contain commas.
- **Relative-path doubling** — output no longer emits `delivery-graph/delivery-graph/...` when the repo path itself contains `delivery-graph`.

## 0.2.0

Marketplace distribution, a coupled CLI, and evidence/output hardening.

### Added
- **Plugin marketplace** for Claude Code and GitHub Copilot CLI (`.claude-plugin/plugin.json` + `marketplace.json`); install with `/plugin marketplace add rafaelolsr/delivery-graph` then `/plugin install delivery-graph@dge-tools`. No npm publish required.
- **CLI + skills, two install channels** — the plugin marketplace installs the `/dge-*` skill prompts only; the `dge` CLI is the `bin` entry in `package.json`, installed via `npm install github:rafaelolsr/delivery-graph`. A marketplace install alone gives the slash commands but not the `dge` binary, so any project that runs the engine still needs the npm/CLI install.
- **`dge evidence add --result pass|fail`** and **`dge evidence remove NODE-### EVD-###`** — result-aware evidence and CLI-based correction of records.
- **Concise, emoji-forward CLI output** for `done`/`verify`/`review`/`add-*`, with `--json` for the full payload and `--ascii`/`NO_EMOJI` for an emoji-free rendering. Paths are now relative, never absolute.
- **Wider gap vocabulary** — gap `type` accepts `privacy`, `architecture`, `ownership`; gap `severity` accepts `major`.
- **`scripts/migrate-legacy-store.mjs`** — migrate a legacy `version:"1.0"` intake store into the current CLI schema (dry-run by default).
- README loop-visibility diagrams for the autonomous execution loop.

### Changed
- **Evidence completeness is result-aware**: a `fail` result no longer satisfies a contract item, so `done` cannot be forced past a failure.
- **`dge-intake` and `dge-plan-graph` now require the CLI**: they preflight for `dge`, stop with an install instruction if it is missing, and never hand-write `graph.json` as a fallback (the canonical store is CLI-authored only).

### Fixed
- Copilot CLI silently failed to load a plugin whose manifest lived only in `.claude-plugin/` ([copilot-cli#2010](https://github.com/github/copilot-cli/issues/2010)) — a root-level `plugin.json` is now shipped alongside it.

## 0.1.0

- Initial local Delivery Graph engine, CLI, skills, and dry-run Linear/ADO adapters.
