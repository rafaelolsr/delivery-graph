// OKF v0.2 concept domain types + a minimal YAML-frontmatter serializer/parser.
//
// Pinned to OKF v0.2 (GoogleCloudPlatform/knowledge-catalog @ 3fcbb9f). See
// docs/architecture/dge-okf-mapping.md and docs/architecture/adr-001-okf-knowledge-core.md.
//
// A concept is a markdown file: a YAML frontmatter block delimited by `---`, then a
// markdown body (SPEC §4). `type` is the only required frontmatter key (§4.1, §11).
// DGE has ZERO runtime dependencies, so this module implements the small, explicit
// subset of YAML the format actually uses — scalars, ISO dates, string lists, and
// one level of nested mappings/lists — rather than pulling in a YAML library. It is
// deliberately NOT a general YAML engine; it round-trips exactly what the generator
// emits and rejects shapes it was not designed for, so drift fails loudly.

export const OKF_VERSION = "0.2";
export const OKF_PINNED_COMMIT = "3fcbb9f828c2f23d109c855ee403c3a4c81f3a96";

// The DGE extension namespace (ADR-001 D3). All DGE-only fields live here so native
// OKF fields are never overloaded. `x-` marks a producer extension (SPEC §4.1).
export const DGE_EXTENSION_KEY = "x-dge";
export const DGE_EXTENSION_VERSION = "1";

const FRONTMATTER_DELIMITER = "---";

// ---------------------------------------------------------------------------
// Domain type
// ---------------------------------------------------------------------------

// A concept: { type (required), ...native frontmatter, body }. DGE-only data must
// be nested under DGE_EXTENSION_KEY, never spread onto the top level. makeConcept
// enforces that invariant so a caller cannot accidentally emit a bare `status: ...`
// DGE field that collides with the native OKF `status` (§5.4).
export function makeConcept({ type, body = "", ext, ...frontmatter }) {
  if (typeof type !== "string" || type.trim() === "") {
    throw new Error("OKF concept requires a non-empty `type` (SPEC §4.1)");
  }
  const concept = { type, ...frontmatter };
  if (ext !== undefined) {
    concept[DGE_EXTENSION_KEY] = { version: DGE_EXTENSION_VERSION, ...ext };
  }
  concept.body = body;
  return concept;
}

// ---------------------------------------------------------------------------
// Serialize: concept -> markdown text
// ---------------------------------------------------------------------------

export function serializeConcept(concept) {
  const { body = "", ...frontmatter } = concept;
  const yaml = serializeFrontmatter(frontmatter);
  const trimmedBody = body.replace(/\s+$/, "");
  const parts = [FRONTMATTER_DELIMITER, yaml, FRONTMATTER_DELIMITER];
  if (trimmedBody) parts.push("", trimmedBody);
  return parts.join("\n") + "\n";
}

