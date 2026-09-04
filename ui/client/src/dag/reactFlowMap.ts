// Pure mapping: Logic DAG model → React Flow nodes/edges.
//
// This is the load-bearing client logic (S7 done-check). It is deliberately
// framework-light — it emits plain node/edge records React Flow consumes, so it
// can be unit-tested without a DOM. Concerns handled here:
//   - multi-parent edges (one edge per `builds_on` parent);
//   - dangling parents are dropped (React Flow throws on an edge to a missing
//     node), so an edge survives only when BOTH endpoints exist;
//   - selection + decision-highlight dimming;
//   - `proposed` nodes are flagged so the renderer shows NO action control.
import type { LogicDag, LogicNode } from "@shared/dag";
import type { StepStatus } from "@shared/schema";
import type { DecisionRecord } from "../state/projection";

export interface XY {
  x: number;
  y: number;
}

export interface RFNodeData {
  node: LogicNode;
  status: StepStatus;
  selected: boolean;
  /** Dimmed when a decision highlight is active and this node is not in it. */
  dimmed: boolean;
  /** `proposed` → the renderer must show no run/action control (read-only). */
  isProposed: boolean;
}

export interface RFNode {
  id: string;
  type: "step";
  position: XY;
  data: RFNodeData;
}

export interface RFEdge {
  id: string;
  source: string;
  target: string;
  /** "dim" when a highlight is active and this edge is outside it. */
  className: string;
}

export interface MappingOptions {
  /** Layout positions by node id (from elk). Missing → origin. */
  positions?: ReadonlyMap<string, XY>;
  selectedId?: string | null;
  /** When non-null, nodes/edges outside the set are dimmed. */
  highlight?: ReadonlySet<string> | null;
}

const ORIGIN: XY = { x: 0, y: 0 };

export function toReactFlowNodes(
  dag: LogicDag,
  opts: MappingOptions = {},
): RFNode[] {
  const { positions, selectedId = null, highlight = null } = opts;
  return dag.nodes.map((node) => ({
    id: node.id,
    type: "step",
    position: positions?.get(node.id) ?? ORIGIN,
    data: {
      node,
      status: node.status,
      selected: node.id === selectedId,
      dimmed: highlight !== null && !highlight.has(node.id),
      isProposed: node.status === "proposed",
    },
  }));
}

export function toReactFlowEdges(
  dag: LogicDag,
  opts: MappingOptions = {},
): RFEdge[] {
  const { highlight = null } = opts;
  const edges: RFEdge[] = [];
  for (const edge of dag.edges) {
    // Drop edges whose endpoints aren't both present (dangling builds_on).
    if (!dag.byId.has(edge.from) || !dag.byId.has(edge.to)) continue;
    const dimmed =
      highlight !== null &&
      !(highlight.has(edge.from) && highlight.has(edge.to));
    edges.push({
      id: `${edge.from}->${edge.to}`,
      source: edge.from,
      target: edge.to,
      className: dimmed ? "dim" : "",
    });
  }
  return edges;
}

export interface ReactFlowGraph {
  nodes: RFNode[];
  edges: RFEdge[];
}

export function toReactFlow(
  dag: LogicDag,
  opts: MappingOptions = {},
): ReactFlowGraph {
  return { nodes: toReactFlowNodes(dag, opts), edges: toReactFlowEdges(dag, opts) };
}

/**
 * The highlight set for a decision: its supporting steps plus every ancestor
 * (walk `builds_on` upward). Selecting a decision highlights the analytical
 * subtree that supports it (spec §10 / ticket #5). Unknown ids are ignored.
 */
export function highlightForDecision(
  dag: LogicDag,
  decision: DecisionRecord,
): Set<string> {
  const keep = new Set<string>();
  const walk = (id: string): void => {
    if (keep.has(id)) return;
    const node = dag.byId.get(id);
    if (!node) return; // supporting step not in the tree — skip
    keep.add(id);
    for (const parent of node.builds_on) walk(parent);
  };
  for (const id of decision.supporting_steps) walk(id);
  return keep;
}

// --- small projections the rail uses ----------------------------------------

export type StatusCounts = Record<StepStatus, number>;

export function countByStatus(dag: LogicDag): StatusCounts {
  const counts: StatusCounts = {
    proposed: 0,
    running: 0,
    done: 0,
    "dead-end": 0,
    abandoned: 0,
  };
  for (const node of dag.nodes) counts[node.status] += 1;
  return counts;
}
