// The read-only wire to the companion server (spec §10). Two calls only:
//   - GET /api/state   → the parsed DAG model (re-derived server-side per read);
//   - GET /api/events  → an SSE stream that pushes an "update" on any change.
// There is NO write path — the browser never mutates state.
import type { WireState } from "../state/projection";

export async function fetchState(signal?: AbortSignal): Promise<WireState> {
  const res = await fetch("/api/state", { signal });
  if (!res.ok) throw new Error(`GET /api/state → ${res.status}`);
  return (await res.json()) as WireState;
}

/**
 * Subscribe to server-sent update events. The server emits `event: update` on
 * any change under `steps/`/`datasets/`; the payload is only a timestamp — the
 * client refetches `/api/state` in response (the DAG is always re-derived).
 * EventSource auto-reconnects, so we surface `onError` for status only.
 * Returns an unsubscribe function.
 */
export function subscribeEvents(
  onUpdate: () => void,
  onError?: (ev: Event) => void,
): () => void {
  const source = new EventSource("/api/events");
  source.addEventListener("update", () => onUpdate());
  if (onError) source.addEventListener("error", onError);
  return () => source.close();
}
