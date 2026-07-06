import path from "node:path";

// Named glyphs with an emoji form (default) and an ASCII fallback. The fallback
// is used when the user passes --ascii or sets NO_EMOJI, so output stays readable
// on terminals, CI logs, and screen readers that mangle emoji.
const GLYPHS = {
  done: ["🎯", "[done]"],
  verified: ["🔎", "[verified]"],
  pass: ["✅", "[ok]"],
  fail: ["❌", "[fail]"],
  blocked: ["🚫", "[blocked]"],
  unblocked: ["🔓", "->"],
  requirements: ["📋", "req:"],
  progress: ["📊", "progress:"],
  reports: ["📄", "reports:"],
  added: ["➕", "+"],
  removed: ["➖", "-"],
  next: ["👉", "->"],
  ready: ["🟢", "[ready]"]
};

// Resolve ascii mode from an explicit flag or the NO_EMOJI env var.
export function isAsciiMode({ ascii } = {}, env = process.env) {
  if (ascii) return true;
  const value = env.NO_EMOJI;
  return value !== undefined && value !== "" && value !== "0" && value !== "false";
}

// Return the glyph for a name in the active mode. Unknown names return "".
export function glyph(name, options = {}, env = process.env) {
  const pair = GLYPHS[name];
  if (!pair) return "";
  return isAsciiMode(options, env) ? pair[1] : pair[0];
}

// Make a path relative to the graph root (the directory that contains the
// delivery-graph/ store) so output never leaks an absolute filesystem path.
// The graph root is the parent of the delivery-graph/ directory in graphPath.
export function relativePath(targetPath, graphPath) {
  if (!targetPath) return targetPath;
  const root = graphRoot(graphPath);
  const rel = path.relative(root, path.resolve(targetPath));
  // If the target is outside the root, fall back to the basename rather than
  // emitting a ../../ chain that still leaks structure.
  return rel.startsWith("..") ? path.basename(targetPath) : rel;
}

// The graph root is the directory holding the delivery-graph/ store. graphPath is
// typically <root>/delivery-graph/graph.json, so the root is two levels up.
export function graphRoot(graphPath) {
  if (!graphPath) return process.cwd();
  const resolved = path.resolve(graphPath);
  const marker = `${path.sep}delivery-graph${path.sep}`;
  // Use the LAST occurrence: the store's own delivery-graph/ is the boundary,
  // even when the repo path itself contains "delivery-graph" earlier.
  const idx = resolved.lastIndexOf(marker);
  if (idx !== -1) return resolved.slice(0, idx);
  // Fallback: parent of the graph file's directory.
  return path.dirname(path.dirname(resolved));
}

// The bold one-line TL;DR every demand-scoped surface leads with. Prefer the
// demand's captured `summary`; when absent, fall back to the first sentence of
// `outcome` so the surface always has a lead and old (summary-less) demands still
// read cleanly. Returns a markdown-bold line (no trailing newline).
export function demandLead(demand) {
  const text = firstSentence(demand?.summary) || firstSentence(demand?.outcome) || "";
  return text ? `**${text}**` : "";
}

// First sentence of a block of prose: up to the first sentence-ending punctuation,
// else the whole (trimmed) string. Used for the outcome fallback so a wall-of-text
// outcome still yields a one-line lead.
export function firstSentence(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  if (trimmed === "") return "";
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/);
  const candidate = (match ? match[0] : trimmed).trim();
  // Guard against a match that is really an abbreviation ("e.g.", "i.e.") rather
  // than a full sentence: if the first "sentence" is very short and the source has
  // more to say, keep the whole string as the lead. A genuine short sentence with
  // no remainder (e.g. "Ship it.") is left as-is.
  if (match && candidate.length <= 5 && trimmed.length > candidate.length) {
    return trimmed;
  }
  return candidate;
}

// The shared "## Next" block every user-facing surface ends with, so the reader
// always finds the next action in the same place and shape. One helper, one
// convention — the cross-renderer guard test (DEM-013) asserts each surface emits
// exactly one of these. `items` is the ordered list of next actions (each a short
// plain phrase); an empty list still renders the heading with a single "nothing to
// do" line so the block is never blank. Glyph-aware, so it degrades cleanly under
// --ascii / NO_EMOJI like every other surface.
export function renderNextSteps(items, options = {}) {
  const cue = glyph("next", options);
  const lines = ["## Next"];
  const list = (items ?? []).filter((item) => typeof item === "string" && item.trim() !== "");
  if (list.length === 0) {
    lines.push(`${cue} nothing to do — this is complete`);
  } else {
    for (const item of list) lines.push(`${cue} ${item}`);
  }
  return lines.join("\n");
}
