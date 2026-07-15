#Requires -Version 5.1
<#
  Clean-slate DGE bootstrap + observability demand seed (Windows / PowerShell).
  Run from the repo where you want the observability work to live.

  Automates everything DGE owns (CLI, skills, store, seed demand), then hands off
  the actual build to your coding harness (Claude Code / Copilot).
#>
$ErrorActionPreference = "Stop"

# --- 0. Prereqs: Node >=20 and Git (DGE installs from GitHub) ---
function Need($cmd, $wingetId, $name) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "Installing $name..." -ForegroundColor Yellow
    winget install --silent --accept-source-agreements --accept-package-agreements $wingetId
    Write-Host "$name installed. RESTART this terminal, then re-run this script." -ForegroundColor Green
    exit 1
  }
}
Need "node" "OpenJS.NodeJS.LTS" "Node.js 20 LTS"
Need "git"  "Git.Git"          "Git"

$nodeMajor = (node -v).TrimStart("v").Split(".")[0] -as [int]
if ($nodeMajor -lt 20) { throw "Node >=20 required; found $(node -v). Upgrade and re-run." }

# --- 1. DGE CLI (from GitHub) ---
Write-Host ">> Installing DGE CLI..." -ForegroundColor Cyan
npm install --save-dev github:rafaelolsr/delivery-graph

# --- 2. Skills into the harness (.claude by default; COPY mode on Windows) ---
if (-not (Test-Path ".claude") -and -not (Test-Path ".github")) { New-Item -ItemType Directory ".claude" | Out-Null }
$harness = if (Test-Path ".github") { "copilot" } else { "claude" }
Write-Host ">> Installing /dge-* skills for harness: $harness" -ForegroundColor Cyan
npx dge install-skills --harness $harness      # no --symlink on Windows (needs admin/Developer Mode)

# --- 3. Graph store (empty; the demand is authored by design, not by this script) ---
if (-not (Test-Path "delivery-graph/graph.json")) {
  npx dge init --title "DCE Observability"
}

# --- 4. Handoff ---
# No demand is seeded here. A demand is a judgment step: what "observability" means,
# the DCE module boundary, and what proof counts as done. That belongs in the design
# conversation, not in a shell flag. dge-deliver runs design for you, then plans and builds.
npx dge preflight
Write-Host "`n=== DGE ready. Open your harness (Claude Code / Copilot) in THIS repo and run: ===" -ForegroundColor Green
Write-Host "`n  /delivery-graph:dge-deliver implement the project's observability stack into a new module named DCE`n" -ForegroundColor White
Write-Host "There is no demand yet — dge-deliver will run design first (what observability means," -ForegroundColor Gray
Write-Host "the DCE boundary, acceptance proof), author the demand, show you the plan to approve," -ForegroundColor Gray
Write-Host 'then build it evidence-gated. No node reaches "done" without proof.' -ForegroundColor Gray
