#!/usr/bin/env bash
#
# Clean-slate DGE bootstrap + observability demand seed (macOS / Linux / Git Bash).
# Run from the repo where you want the observability work to live.
#
# It automates everything DGE owns (CLI, skills, store, seed demand), then hands
# off the actual build to your coding harness (Claude Code / Copilot).
#
set -euo pipefail

# --- 0. Prereqs: Node >=20 and Git (DGE installs from GitHub) ---
command -v node >/dev/null || { echo "ERROR: install Node.js >=20 first (https://nodejs.org)"; exit 1; }
command -v git  >/dev/null || { echo "ERROR: install Git first"; exit 1; }
if [ "$(node -v | sed 's/v//;s/\..*//')" -lt 20 ]; then
  echo "ERROR: Node >=20 required; found $(node -v)"; exit 1
fi

# --- 1. DGE CLI (from GitHub) ---
echo ">> Installing DGE CLI..."
npm install --save-dev github:rafaelolsr/delivery-graph

# --- 2. Skills into the harness (.claude by default) ---
[ -d .claude ] || [ -d .github ] || mkdir .claude
harness=$([ -d .github ] && echo copilot || echo claude)
echo ">> Installing /dge-* skills for harness: $harness"
npx dge install-skills --harness "$harness"    # add --symlink on macOS/Linux if you prefer

# --- 3. Graph store (empty; the demand is authored by design, not by this script) ---
[ -f delivery-graph/graph.json ] || npx dge init --title "DCE Observability"

# --- 4. Handoff ---
# No demand is seeded here. A demand is a judgment step: what "observability" means,
# the DCE module boundary, and what proof counts as done. That belongs in the design
# conversation, not in a shell flag. dge-deliver runs design for you, then plans and builds.
npx dge preflight
cat <<'EOF'

=== DGE ready. Open your harness (Claude Code / Copilot) in THIS repo and run: ===

  /delivery-graph:dge-deliver implement the project's observability stack into a new module named DCE

There is no demand yet — dge-deliver will run design first (asking what observability
means, the DCE boundary, acceptance proof), author the demand from your answers, show
you the plan to approve, then build it evidence-gated. No node reaches "done" without proof.
EOF
