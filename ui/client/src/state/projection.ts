// Client-side state: the projection the browser holds, and the reducer that
// folds server loads + SSE-driven refreshes + user selection into it.
//
// The client is a STRICTLY READ-ONLY projection (spec §10): it fetches the DAG
// model from the companion server, rebuilds the in-memory index, and re-renders.
// There is no write path anywhere. The reducer's only job is to keep the derived
// projection and the user's selection coherent across live updates.
import {
  buildDag,
  type LogicDag,
  type LogicNode,
  type DatasetDag,
  type DatasetNode,
  type DagEdge,
} from "@shared/dag";

// --- wire shape (mirrors ui/server `WireState`) -----------------------------
//
// The server drops the `byId` Map (it doesn't survive JSON); nodes+edges fully
// describe each DAG and we rebuild the index below. `decisions` is optional and
// forward-compatible: the current server does not emit decisions (they live in
// `steps/<id>/decisions/*.md`, which the read-seam does not yet parse), so the
// client tolerates their absence and renders an empty rail.
export interface WireDag<TNode> {
  nodes: TNode[];
  edges: DagEdge[];
}

export interface WireState {
  logic: WireDag<LogicNode>;
  datasets: WireDag<DatasetNode>;
  decisions?: DecisionRecord[];
}

// --- decisions & assets (client view types) ---------------------------------

/** A first-class Decision record (spec §3.3), as the client would render it. */
export interface DecisionRecord {
  id: string;
  statement: string;
  rationale?: string;
  made_by?: string;
  made_at?: string;
  /** Step ids whose conclusions the decision rests on (spec: supports). */
  supporting_steps: string[];
  /** Asset ids cited by the decision. */
  supporting_assets?: string[];
  /** The step directory this decision is homed on (`steps/<id>/decisions/`). */
  step_id?: string;
}

// --- the derived projection -------------------------------------------------

export interface Projection {
  logic: LogicDag;
  datasets: DatasetDag;
  decisions: DecisionRecord[];
}

/** Rebuild both DAG indexes from a wire payload; edges are re-derived (ADR 0001). */
export function projectionFromWire(wire: WireState): Projection {
  return {
    logic: buildDag(wire.logic.nodes, (n) => n.builds_on),
    datasets: buildDag(wire.datasets.nodes, (n) => n.derived_from),
    decisions: wire.decisions ?? [],
  };
}

export function emptyProjection(): Projection {
  return {
    logic: { nodes: [], edges: [], byId: new Map() },
    datasets: { nodes: [], edges: [], byId: new Map() },
    decisions: [],
  };
}

// --- reducer ----------------------------------------------------------------

export type LoadPhase = "loading" | "ready" | "error";

export interface ClientState {
  projection: Projection;
  phase: LoadPhase;
  error: string | null;
  /** Currently inspected step, or null. */
  selectedStepId: string | null;
  /** Currently active decision (highlights its supporting subtree), or null. */
  activeDecisionId: string | null;
  /** Monotonic timestamp of the last applied server state (from SSE or initial). */
  lastSyncTs: number | null;
}

export function initialState(): ClientState {
  return {
    projection: emptyProjection(),
    phase: "loading",
    error: null,
    selectedStepId: null,
    activeDecisionId: null,
    lastSyncTs: null,
  };
}

export type Action =
  // Initial load AND every SSE-driven refresh both dispatch `state/loaded`:
  // the SSE handler refetches, then hands the fresh wire here. `ts` lets us
  // ignore out-of-order deliveries.
  | { type: "state/loaded"; wire: WireState; ts: number }
  | { type: "state/error"; error: string }
  | { type: "select/step"; id: string | null }
  | { type: "select/decision"; id: string | null };

/**
 * Fold an action into client state.
 *
 * The interesting logic is `state/loaded`, the SSE-update path: a live refresh
 * must NOT clobber the user's current selection — but it MUST prune a selection
 * whose target vanished from the new tree (a step abandoned/removed, a decision
 * dropped), otherwise the inspector would point at nothing. Stale (older `ts`)
 * loads are ignored so a slow initial fetch can't overwrite a newer SSE refresh.
 */
export function reducer(state: ClientState, action: Action): ClientState {
  switch (action.type) {
    case "state/loaded": {
      if (state.lastSyncTs !== null && action.ts < state.lastSyncTs) {
        return state; // out-of-order: keep the newer state
      }
      const projection = projectionFromWire(action.wire);
      const selectedStepId =
        state.selectedStepId !== null &&
        projection.logic.byId.has(state.selectedStepId)
          ? state.selectedStepId
          : null;
      const activeDecisionId =
        state.activeDecisionId !== null &&
        projection.decisions.some((d) => d.id === state.activeDecisionId)
          ? state.activeDecisionId
          : null;
      return {
        ...state,
        projection,
        phase: "ready",
        error: null,
        selectedStepId,
        activeDecisionId,
        lastSyncTs: action.ts,
      };
    }
    case "state/error":
      return { ...state, phase: "error", error: action.error };
    case "select/step":
      // Selecting a step clears any active decision highlight.
      return { ...state, selectedStepId: action.id, activeDecisionId: null };
    case "select/decision": {
      // Toggle: re-picking the active decision clears it.
      const next = state.activeDecisionId === action.id ? null : action.id;
      return { ...state, activeDecisionId: next };
    }
    default:
      return state;
  }
}
