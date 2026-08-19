import fs from "node:fs";
import path from "node:path";
import { resolveRuntimePath } from "./path-utils.mjs";
import { computeSealDigest, signingKeyPresent } from "./signing.mjs";

// DEM-020 Track 3 / NODE-083 (REQ-088): holdout acceptance criteria the builder
// never sees. The criteria TEXT lives in a separate sealed store —
// delivery-graph/holdout/NODE-###.json — and graph.json carries only a
// `validation.holdout_digest` pointer. Only the verifier reads the holdout file,
// so a builder cannot overfit to criteria it never had access to.
//
// Known limitation (recorded as a DEM-020 non-goal): a fully-adversarial local
// builder with repo read access can still open the committed holdout file. True
// unreachability wants CI-only/verifier-side storage; this is the pragmatic 90%.

export function holdoutPath(graphPath, node) {
  // Sibling to delivery-graph/, keyed by node id — outside the node's own
  // evidence dir so it is not bundled with builder-facing artifacts.
  const root = resolveRuntimePath(graphPath, "delivery-graph/holdout/");
  return path.join(root, `${node.id}.json`);
}

export function readHoldout(graphPath, node) {
  const file = holdoutPath(graphPath, node);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Write the holdout criteria for a node and stamp a digest over their canonical
// bytes. Returns the digest so the caller can store it on graph.json — that
// pointer is all the builder-facing graph ever carries.
export function writeHoldout(graphPath, node, criteria, { repoRoot } = {}) {
  const normalized = normalizeCriteria(criteria);
  const file = holdoutPath(graphPath, node);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = { node_id: node.id, criteria: normalized };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return holdoutDigest(node, normalized, { repoRoot });
}

// Digest over node id + canonical criteria, HMAC under the repo key — same root of
// trust as the seal, so a tampered holdout file is detectable.
export function holdoutDigest(node, criteria, { repoRoot } = {}) {
  const canonical = JSON.stringify({ node_id: node.id, criteria: normalizeCriteria(criteria) });
  return computeSealDigest(Buffer.from(canonical, "utf8"), repoRoot);
}

function normalizeCriteria(criteria) {
  return (criteria ?? [])
    .map((c) => String(c).replace(/\s+/g, " ").trim())
    .filter((c) => c.length > 0)
    .sort();
}

// Evaluate a node's holdout against the set of satisfied evidence keys. Returns a
// structured status. A node with no holdout_digest and no file is `none` — an
// EXPLICIT "no holdout", never mistaken for a silent pass. When holdout criteria
// exist, every one must appear in `satisfiedKeys` (evidence keyed to it), and the
// file's digest must match its pointer, or the node is blocked.
export function holdoutStatus(graphPath, node, satisfiedKeys, { repoRoot } = {}) {
  const digest = node.validation?.holdout_digest;
  const file = readHoldout(graphPath, node);

  if (!digest && !file) {
    return { state: "none", missing: [], detail: "no holdout criteria defined" };
  }
  if (digest && !file) {
    return { state: "blocked", missing: [], detail: "holdout_digest set but holdout file missing" };
  }
  if (!digest && file) {
    return { state: "blocked", missing: [], detail: "holdout file present but no holdout_digest pointer" };
  }
  if (!signingKeyPresent(repoRoot)) {
    return { state: "blocked", missing: [], detail: "signing key absent; holdout digest uncheckable" };
  }
  if (holdoutDigest(node, file.criteria, { repoRoot }) !== digest) {
    return { state: "blocked", missing: [], detail: "holdout file digest does not match holdout_digest" };
  }

  const criteria = normalizeCriteria(file.criteria);
  if (criteria.length === 0) {
    return { state: "none", missing: [], detail: "holdout file defines no criteria" };
  }
  const satisfied = new Set(satisfiedKeys ?? []);
  const missing = criteria.filter((c) => !satisfied.has(c));
  return missing.length === 0
    ? { state: "satisfied", missing: [], detail: "all holdout criteria satisfied" }
    : { state: "blocked", missing, detail: "holdout criteria not satisfied by evidence" };
}
