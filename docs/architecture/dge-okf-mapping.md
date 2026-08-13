# DGE → OKF v0.2 Concept Mapping

**Status:** pinned reference · serves DEM-021 / REQ-089 (NODE-084)

## Pinned OKF revision

| Field | Value |
| --- | --- |
| Format | Open Knowledge Format (OKF) |
| Version | **0.2** |
| Repository | `GoogleCloudPlatform/knowledge-catalog` |
| Spec path | `okf/SPEC.md` |
| **Pinned commit** | **`3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`** (2026-07-24) |
| License | Apache-2.0 (attribution required when copying schemas/fixtures) |

All section references below (`§n`) are to `okf/SPEC.md` at the pinned commit.
This document is the authoritative mapping; do not invent OKF field meanings — if a
DGE concept has no native OKF home, it maps to a namespaced DGE extension (see
[extension namespace](#dge-extension-namespace)).

## What OKF v0.2 actually is

A **bundle** is a directory tree of markdown files, each a **concept** with a YAML
**frontmatter** block plus a markdown body (§3, §4). The only always-required
frontmatter key is `type` (§4.1, §11). Conformance is permissive: consumers MUST NOT
reject a concept for unknown `type` values, unknown extra keys, missing optional
fields, or broken links (§11). Provenance (`sources`), trust (`generated`,
`verified` → trust tiers), lifecycle (`status`, `stale_after`), and
**Attested Computation** (`runtime`/`parameters`/`computation`/`executor`/`attester`)
are all first-class but optional families (§5, §10).

This shape maps cleanly onto DGE's existing model: DGE already keeps a machine-readable
canonical store (`graph.json`) plus markdown projections (`demands/*.md`,
`requirements/*.md`), and already has an evidence gate with independent verification
(`verified[]` analog) and a seal. OKF is therefore adopted as a **projection** of the
canonical graph, not a second writer (see the ADR, NODE-085).

## Classification legend

Every durable DGE concept carries **exactly one** primary classification, one of:

- **native-OKF** — the concept's durable form is expressible with OKF's own frontmatter
  families; cite the `§` used. (Such a concept may *also* carry namespaced extension
  fields for DGE-only attributes — that is the norm, not a second classification. Where
  it matters, the rationale column notes "+ext".)
- **DGE-extension** — no OKF host concept exists; the concept lives under the namespaced
  extension key.
- **runtime-only** — a transient runtime artifact OKF explicitly keeps *out* of the
  bundle; not durable knowledge.
- **human-projection** — a rendered human view derived from canonical state; not a
  stored concept.

The primary classification answers "what is the concept's durable home?" A native-OKF
concept that also needs a few DGE-only fields is still **native-OKF** (with `+ext`
noted); it is not reclassified for carrying extension keys, since §11 makes unknown
keys a normal, non-rejecting part of any OKF concept.

## The mapping (13 durable concepts)

| # | DGE concept | Classification | OKF mapping / rationale |
| --- | --- | --- | --- |
| 1 | **Intent** (demand goal, outcome, constraints, non-goals) | native-OKF | A concept, `type: Intent` (§4.1 — `type` is producer-defined and required). Outcome/summary → `description` (§4.1); body carries constraints/non-goals as structural markdown (§4.2). DGE-specific fields (priority, risk tolerance, approval boundaries) → extension. |
| 2 | **Spec / graph version** | native-OKF | *(+ext)* The bundle *is* the spec snapshot. Version history → `log.md` (§9, date-grouped, newest first). The explicit version id + transition record → extension (`graph_version`), since OKF has no native version field. |
| 3 | **Task / node** | native-OKF | A concept, `type: Task` (§4.1). `title`/`description` native (§4.1). Node status/type/track → extension keys (unknown keys preserved, §4.1/§11). |
| 4 | **Dependency (edge)** | native-OKF | A markdown link from dependent → dependency (§6.1). OKF links are untyped directed edges; the "depends-on" kind is conveyed by surrounding prose/extension, per §6.1. |
| 5 | **Capability profile** (agent/model/tool/human) | DGE-extension | No OKF concept for executor capability, permitted domains, reliability history, or delegation authority. Carried as a concept whose extension frontmatter holds the profile. Unknown cost/latency stay absent (never zero). |
| 6 | **Policy / authority** | DGE-extension | No native OKF representation of governance policy or delegation authority. Extension concept. Human sign-off events on a policy → native `verified[]` with a `human:` actor (§5.2). |
| 7 | **Allocation decision** (chosen identity/model/tools/rationale) | DGE-extension | No OKF equivalent for a runtime routing decision + rationale. Durable rationale records → extension concept; the live allocation object itself is runtime-only (below). |
| 8 | **Observation** (progress/cost/latency/tokens/uncertainty) | runtime-only | Per-run telemetry. OKF keeps run artifacts *out* of the bundle (§10.5 — receipts and run state "are **not** stored in the bundle"). Only sanitized aggregates become durable (concept 12). |
| 9 | **Adaptation proposal** | DGE-extension | No native OKF state machine. Durable proposal/decision records → extension concept; its lifecycle (`proposed → evaluated → applied → …`) is DGE-defined. Approval events → native `verified[]` (§5.2). |
| 10 | **Gate evaluation** | native-OKF | *(+ext)* A gate's *verdict event* → native `verified[]` entry `{ by, at }` with an actor (§5.2, §7); trust tier follows the `human:` prefix (§5.3). The gate *inputs/verdict-enum/independence* metadata → extension. |
| 11 | **Evidence & provenance** | native-OKF | Provenance → `sources[]` with credibility signals `author`/`usage_count`/`last_modified` (§5.1). A validation contract → `type: Attested Computation` (§10.2): `executor.receipt` declares required evidence fields; `attester.resource` is the deterministic (no-LLM) check (§10.2). Evidence *content* is runtime (the receipt, below). |
| 12 | **Result** (proven demand outcome) | native-OKF | *(+ext)* A concept, `type: Result`. Its proof → linked Attested Computation(s) + `verified[]` (§5.2, §10). Gated: OKF says refuse to surface a failing attestation (§10.5). Business-outcome fields → extension. |
| 13 | **Performance aggregate** (org learning) | native-OKF | *(+ext)* A concept whose `sources[]` carry credibility signals and `usage_window` (§5.1); freshness via `stale_after` (§5.5); supersession via `status: deprecated` (§5.4). Sample counts / distributions / confidence → extension. |

### Runtime-only artifacts (explicitly not durable)

Per §10.5/§10.6, these are **never** written into the bundle:

- **Evidence receipt** — the fields declared by `executor.receipt`, produced per run.
- **Live allocation object** — the in-flight routing decision (its *rationale* may be
  distilled into a durable extension concept; the object is not).
- **Observation stream** — raw tokens/cost/latency events (only aggregates persist).

### Human-projection artifacts

Rendered views derived from canonical state, not stored concepts: `dge status`,
`dge show`, the offline viewer, and tracker projections (Linear/ADO). OKF's own
`index.md` (§8) is the bundle-native progressive-disclosure projection.

## Attested Computation ↔ DGE validation gate (the load-bearing fit)

OKF §10 is a near-exact analog of DGE's evidence gate:

| OKF §10 | DGE equivalent |
| --- | --- |
| `type: Attested Computation` (§10.1) | a node's validation contract |
| `runtime` + typed `parameters` (§10.2) | how the validation command is run |
| `executor.receipt` (§10.2) | the required evidence fields a run must return |
| `attester.resource` — deterministic, no-LLM (§10.2) | DGE's independent verifier / seal check |
| §10.5 "refuse to display a failing attestation" | the `done` gate refusing unproven completion |
| §10.6 `verified` (definition) vs attestation (per-run) | DGE requirement sign-off vs per-evidence pass |

The agent MAY only supply parameter *values*; it MUST NOT author/edit the computation
(§10.3) — the same non-negotiable that stops a DGE builder from rewriting its own
validation contract to manufacture a pass.

## DGE extension namespace

Concepts and fields with no native OKF home use a single **versioned, namespaced**
extension key (never overloading a native field, per §4.1 "Extensions" and the
non-goal "Do not overload unrelated OKF fields"):

```yaml
x-dge:
  version: "1"        # extension schema version, bumped independently of OKF 0.2
  kind: Task          # dge concept kind when it is not a native OKF type
  # …dge-specific fields (status, track, risk, allocation rationale, sample_count, …)
```

`x-` prefix signals a producer extension; `x-dge.version` lets the extension evolve
without touching the pinned OKF revision. Consumers that don't understand `x-dge`
still parse the concept (§11 — unknown keys preserved, never rejected).

## Round-trip & provenance guarantees

- **Identifiers survive** serialization/migration: DGE `DEM-###`/`REQ-###`/`NODE-###`
  ids are preserved (as concept ids / extension keys), so links (§6.1) stay stable.
- **Provenance is retained**: every durable claim keeps its `sources[]`/`generated`/
  `verified[]` (§5), satisfying the mandate that durable claims carry provenance.
- **graph.json stays canonical**: the bundle is regenerated from it; the bundle never
  writes back. Reconciliation of "graph.json canonical entry" vs "OKF packaging" is
  decided in the ADR (NODE-085).

## Provenance of this document

- Derived from `okf/SPEC.md` at pinned commit `3fcbb9f` (§§1–13 read in full).
- Cross-checked against existing DGE modules: `graph-engine.mjs`, `schema-validator.mjs`,
  `agentic-verification.mjs`, `seal.mjs`, `store-migration.mjs`, and the markdown-artifact
  writers.
