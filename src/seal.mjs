import { computeSealDigest, signingKeyPresent } from "./signing.mjs";

// DEM-020 Track 1 / NODE-080 (REQ-085): the HMAC seal over a node's validation
// contract, and the check that makes verifyNode tamper-evident. The seal captures
// the exact contract bytes a human approved; if an agent later weakens
// validation.required or a traced requirement's acceptance prose, the digest no
// longer matches and the gate refuses.
//
// The seal is NODE-LOCAL: it covers this node's validation.required PLUS the
// acceptance criteria of the requirements the node traces to (requirement_ids) —
// not its dependencies' contracts, which are sealed by their own nodes.
//
// This module owns seal COMPUTATION and CHECKING only. The human-facing
// `dge seal-contract` command, its TTY confirmation, and `--reseal` are NODE-081.
// `mintSeal` here is the minimal internal helper those (and the tests) build on.

export const SEAL_ALGO = "sha256-hmac";

// Canonical serialization of the sealed contract bytes. Two contracts that mean
// the same thing must produce the same bytes, so a meaning-preserving re-save
// (key reorder, whitespace) does not break the seal — while any change to the
// actual required items or acceptance prose does. We achieve this by projecting
// the contract into a fixed shape with sorted, whitespace-normalized strings and
// serializing with stable key order.
export function canonicalContractBytes(graph, node) {
  const required = normalizeList(node.validation?.required ?? []);

  // Acceptance criteria of every requirement this node traces to, grouped by
  // requirement id so the mapping itself is part of what's sealed (moving a
  // criterion to a different requirement is a real change, not a re-save).
  const requirementIds = [...(node.requirement_ids ?? [])].sort();
  const acceptance = {};
  for (const reqId of requirementIds) {
    const requirement = (graph.requirements ?? []).find((r) => r.id === reqId);
    acceptance[reqId] = normalizeList(requirement?.acceptance ?? []);
  }

  // Stable, sorted-key JSON. The top-level keys are written in a fixed order and
  // the acceptance object's keys are already sorted above.
  const canonical = {
    node_id: node.id,
    required,
    acceptance
  };
  return Buffer.from(JSON.stringify(canonical), "utf8");
}

// Normalize a list of contract strings: trim, collapse internal whitespace runs,
// drop empties, and sort. Order and incidental whitespace are not meaning; the
// set of normalized statements is.
function normalizeList(items) {
  return items
    .map((item) => String(item).replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 0)
    .sort();
}

// Mint a seal object for a node's current contract. Minimal internal helper —
// callers (NODE-081's seal-contract command, and tests) supply `sealedBy` and
// `sealedAt`. Throws if the signing key is absent.
export function mintSeal(graph, node, { sealedBy, sealedAt, repoRoot } = {}) {
  const digest = computeSealDigest(canonicalContractBytes(graph, node), repoRoot);
  return {
    digest,
    algo: SEAL_ALGO,
    sealed_at: sealedAt,
    sealed_by: sealedBy
  };
}

// Seal a node's validation contract (DEM-020 Track 1 / NODE-081). This is the
// graph mutation behind `dge seal-contract`: it stamps `validation.seal` over the
// node's current contract bytes. The HUMAN gate (TTY confirmation, "no skill may
// call this autonomously") lives in the bin wrapper; this function is the pure,
// rev-CAS-safe mutation it calls once the human has confirmed.
//
// Refuses to overwrite an existing seal unless `reseal` is set — re-sealing after
// a legitimate contract edit must be a conscious act, and it always records fresh
// sealed_by/sealed_at so the audit trail shows who re-approved and when.
export function sealContract(graph, nodeId, { sealedBy, sealedAt, reseal = false, repoRoot } = {}) {
  const node = (graph.nodes ?? []).find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(`${nodeId} not found`);
  }
  if (node.validation?.seal && !reseal) {
    throw new Error(
      `${nodeId} is already sealed; pass --reseal to re-approve after a contract change (records a fresh signer + timestamp)`
    );
  }
  if (!sealedBy) {
    throw new Error(`${nodeId} cannot be sealed without a signer identity`);
  }

  const seal = mintSeal(graph, node, { sealedBy, sealedAt, repoRoot });
  const updated = { ...node, validation: { ...node.validation, seal } };
  const nextGraph = {
    ...graph,
    graph: { ...graph.graph, updated_at: sealedAt ?? graph.graph?.updated_at },
    nodes: graph.nodes.map((n) => (n.id === nodeId ? updated : n))
  };
  return { graph: nextGraph, record: updated };
}

// Check a node's seal against its current contract. Returns a structured verdict
// rather than throwing, so verifyNode can decide how to act (and so the "why" is
// reportable). Fail-closed: a present seal we cannot recompute (no key) is
// `uncheckable`, never silently trusted.
export function checkSeal(graph, node, { repoRoot } = {}) {
  const seal = node.validation?.seal;
  if (!seal || !seal.digest) {
    return { ok: false, reason: "missing", detail: "node has no seal" };
  }
  if (seal.algo !== SEAL_ALGO) {
    return { ok: false, reason: "algo", detail: `unsupported seal algo "${seal.algo}"` };
  }
  if (!signingKeyPresent(repoRoot)) {
    return { ok: false, reason: "uncheckable", detail: "signing key absent; seal cannot be validated" };
  }
  const expected = computeSealDigest(canonicalContractBytes(graph, node), repoRoot);
  if (expected !== seal.digest) {
    return { ok: false, reason: "broken", detail: "contract bytes changed since sealing" };
  }
  return { ok: true };
}
