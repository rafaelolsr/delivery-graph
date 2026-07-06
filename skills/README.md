# Skills

Public DGE skills will live here.

MVP skills:

- `/dge-intake`
- `/dge-plan-graph`
- `/dge-sync`
- `/dge-work-node`
- `/dge-verify`
- `/dge-review`
- `/dge-compound`
- `/dge-status`
- `/dge-execute-graph`

## Output convention (every skill)

Every skill's final conversational reply in a workflow phase follows one shape,
shared with every CLI-rendered surface (DEM-013):

1. **Lead with a bold one-line synthesis** — the single sentence a reader would
   keep if they read nothing else (what happened / what this means), not a raw
   enumeration.
2. Then the detail, if any — the list, table, or per-item breakdown.
3. **End with a `## Next` block** — the concrete next action(s). If there is
   genuinely nothing to do next, the block still renders with a single
   "nothing to do" line; it is never blank and never omitted.

This is a convention enforced by `tests/skill-cli-contract.test.mjs`, not a
template file — each skill states it in its own words at its own output step.
