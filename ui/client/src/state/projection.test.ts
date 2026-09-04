import { describe, it, expect } from "vitest";
import {
  reducer,
  initialState,
  projectionFromWire,
  type ClientState,
} from "./projection";
import { makeStep, makeDataset, makeDecision, makeWire } from "../test/factories";

describe("projectionFromWire", () => {
  it("rebuilds the byId index and derives edges for both DAGs", () => {
    const wire = makeWire(
      [makeStep("root"), makeStep("eda", { builds_on: ["root"] })],
      [
        makeDataset("base"),
        makeDataset("feat", { kind: "derived", derived_from: ["base"] }),
      ],
    );
    const p = projectionFromWire(wire);
    expect(p.logic.byId.get("eda")?.title).toBe("eda");
    expect(p.logic.edges).toContainEqual({ from: "root", to: "eda" });
    expect(p.datasets.edges).toContainEqual({ from: "base", to: "feat" });
  });

  it("defaults decisions to [] when the wire omits them (current server)", () => {
    const p = projectionFromWire(makeWire([makeStep("root")]));
    expect(p.decisions).toEqual([]);
  });

  it("carries decisions through when the wire provides them", () => {
    const p = projectionFromWire(
      makeWire([makeStep("root")], [], [makeDecision("d1")]),
    );
    expect(p.decisions.map((d) => d.id)).toEqual(["d1"]);
  });
});

describe("reducer — SSE-update path (state/loaded)", () => {
  it("moves from loading to ready and records the sync timestamp", () => {
    const next = reducer(initialState(), {
      type: "state/loaded",
      wire: makeWire([makeStep("root")]),
      ts: 100,
    });
    expect(next.phase).toBe("ready");
    expect(next.lastSyncTs).toBe(100);
    expect(next.projection.logic.nodes).toHaveLength(1);
  });

  it("preserves a still-present selection across a live refresh", () => {
    let state = reducer(initialState(), {
      type: "state/loaded",
      wire: makeWire([makeStep("root"), makeStep("eda")]),
      ts: 1,
    });
    state = reducer(state, { type: "select/step", id: "eda" });
    // SSE refresh: 'eda' still exists → selection kept
    state = reducer(state, {
      type: "state/loaded",
      wire: makeWire([makeStep("root"), makeStep("eda", { status: "done" })]),
      ts: 2,
    });
    expect(state.selectedStepId).toBe("eda");
    expect(state.projection.logic.byId.get("eda")?.status).toBe("done");
  });

  it("prunes a selection whose step vanished from the new tree", () => {
    let state = reducer(initialState(), {
      type: "state/loaded",
      wire: makeWire([makeStep("root"), makeStep("gone")]),
      ts: 1,
    });
    state = reducer(state, { type: "select/step", id: "gone" });
    state = reducer(state, {
      type: "state/loaded",
      wire: makeWire([makeStep("root")]), // 'gone' removed
      ts: 2,
    });
    expect(state.selectedStepId).toBeNull();
  });

  it("prunes an active decision that is no longer present", () => {
    let state = reducer(initialState(), {
      type: "state/loaded",
      wire: makeWire([makeStep("root")], [], [makeDecision("d1")]),
      ts: 1,
    });
    state = reducer(state, { type: "select/decision", id: "d1" });
    expect(state.activeDecisionId).toBe("d1");
    state = reducer(state, {
      type: "state/loaded",
      wire: makeWire([makeStep("root")], [], []), // decision dropped
      ts: 2,
    });
    expect(state.activeDecisionId).toBeNull();
  });

  it("ignores an out-of-order (stale) load", () => {
    let state = reducer(initialState(), {
      type: "state/loaded",
      wire: makeWire([makeStep("a"), makeStep("b")]),
      ts: 5,
    });
    // a slower, older fetch resolves after → must be ignored
    const stale: ClientState = reducer(state, {
      type: "state/loaded",
      wire: makeWire([makeStep("a")]),
      ts: 3,
    });
    expect(stale.projection.logic.nodes).toHaveLength(2);
    expect(stale.lastSyncTs).toBe(5);
  });
});

describe("reducer — selection", () => {
  it("select/step clears an active decision highlight", () => {
    let state = reducer(initialState(), {
      type: "state/loaded",
      wire: makeWire([makeStep("root")], [], [makeDecision("d1")]),
      ts: 1,
    });
    state = reducer(state, { type: "select/decision", id: "d1" });
    state = reducer(state, { type: "select/step", id: "root" });
    expect(state.selectedStepId).toBe("root");
    expect(state.activeDecisionId).toBeNull();
  });

  it("select/decision toggles off when the same decision is re-picked", () => {
    let state = reducer(initialState(), {
      type: "state/loaded",
      wire: makeWire([makeStep("root")], [], [makeDecision("d1")]),
      ts: 1,
    });
    state = reducer(state, { type: "select/decision", id: "d1" });
    state = reducer(state, { type: "select/decision", id: "d1" });
    expect(state.activeDecisionId).toBeNull();
  });

  it("state/error records the message and error phase", () => {
    const state = reducer(initialState(), {
      type: "state/error",
      error: "boom",
    });
    expect(state.phase).toBe("error");
    expect(state.error).toBe("boom");
  });
});
