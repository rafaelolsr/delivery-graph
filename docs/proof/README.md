# Proof

This folder holds **case studies** that empirically validate DGE's core claim:
*completion is enforced by the engine, not trusted from the agent.*

DGE's per-node evidence trail (`verification.md`, review reports, evidence manifests) proves a
node *had* evidence — but that is internal plumbing. A **proof case** here is the sellable
narrative: a concrete instance of a coding agent claiming `done`, DGE's engine blocking it on
missing/insufficient evidence, and the defect that would otherwise have shipped.

## Why this folder exists

DGE's entire pitch is "don't trust self-reported completion." The weakest possible evidence for
that pitch is DGE self-dogfooding on its own repo — a skeptic will notice the irony immediately.
**One reproducible case on a repo that is not DGE's own** is the make-or-break, pay-for-itself
first-run demo. It:

1. validates the differentiator empirically (not by assertion),
2. becomes the first-run "aha" moment, and
3. attaches a real number to the documented pain point (agents over-reporting "done").

Get one such artifact **before building new features** (see [ROADMAP.md](../../ROADMAP.md)).

## Template for a proof case

Copy this into `docs/proof/<short-slug>.md`:

```markdown
# Proof: <one-line summary of the caught defect>

- **Repo:** <third-party repo, not DGE's own>
- **Harness / agent:** <e.g. Claude Code, Copilot CLI> · **Model:** <id>
- **Task given:** <the demand/prompt the agent was asked to complete>

## What the agent claimed
The agent reported the work **done**. <quote/screenshot of the completion claim>

## What DGE's engine did
`dge done NODE-###` was **blocked**: <exact CLI error — e.g. "is missing validation
evidence: …" or an ambiguous/failed result>. Because `verified` is CLI-minted-only and
`done` requires `verified`, the node could not close.

## The defect it would have shipped
<the concrete bug/regression the missing evidence corresponded to — what would have gone
to production if the agent's "done" had been trusted>

## Reproduction
<steps so anyone can rerun and see the gate block it>

## Takeaway
The harness trusted the agent's "done." DGE required proof, and the proof wasn't there.
```
