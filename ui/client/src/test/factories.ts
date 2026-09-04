// Test factories for building Logic/Dataset DAG wire payloads without touching
// disk. Mirrors the S1 node shapes (`@shared/dag`) so client-logic tests exercise
// the exact projection the server sends.
import type { LogicNode, DatasetNode } from "@shared/dag";
import type { StepStatus, StepKind } from "@shared/schema";
import type { WireState, DecisionRecord } from "../state/projection";

export function makeStep(
  id: string,
  overrides: Partial<LogicNode> = {},
): LogicNode {
  const status: StepStatus = overrides.status ?? "proposed";
  const kind: StepKind = overrides.kind ?? "analysis";
  return {
    id,
    title: overrides.title ?? id,
    kind,
    builds_on: overrides.builds_on ?? [],
    status,
    dataset_ref: overrides.dataset_ref ?? null,
    code_ref: overrides.code_ref ?? null,
    created: overrides.created ?? "2026-09-01",
    path: overrides.path ?? `/steps/${id}`,
    goal: overrides.goal ?? `goal of ${id}`,
  };
}

export function makeDataset(
  id: string,
  overrides: Partial<DatasetNode> = {},
): DatasetNode {
  return {
    id,
    kind: overrides.kind ?? "grounded",
    derived_from: overrides.derived_from ?? [],
    grain: overrides.grain ?? "one row per unit",
    keys: overrides.keys ?? ["id"],
    row_count: overrides.row_count ?? 100,
    content_hash: overrides.content_hash ?? "deadbeef",
    file_bytes: overrides.file_bytes ?? 1024,
    created: overrides.created ?? "2026-09-01",
    status: overrides.status ?? "grounded",
    path: overrides.path ?? `/datasets/${id}`,
    body: overrides.body ?? `body of ${id}`,
  };
}

export function makeDecision(
  id: string,
  overrides: Partial<DecisionRecord> = {},
): DecisionRecord {
  return {
    id,
    statement: overrides.statement ?? `decision ${id}`,
    rationale: overrides.rationale,
    made_by: overrides.made_by ?? "human",
    made_at: overrides.made_at ?? "2026-09-02",
    supporting_steps: overrides.supporting_steps ?? [],
    supporting_assets: overrides.supporting_assets,
    step_id: overrides.step_id,
  };
}

export function makeWire(
  steps: LogicNode[],
  datasets: DatasetNode[] = [],
  decisions?: DecisionRecord[],
): WireState {
  const wire: WireState = {
    logic: { nodes: steps, edges: [] },
    datasets: { nodes: datasets, edges: [] },
  };
  if (decisions) wire.decisions = decisions;
  return wire;
}
