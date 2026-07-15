# Skills

Public DGE skills will live here.

MVP skills:

- `/dge-design`
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

## Demand progress indicator (design/plan/execute/verify)

After a mutation that touches a demand's requirements or nodes, the skill's
final reply includes the demand's one-line lifecycle indicator — where the
demand sits across `Design → Plan → Execute → Verify → Done` — placed between
the synthesis line and the detail/`## Next` block.

The stage is always derived, never stored: call `dge show DEM-### --json` or
`dge status --demand DEM-### --json` (whichever the skill already calls) and
render its `progress` field with the shared format, e.g.:

```
Design ✅ → Plan ✅ → Execute 🟡 (3/7, 🚫1 blocked) → Verify ⚪ → Done ⚪
```

`dge-design`, `dge-plan-graph`, `dge-work-node`, `dge-execute-graph`, and
`dge-verify` each include this line. `dge-status` is already the dedicated
progress surface (via `--demand`); the reflective/sequencing skills
(`dge-review`, `dge-compound`, `dge-sync`, `dge-deliver`) don't need it —
they either inherit it transitively or operate after a demand is already done.
