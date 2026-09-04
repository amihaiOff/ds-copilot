// React binding for the client store: seeds from GET /api/state, then keeps the
// projection live by refetching whenever the SSE stream signals a change.
//
// The reducer owns all state transitions (see projection.ts); this hook only
// wires side effects (fetch + subscribe) to dispatch. Read-only throughout.
import { useEffect, useReducer, useRef } from "react";
import { fetchState, subscribeEvents } from "../api/client";
import {
  reducer,
  initialState,
  type Action,
  type ClientState,
} from "./projection";

export interface UseProjection {
  state: ClientState;
  dispatch: (action: Action) => void;
  /** Force a refetch (also invoked on every SSE update). */
  refresh: () => void;
}

export function useProjection(): UseProjection {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  // Keep the latest dispatch stable for the effect below.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const refresh = useRef(async () => {
    try {
      const wire = await fetchState();
      dispatchRef.current({ type: "state/loaded", wire, ts: Date.now() });
    } catch (err) {
      dispatchRef.current({
        type: "state/error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }).current;

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeEvents(() => void refresh());
    return unsubscribe;
  }, [refresh]);

  return { state, dispatch, refresh };
}
