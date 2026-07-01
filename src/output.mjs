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
  removed: ["➖", "-"]
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
  const idx = resolved.indexOf(marker);
  if (idx !== -1) return resolved.slice(0, idx);
  // Fallback: parent of the graph file's directory.
  return path.dirname(path.dirname(resolved));
}
