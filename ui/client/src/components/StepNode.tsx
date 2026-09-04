// Custom React Flow node for a Logic Step. Purely presentational — it reflects
// status/kind and selection/dim flags computed by reactFlowMap. Crucially, a
// `proposed` node shows NO action control: running a step is conversation-only
// (spec §1/§10), and this UI is read-only.
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { RFNodeData } from "../dag/reactFlowMap";

const STATUS_LABEL: Record<RFNodeData["status"], string> = {
  proposed: "Proposed",
  running: "Running",
  done: "Done",
  "dead-end": "Dead-end",
  abandoned: "Abandoned",
};

export function StepNode({ data }: NodeProps): JSX.Element {
  // React Flow types node data as a generic record; we own the shape.
  const d = data as unknown as RFNodeData;
  const cls = [
    "step-node",
    `st-${d.status}`,
    d.selected ? "sel" : "",
    d.dimmed ? "dim" : "",
    d.isProposed ? "proposed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="step-node-top">
        <span className="kind">{d.node.kind.toUpperCase()}</span>
        <span className="status">
          {d.status === "running" ? <span className="running-dot" /> : null}
          {STATUS_LABEL[d.status]}
        </span>
      </div>
      <div className="step-node-title">{d.node.title}</div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export const nodeTypes = { step: StepNode };
