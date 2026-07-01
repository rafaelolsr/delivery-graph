import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../schemas/delivery-graph.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

export function validateGraphSchema(graph) {
  if (validate(graph)) return [];

  return validate.errors.map((error) => {
    const location = error.instancePath || "/";
    return `schema ${location}: ${error.message}`;
  });
}
