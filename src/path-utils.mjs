import path from "node:path";

export function resolveRuntimePath(graphPath, runtimePath) {
  const absoluteGraphPath = path.resolve(graphPath);
  const graphDir = path.dirname(absoluteGraphPath);

  if (path.basename(graphDir) === "delivery-graph" && runtimePath.startsWith("delivery-graph/")) {
    return path.join(path.dirname(graphDir), runtimePath);
  }

  return path.join(graphDir, runtimePath);
}

export function defaultRuntimePath(graphPath, runtimePath) {
  return resolveRuntimePath(graphPath, runtimePath);
}

