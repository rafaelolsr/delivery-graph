# ADR-001: OKF-aligned knowledge core

**Status:** accepted · serves DEM-021 / REQ-090 (NODE-085)
**Date:** 2026-08-13
**Depends on:** [DGE→OKF v0.2 concept mapping](./dge-okf-mapping.md) (NODE-084)

## Context

DGE is evolving into a governed adaptive control plane (the full program spans
8 milestones). This ADR covers the **knowledge-representation** decisions of
Milestones 1–2: how DGE's durable knowledge is represented in Google Cloud's
Open Knowledge Format (OKF) v0.2 without destabilizing the canonical store.

Two requirements are in apparent tension:

1. **OKF is the core semantic representation** — not merely an optional export.
2. **`delivery-graph/graph.json` must remain the canonical entry point** for
   consuming repositories, and legacy graphs must keep working.

OKF v0.2 (pinned commit `3fcbb9f`, Apache-2.0) is a directory of markdown files
with YAML frontmatter, permissive conformance, and first-class provenance / trust
/ Attested-Computation families. It is not a JSON schema and has no central
registry. See the [concept mapping](./dge-okf-mapping.md) for the full analysis.

DGE already holds the invariant: *the delivery graph is canonical; trackers and
boards are projections* (`docs/architecture.md`).

## Decision

### D1 — `graph.json` stays the single canonical writer and entry point

`delivery-graph/graph.json` remains the **sole** authoritative store and the only
thing any writer mutates. Every other representation — tracker projections, the
offline viewer, **and the OKF bundle** — is derived from it. There is exactly one
write path.

### D2 — The OKF bundle is a projection, not a co-canonical source

The OKF bundle is **generated from** `graph.json` and never writes back to it.
This resolves the tension in the Context: "OKF is the core representation"
is satisfied at the level of *semantics and interchange* (the bundle is the
portable, OKF-conformant view of DGE knowledge), while `graph.json` remains the
canonical *entry point and writer*. The bundle is co-equal in **meaning**,
subordinate in **authority**.

Reconciliation of the "canonical entry" vs "OKF packaging" rule: OKF permits a
bundle to be *a subdirectory within a larger repository* (§3) and to declare its
version in a bundle-root `index.md` (§12). DGE therefore treats `graph.json` as
the authoritative manifest and emits the OKF bundle beside it (e.g.
`delivery-graph/okf/`) with a root `index.md` carrying `okf_version: "0.2"` that
references the canonical graph. graph.json is the entry; the bundle is the
packaged, conformant projection it points to.

### D3 — DGE-only concepts use a versioned, namespaced extension

Concepts and fields with no native OKF home use a single namespaced key,
`x-dge` (with `x-dge.version`), never overloading a native OKF field. The `x-`
prefix marks a producer extension; §11 guarantees consumers preserve unknown keys
and never reject on them. The extension version bumps independently of the pinned
OKF revision, so DGE fields can evolve without repinning OKF. Classification of
every concept (native-OKF / DGE-extension / runtime-only / human-projection) is
fixed by the [mapping](./dge-okf-mapping.md).

### D4 — Legacy reads never rewrite (no silent migration)

Reading or previewing a legacy `graph.json` MUST NOT mutate it. Emitting the OKF
bundle is an explicit, previewable action: a read-only preview renders a semantic
diff and writes nothing; only an explicit confirmed invocation writes the bundle.
New governance/OKF fields are optional for legacy workflows. This preserves the
existing `dge migrate` contract and the repository's WIP-safety expectations.

### D5 — Organization-learning boundary

Only **proven** results may feed organization-wide learning (enforced later, in
M3/M4's Learning admission gate — out of scope for this demand). At the knowledge
layer, the durable representation of a performance aggregate is a native-OKF
concept whose `sources[]` carry credibility signals and whose freshness/
supersession use `stale_after` / `status: deprecated` (§5). Raw prompts, source,
secrets, and evidence *content* are runtime-only and excluded from durable
knowledge by default (OKF §10.5 keeps run artifacts out of the bundle); only
references, hashes, classifications, and sanitized aggregates persist.

## Consequences

**Positive**
- One write path preserved → no new class of store-corruption bugs.
- OKF conformance gives DGE knowledge a portable, tool-agnostic, diffable form.
- Attested Computation (§10) maps onto the existing evidence gate, so the Prove
  gate and OKF attestation reinforce rather than duplicate each other.
- `x-dge` versioning decouples DGE evolution from the pinned OKF revision.

**Negative / costs**
- The bundle generator must stay a faithful, tested projection; a round-trip test
  is required to prevent silent drift (NODE-088).
- Two representations to keep semantically aligned (mitigated: one is generated).

**Neutral**
- Legacy graphs keep working unchanged; the bundle is additive.

## Alternatives considered

- **OKF bundle co-canonical with bidirectional round-trip authority** — rejected:
  doubles the write path and reintroduces divergence risk the canonical-store
  invariant exists to prevent.
- **Mapping/types only, defer emitting a bundle** — rejected for this demand: it
  leaves the "OKF as representation" claim unproven end-to-end; the demand's
  outcome requires a real, conformance-checked bundle.
- **Overload native OKF fields for DGE data** — rejected: forbidden by the spec
  non-goals and by OKF's own extension guidance (§4.1); `x-dge` is the correct home.

## Provenance

Derived from the pinned OKF v0.2 spec (§3, §4.1, §5, §10.5, §11, §12) and the
existing DGE canonical-store invariant (`docs/architecture.md`,
`src/graph-engine.mjs`, `src/store-migration.mjs`).
