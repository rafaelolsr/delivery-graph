import fs from "node:fs";
import path from "node:path";
import { graphRoot } from "./output.mjs";

// Learnings are the compounded-knowledge artifact written by dge-compound. They
// live as markdown files under <root>/delivery-graph/learnings/. This module is
// the READ side of the compound loop: it lets design/plan-graph surface relevant
// prior learnings before scoping new work, so the toolset compounds across
// demands instead of only within one.
//
// Format is backward-compatible: files need no frontmatter. When a leading
// `---` YAML block is present, its `tags` and `related` fields are parsed for
// richer matching; otherwise those are derived from the body headings.

export function learningsDir(graphPath) {
  return path.join(graphRoot(graphPath), "delivery-graph", "learnings");
}

export function listLearnings(graphPath) {
  const dir = learningsDir(graphPath);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => parseLearning(path.join(dir, name)));
}

// Return learnings whose title, tags, "applies when" text, or related ids match
// any of the given terms (case-insensitive substring). No terms => all learnings.
export function findLearnings(graphPath, terms = []) {
  const all = listLearnings(graphPath);
  const needles = terms.map((term) => String(term).toLowerCase()).filter(Boolean);
  if (needles.length === 0) return all;

  return all.filter((learning) => {
    const haystack = [
      learning.title,
      learning.applies_when,
      learning.tags.join(" "),
      learning.related.join(" "),
      learning.slug
    ]
      .join(" ")
      .toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  });
}

function parseLearning(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const slug = path.basename(filePath, ".md");
  const { frontmatter, body } = splitFrontmatter(raw);

  const title = frontmatter.title ?? firstHeading(body) ?? slug;
  const tags = normalizeList(frontmatter.tags);
  const related = normalizeList(frontmatter.related).length > 0
    ? normalizeList(frontmatter.related)
    : relatedFromBody(body);

  return {
    slug,
    path: filePath,
    title,
    tags,
    related,
    applies_when: sectionText(body, "Applies when")
  };
}

// Minimal, dependency-free YAML frontmatter reader. Handles the small surface we
// emit: `key: value` scalars and inline (`[a, b]`) or dash lists. Not a general
// YAML parser — learnings only ever carry title/tags/related.
function splitFrontmatter(raw) {
  if (!raw.startsWith("---")) return { frontmatter: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: raw };

  const block = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const frontmatter = {};
  let currentKey = null;

  for (const line of block.split("\n")) {
    const dash = line.match(/^\s*-\s+(.*)$/);
    if (dash && currentKey) {
      (frontmatter[currentKey] ||= []).push(stripQuotes(dash[1].trim()));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    currentKey = key;
    if (value.trim() === "") {
      frontmatter[key] = [];
    } else if (value.trim().startsWith("[")) {
      frontmatter[key] = value
        .trim()
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((item) => stripQuotes(item.trim()))
        .filter(Boolean);
    } else {
      frontmatter[key] = stripQuotes(value.trim());
    }
  }

  return { frontmatter, body };
}

function normalizeList(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstHeading(body) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function sectionText(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^#{1,6}\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n#{1,6}\\s|$)`, "m"));
  return match ? match[1].trim() : "";
}

// Legacy learnings put graph ids under a "Related graph ids" heading; harvest
// DGE ids from that section so pre-frontmatter files still match on id.
function relatedFromBody(body) {
  const section = sectionText(body, "Related graph ids");
  return [...section.matchAll(/\b(?:DEM|REQ|NODE|GAP|TRK|DGE)-[A-Za-z0-9-]+/g)].map((match) => match[0]);
}

function stripQuotes(value) {
  return value.replace(/^["']|["']$/g, "");
}
