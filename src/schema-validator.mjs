import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Zero-dependency JSON Schema validator.
//
// DGE ships as a marketplace plugin whose `bin/` puts `dge` on the harness PATH
// with NO `npm install` — so the CLI must run straight from a git checkout. A
// third-party validator (ajv) would force an npm install just to validate the
// graph, which is exactly the E401-prone step corporate users get stuck on. The
// delivery-graph schema is a fixed, closed subset of JSON Schema draft 2020-12
// (type, required, additionalProperties, enum, pattern, minLength, minItems,
// $ref/$defs, and string|null/number unions), so we validate it directly here.
// Error strings mirror ajv's wording ("must NOT have additional properties",
// "must be equal to one of the allowed values", …) so messages — and the tests
// that assert on them — are unchanged by dropping the dependency.

const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../schemas/delivery-graph.schema.json"
);
const rootSchema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

function resolveRef(ref) {
  // Only local "#/$defs/<name>" refs occur in this schema.
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!match) throw new Error(`Unsupported $ref: ${ref}`);
  const def = rootSchema.$defs?.[match[1]];
  if (!def) throw new Error(`Unknown $ref target: ${ref}`);
  return def;
}

function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && Number.isInteger(value)) return "integer";
  return typeof value; // "string" | "number" | "boolean" | "object"
}

// A value matches a schema `type` (string or array of strings). An integer
// value satisfies both "integer" and "number".
function typeMatches(value, type) {
  const allowed = Array.isArray(type) ? type : [type];
  const actual = jsonType(value);
  return allowed.some((t) => {
    if (t === "number") return actual === "number" || actual === "integer";
    return actual === t;
  });
}

function validateNode(value, schema, instancePath, errors) {
  if (schema.$ref) {
    validateNode(value, resolveRef(schema.$ref), instancePath, errors);
    return;
  }

  const loc = instancePath || "/";

  if (schema.type && !typeMatches(value, schema.type)) {
    const want = Array.isArray(schema.type) ? schema.type.join(",") : schema.type;
    errors.push(`schema ${loc}: must be ${want}`);
    return; // downstream keyword checks assume the type held
  }

  if (schema.enum && !schema.enum.some((allowed) => allowed === value)) {
    errors.push(`schema ${loc}: must be equal to one of the allowed values`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`schema ${loc}: must NOT have fewer than ${schema.minLength} characters`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`schema ${loc}: must match pattern "${schema.pattern}"`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`schema ${loc}: must NOT have fewer than ${schema.minItems} items`);
    }
    if (schema.items) {
      value.forEach((item, i) => validateNode(item, schema.items, `${instancePath}/${i}`, errors));
    }
  }

  const isPlainObject = value && typeof value === "object" && !Array.isArray(value);
  if (isPlainObject && (schema.type === "object" || schema.properties || schema.required)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        errors.push(`schema ${loc}: must have required property '${key}'`);
      }
    }
    if (schema.additionalProperties === false) {
      const known = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!known.has(key)) {
          errors.push(`schema ${loc}: must NOT have additional properties`);
        }
      }
    }
    for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
      if (key in value) {
        validateNode(value[key], propSchema, `${instancePath}/${key}`, errors);
      }
    }
  }
}

export function validateGraphSchema(graph) {
  const errors = [];
  validateNode(graph, rootSchema, "", errors);
  return errors;
}
