// The DAG canvas (spec §10): React Flow renders the multi-parent Logic DAG,
// elkjs lays it out. Layout runs when the graph's topology changes (not on every
// selection/highlight tick) so panning/zoom stay stable during live updates.
//
// Read-only: nodes aren't draggable or connectable, and there is no add/run
// affordance anywhere.
import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LogicDag } from "@shared/dag";
import { toReactFlow, type XY } from "../dag/reactFlowMap";
import { layoutLogicDag } from "../dag/layout";
import { nodeTypes } from "./StepNode";

const MINIMAP_COLOR: Record<string, string> = {
  done: "#0ca30c",
  running: "#2a78d6",
  proposed: "#898781",
  "dead-end": "#d03b3b",
  abandoned: "#c9c7bf",
};

export interface DagCanvasProps {
  dag: LogicDag;
  selectedId: string | null;
  highlight: ReadonlySet<string> | null;
  onSelect: (id: string | null) => void;
}

export function DagCanvas({
  dag,
  selectedId,
  highlight,
  onSelect,
}: DagCanvasProps): JSX.Element {
  const [positions, setPositions] = useState<Map<string, XY>>(new Map());

  // A stable key over topology only (ids + parent lists): re-layout when the
  // shape changes, not when a status flips or the selection moves.
  const topologyKey = useMemo(
    () =>
      dag.nodes
        .map((n) => `${n.id}:${[...n.builds_on].sort().join(",")}`)
        .sort()
        .join("|"),
    [dag],
  );

  useEffect(() => {
    let cancelled = false;
    void layoutLogicDag(dag).then((p) => {
      if (!cancelled) setPositions(p);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyKey]);

  const { nodes, edges } = useMemo(() => {
    const graph = toReactFlow(dag, { positions, selectedId, highlight });
    const rfNodes: Node[] = graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data as unknown as Record<string, unknown>,
    }));
    const rfEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      className: e.className,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    }));
    return { nodes: rfNodes, edges: rfEdges };
  }, [dag, positions, selectedId, highlight]);

  return (
    <div className="dag-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const d = n.data as unknown as { status?: string };
            return MINIMAP_COLOR[d.status ?? "proposed"] ?? "#898781";
          }}
        />
      </ReactFlow>
    </div>
  );
}
