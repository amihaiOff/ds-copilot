// The in-memory DAG model — the projection the read-seam builds by scanning
// `steps/` and `datasets/` (ADR 0001: derived, never stored).
//
// Two separate DAGs (§2): the Logic DAG of steps (builds-on edges) and the
// Dataset lineage DAG (derived-from edges). Both edges are owned by the child.
import type { StepFrontmatter, DatasetFrontmatter, StepStatus } from "./schema";
import { TERMINAL_STATUSES } from "./schema";

// --- node / edge / dag model ------------------------------------------------

// A directed edge from parent → child. For the Logic DAG the child declares the
// edge via `builds_on`; for the Dataset DAG via `derived_from`.
export interface DagEdge {
  from: string; // parent id
  to: string; // child id
}

// A Logic DAG node: parsed step frontmatter + where it lives + its goal/brief body.
export interface LogicNode extends StepFrontmatter {
  path: string; // absolute path to the step directory
  goal: string; // the step.md body (goal/brief text), trimmed
}

// A Dataset lineage node: parsed dataset frontmatter + where it lives + its body.
export interface DatasetNode extends DatasetFrontmatter {
  path: string; // absolute path to the dataset directory
  body: string; // the dataset.md body (columns/meaning/…), trimmed
}

export interface Dag<TNode extends { id: string }> {
  nodes: TNode[];
  edges: DagEdge[];
  byId: Map<string, TNode>;
}

export type LogicDag = Dag<LogicNode>;
export type DatasetDag = Dag<DatasetNode>;

// Build a Dag from nodes, deriving edges from each node's child-owned parent list.
export function buildDag<TNode extends { id: string }>(
  nodes: TNode[],
  parentsOf: (node: TNode) => readonly string[],
): Dag<TNode> {
  const byId = new Map<string, TNode>();
  for (const node of nodes) byId.set(node.id, node);

  const edges: DagEdge[] = [];
  for (const node of nodes) {
    for (const parent of parentsOf(node)) {
      edges.push({ from: parent, to: node.id });
    }
  }
  return { nodes, edges, byId };
}

// --- frontier (§8) ----------------------------------------------------------

function isTerminal(status: StepStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * The active frontier of the Logic DAG (spec §8):
 *   - if any steps are `running`, the frontier is exactly those running steps;
 *   - otherwise it is the DAG leaves (nodes with no active children).
 * `abandoned` and `dead-end` are terminal and excluded entirely — they never
 * appear in the frontier, and they are ignored when deciding whether a node is a
 * leaf (so a branch that dead-ended surfaces its last live ancestor).
 */
export function computeFrontier(dag: LogicDag): LogicNode[] {
  const active = dag.nodes.filter((n) => !isTerminal(n.status));

  const running = active.filter((n) => n.status === "running");
  if (running.length > 0) return running;

  const activeIds = new Set(active.map((n) => n.id));
  const hasActiveChild = new Set<string>();
  for (const edge of dag.edges) {
    if (activeIds.has(edge.from) && activeIds.has(edge.to)) {
      hasActiveChild.add(edge.from);
    }
  }
  return active.filter((n) => !hasActiveChild.has(n.id));
}