// Emit frontmatter. Key order is stable (insertion order) so serialization is
// deterministic and byte-comparable — the property NODE-088's round-trip relies on.
function serializeFrontmatter(obj, indent = 0) {
  const pad = "  ".repeat(indent);
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`);
        continue;
      }
      lines.push(`${pad}${key}:`);
      for (const item of value) {
        if (isPlainObject(item)) {
          // Serialize the mapping at zero indent, then re-indent: the first key sits
          // inline after `- ` (at pad+2), and every subsequent key aligns to pad+4.
          const inner = serializeFrontmatter(item, 0).split("\n");
          lines.push(`${pad}  - ${inner[0]}`);
          for (const r of inner.slice(1)) lines.push(`${pad}    ${r}`);
        } else {
          lines.push(`${pad}  - ${serializeScalar(item)}`);
        }
      }
    } else if (isPlainObject(value)) {
      lines.push(`${pad}${key}:`);
      lines.push(serializeFrontmatter(value, indent + 1));
    } else {
      lines.push(`${pad}${key}: ${serializeScalar(value)}`);
    }
  }
  return lines.filter((l) => l !== "").join("\n");
}

function serializeScalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const str = String(value);
  // Quote when the scalar would otherwise parse as something else, contain a
  // structural character, or lead/trail with whitespace.
  if (
    str === "" ||
    /^(null|true|false|~)$/i.test(str) ||
    /^[\d[{]/.test(str) ||
    /[:#]/.test(str) ||
    str !== str.trim()
  ) {
    return JSON.stringify(str);
  }
  return str;
}

// ---------------------------------------------------------------------------
// Parse: markdown text -> concept
// ---------------------------------------------------------------------------

export function parseConcept(text) {
  const { frontmatter, body } = splitFrontmatter(text);
  const parsed = parseFrontmatter(frontmatter);
  if (typeof parsed.type !== "string" || parsed.type.trim() === "") {
    throw new Error("OKF concept frontmatter missing non-empty `type` (SPEC §4.1/§11)");
  }
  return { ...parsed, body };
}

export function splitFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith(FRONTMATTER_DELIMITER + "\n")) {
    throw new Error("OKF concept must open with a `---` frontmatter block (SPEC §4)");
  }
  const rest = normalized.slice(FRONTMATTER_DELIMITER.length + 1);
  const closeIndex = rest.indexOf("\n" + FRONTMATTER_DELIMITER);
  if (closeIndex === -1) {
    throw new Error("OKF concept frontmatter block is not closed with `---` (SPEC §4)");
  }
  const frontmatter = rest.slice(0, closeIndex);
  const afterClose = rest.slice(closeIndex + 1 + FRONTMATTER_DELIMITER.length);
  // Strip the blank separator line(s) between the closing `---` and the body, plus
  // trailing whitespace. The separator is structural, not content, so dropping it
  // keeps serialize(parse(x)) stable (the byte-stability property NODE-088 needs).
  const body = afterClose.replace(/^\n+/, "").replace(/\s+$/, "");
  return { frontmatter, body };
}

// A small, explicit YAML-subset parser. Handles the exact shapes serializeConcept
// emits: scalars, `[]`, string/scalar lists, list-of-mappings, and nested mappings.
function parseFrontmatter(text) {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const [value] = parseBlock(lines, 0, 0);
  return value;
}

function indentOf(line) {
  return line.length - line.replace(/^\s+/, "").length;
}

// Parse a mapping block whose keys sit at `indent`. Returns [object, nextIndex].
function parseBlock(lines, start, indent) {
  const obj = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const lineIndent = indentOf(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) throw new Error(`Unexpected indent in OKF frontmatter: ${line}`);
    const content = line.slice(indent);
    const match = content.match(/^([^:]+):(.*)$/);
    if (!match) throw new Error(`Malformed OKF frontmatter line: ${line}`);
    const key = match[1].trim();
    const rawValue = match[2].trim();
    if (rawValue === "") {
      // Nested list or mapping on following, more-indented lines.
      const childIndent = i + 1 < lines.length ? indentOf(lines[i + 1]) : indent;
      if (i + 1 < lines.length && lines[i + 1].slice(childIndent).startsWith("- ")) {
        const [list, next] = parseList(lines, i + 1, childIndent);
        obj[key] = list;
        i = next;
      } else if (childIndent > indent) {
        const [child, next] = parseBlock(lines, i + 1, childIndent);
        obj[key] = child;
        i = next;
      } else {
        obj[key] = null;
        i += 1;
      }
    } else {
      obj[key] = parseScalar(rawValue);
      i += 1;
    }
  }
  return [obj, i];
}

// Parse a `- ` list whose dashes sit at `indent`. Returns [array, nextIndex].
function parseList(lines, start, indent) {
  const list = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (indentOf(line) !== indent || !line.slice(indent).startsWith("- ")) break;
    const firstContent = line.slice(indent + 2);
    const inlineMatch = firstContent.match(/^([^:]+):(.*)$/);
    if (inlineMatch) {
      // List-of-mappings: the dash sits at `indent`; the first key is inline after
      // `- ` and every subsequent key of the same mapping aligns to `indent + 2`
      // (i.e. under the content, two past the dash). Reconstruct the mapping block
      // at that indent and hand it to parseBlock.
      const mapIndent = indent + 2;
      const mapLines = [" ".repeat(mapIndent) + firstContent];
      i += 1;
      while (i < lines.length && indentOf(lines[i]) >= mapIndent && !lines[i].slice(indent).startsWith("- ")) {
        mapLines.push(lines[i]);
        i += 1;
      }
      const [obj] = parseBlock(mapLines, 0, mapIndent);
      list.push(obj);
    } else {
      list.push(parseScalar(firstContent.trim()));
      i += 1;
    }
  }
  return [list, i];
}

function parseScalar(raw) {
  if (raw === "[]") return [];
  if (raw === "null" || raw === "~") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.startsWith('"')) return JSON.parse(raw);
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
