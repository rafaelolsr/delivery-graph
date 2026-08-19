# DEM-021 (M1+M2) — end-to-end proof

**Node:** NODE-091 · serves REQ-089…REQ-094 · **`npm run check` exit 0, 435/435 tests**

This is the demand-level Prove artifact for the OKF-aligned knowledge core
(Milestones 1–2 of the Governed Adaptive Control Plane program). It ties the four
required gate evidences together.

## The four Prove-gate evidences

| # | Evidence | Where | Status |
|---|----------|-------|--------|
| 1 | Pinned DGE→OKF v0.2 concept mapping (all 13 concepts classified) | `docs/architecture/dge-okf-mapping.md` | ✓ committed `096fa38` |
| 2 | ADR-001 (canonical state, x-dge namespace, compatibility, learning boundary) | `docs/architecture/adr-001-okf-knowledge-core.md` | ✓ committed `84edb38` |
| 3 | OKF v0.2 conformance (positive real-bundle fixture + 5 negative fixtures) | `tests/okf-conformance.test.mjs` | ✓ 9/9 |
| 4 | Lossless round-trip (real graph.json as golden fixture, stable IDs) | `tests/okf-roundtrip.test.mjs` | ✓ 5/5 |
| + | No-rewrite regression (graph.json byte-identical through preview + write) | `tests/okf-migrate-cli.test.mjs` | ✓ 3/3 |

## What shipped (M1+M2)

- **`src/okf-concept.mjs`** — zero-dependency OKF v0.2 concept domain types +
  YAML-frontmatter serializer/parser. `type` required (§4.1); unknown keys preserved
  (§11); DGE fields isolated under a versioned `x-dge` extension.
- **`src/okf-bundle.mjs`** — pure one-way projection `graphToBundle()`: demands→Intent,
  requirements→Requirement, nodes→Task, validation contracts→Attested Computation
  (§10), deps→bundle-relative links, root `index.md` with `okf_version`. Never writes
  back to graph.json.
- **`src/okf-compat.mjs`** — compatibility reader `bundleToGraph()` + `roundTrip()` +
  `diffGraphs()` semantic-loss detector.
- **`src/okf-conformance.mjs`** — OKF v0.2 §11 conformance validator (permissive per
  spec; enforces the §12 root-index `okf_version` rule).
- **`dge okf preview` / `dge okf write --confirm`** — explicit, previewable migration;
  no silent rewrite of the canonical store.

## Locked decisions honored

- OKF **pinned** at v0.2 commit `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96` (Apache-2.0).
- `graph.json` stays the **sole canonical writer/entry**; the OKF bundle is a projection.
- **No silent migration**: reading/previewing never rewrites graph.json (proven byte-identical).
- DGE-only data uses the versioned `x-dge` namespace; native OKF fields are never overloaded.

## Real bugs caught by the evidence gates (not by review)

1. **Mapping dual-classification** — the independent verifier rejected 4 concepts
   carrying two classifications; fixed to one primary + `(+ext)` note.
2. **Serializer newline drift + list-of-mapping indent** — caught by the byte-stability
   round-trip test.
3. **Colon-in-list-item corruption** — a quoted contract item containing `: ` (42 such
   items in the live store) was misparsed as a mapping; caught only by round-tripping
   the *real* graph.json.
4. **Empty quoted `type: ""`** — silently passed conformance; caught during verifier polish.

## How to reproduce

```bash
npm run check                 # 435/435, exit 0
dge okf preview               # 298 concept files, round-trip lossless, OKF conformant, writes nothing
node --test tests/okf-*.test.mjs
```
