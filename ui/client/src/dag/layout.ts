// elkjs layout for the Logic DAG canvas (spec §10: React Flow + elkjs).
//
// `toElkGraph` is a pure, testable transform (DAG → elk graph description);
// `layoutLogicDag` runs the async elk layered layout and returns positions by
// node id. We only feed elk edges whose endpoints both exist, matching the edge
// filtering in reactFlowMap (elk otherwise errors on dangling references).
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import type { LogicDag } from "@shared/dag";
import type { XY } from "./reactFlowMap";

export const NODE_W = 244;
export const NODE_H = 108;

const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "72",
  "elk.spacing.nodeNode": "48",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
};

/** Build the elk graph description for a Logic DAG (pure; unit-tested). */
export function toElkGraph(dag: LogicDag): ElkNode {
  return {
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: dag.nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
    edges: dag.edges
      .filter((e) => dag.byId.has(e.from) && dag.byId.has(e.to))
      .map((e) => ({
        id: `${e.from}->${e.to}`,
        sources: [e.from],
        targets: [e.to],
      })),
  };
}

/** Run elk layered layout; resolves to a map of node id → top-left position. */
export async function layoutLogicDag(
  dag: LogicDag,
): Promise<Map<string, XY>> {
  const positions = new Map<string, XY>();
  if (dag.nodes.length === 0) return positions;

  // Dynamic import so elk's ~500KB bundle is code-split out of the initial load.
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();
  const laid = await elk.layout(toElkGraph(dag));
  for (const child of laid.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return positions;
}
