import { readGraph, readGraphRev, writeGraph, withStoreLock } from "./graph-engine.mjs";

// Parallel multi-harness execution (DEM-011 / REQ-047).
//
// Different harnesses execute different ready nodes at the same time, and each
// records its result into the ONE canonical store without corrupting it. This is
// the payoff that DEM-012's concurrency-safe store unlocks: the persist step reuses
// withStoreLock + revision compare-and-swap, so concurrent completions cannot lose
// updates. Dispatch (running the harness) is naturally parallel; only the short
// store-write is serialized by the lock.

// Persist one node's completion into the store atomically. Mirrors the CLI's
// runMutation concurrency protocol (lock + CAS + bounded retry) so a parallel
// writer can never clobber another's update.
export function persistNodeResult(graphPath, nodeId, apply, { retryLimit = 20 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      let committed;
      withStoreLock(graphPath, () => {
        const expectedRev = readGraphRev(graphPath);
        const graph = readGraph(graphPath);
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node) throw new Error(`Unknown node ${nodeId}`);
        apply(node, graph);
        writeGraph(graphPath, graph, { expectedRev });
        committed = true;
      });
      if (committed) return;
    } catch (error) {
      if (error?.name === "ConcurrentModificationError" && attempt < retryLimit) continue;
      throw error;
    }
  }
}

// Run a batch of node executions concurrently. Each item is
// { nodeId, harnessId, task, dispatch, apply }:
//   - dispatch(harnessId, task) runs the harness (returns the adapter outcome)
//   - apply(node, graph, outcome) mutates the node to record the result
// Dispatch happens in parallel; each result is persisted through the
// concurrency-safe store. Returns the per-item outcomes.
export async function executeNodesInParallel(graphPath, items) {
  return Promise.all(
    items.map(async (item) => {
      const outcome = await item.dispatch(item.harnessId, item.task);
      persistNodeResult(graphPath, item.nodeId, (node, graph) => item.apply(node, graph, outcome));
      return { nodeId: item.nodeId, harnessId: item.harnessId, outcome };
    })
  );
}
