import { describe, it, expect } from "vitest";
import { buildDag, type LogicDag, type LogicNode } from "@shared/dag";
import {
  toReactFlow,
  toReactFlowEdges,
  highlightForDecision,
  countByStatus,
  type XY,
} from "./reactFlowMap";
import { makeStep, makeDecision } from "../test/factories";

function logicDag(nodes: LogicNode[]): LogicDag {
  return buildDag(nodes, (n) => n.builds_on);
}

describe("toReactFlow — DAG model → React Flow nodes/edges", () => {
  it("maps every node and derives one edge per builds_on parent (multi-parent)", () => {
    const dag = logicDag([
      makeStep("root", { status: "done" }),
      makeStep("eda", { builds_on: ["root"], status: "done" }),
      makeStep("leak", { builds_on: ["root"], status: "done" }),
      // multi-parent: builds on two prior steps
      makeStep("model", { builds_on: ["eda", "leak"], status: "running" }),
    ]);

    const { nodes, edges } = toReactFlow(dag);

    expect(nodes.map((n) => n.id).sort()).toEqual(
      ["eda", "leak", "model", "root"].sort(),
    );
    // model has two incoming edges → multi-parent preserved
    const intoModel = edges.filter((e) => e.target === "model");
    expect(intoModel.map((e) => e.source).sort()).toEqual(["eda", "leak"]);
    expect(edges.map((e) => e.id)).toContain("eda->model");
    expect(edges).toHaveLength(4); // root→eda, root→leak, eda→model, leak→model
  });

  it("drops edges to a missing parent (dangling builds_on) so React Flow won't throw", () => {
    const dag = logicDag([
      // 'ghost' parent is not present as a node
      makeStep("child", { builds_on: ["ghost"] }),
    ]);
    expect(toReactFlowEdges(dag)).toEqual([]);
  });

  it("applies elk positions and defaults missing ones to the origin", () => {
    const dag = logicDag([makeStep("a"), makeStep("b")]);
    const positions = new Map<string, XY>([["a", { x: 10, y: 20 }]]);
    const { nodes } = toReactFlow(dag, { positions });
    const a = nodes.find((n) => n.id === "a");
    const b = nodes.find((n) => n.id === "b");
    expect(a?.position).toEqual({ x: 10, y: 20 });
    expect(b?.position).toEqual({ x: 0, y: 0 });
  });

  it("flags the selected node and marks proposed nodes (no action control)", () => {
    const dag = logicDag([
      makeStep("done1", { status: "done" }),
      makeStep("prop1", { status: "proposed" }),
    ]);
    const { nodes } = toReactFlow(dag, { selectedId: "done1" });
    const done1 = nodes.find((n) => n.id === "done1");
    const prop1 = nodes.find((n) => n.id === "prop1");
    expect(done1?.data.selected).toBe(true);
    expect(done1?.data.isProposed).toBe(false);
    expect(prop1?.data.selected).toBe(false);
    expect(prop1?.data.isProposed).toBe(true);
  });

  it("dims nodes and edges outside an active highlight set", () => {
    const dag = logicDag([
      makeStep("root", { status: "done" }),
      makeStep("eda", { builds_on: ["root"], status: "done" }),
      makeStep("other", { status: "done" }),
    ]);
    const highlight = new Set(["root", "eda"]);
    const { nodes, edges } = toReactFlow(dag, { highlight });

    expect(nodes.find((n) => n.id === "eda")?.data.dimmed).toBe(false);
    expect(nodes.find((n) => n.id === "other")?.data.dimmed).toBe(true);
    // root→eda is inside the set → not dimmed
    expect(edges.find((e) => e.id === "root->eda")?.className).toBe("");
  });

  it("leaves everything undimmed when no highlight is active", () => {
    const dag = logicDag([makeStep("a"), makeStep("b", { builds_on: ["a"] })]);
    const { nodes, edges } = toReactFlow(dag, { highlight: null });
    expect(nodes.every((n) => n.data.dimmed === false)).toBe(true);
    expect(edges.every((e) => e.className === "")).toBe(true);
  });
});

describe("highlightForDecision", () => {
  it("collects supporting steps plus all ancestors via builds_on", () => {
    const dag = logicDag([
      makeStep("root"),
      makeStep("eda", { builds_on: ["root"] }),
      makeStep("feat", { builds_on: ["eda"] }),
      makeStep("cat", { builds_on: ["feat"] }),
      makeStep("unrelated"),
    ]);
    const decision = makeDecision("d", { supporting_steps: ["cat"] });
    const set = highlightForDecision(dag, decision);
    expect([...set].sort()).toEqual(["cat", "eda", "feat", "root"].sort());
    expect(set.has("unrelated")).toBe(false);
  });

  it("merges the ancestries of multiple supporting steps and ignores unknown ids", () => {
    const dag = logicDag([
      makeStep("root"),
      makeStep("a", { builds_on: ["root"] }),
      makeStep("b", { builds_on: ["root"] }),
    ]);
    const decision = makeDecision("d", {
      supporting_steps: ["a", "b", "ghost"],
    });
    const set = highlightForDecision(dag, decision);
    expect([...set].sort()).toEqual(["a", "b", "root"].sort());
  });

  it("does not loop forever on a shared ancestor reached twice", () => {
    // diamond: d1 and d2 both build on root; model builds on both
    const dag = logicDag([
      makeStep("root"),
      makeStep("d1", { builds_on: ["root"] }),
      makeStep("d2", { builds_on: ["root"] }),
      makeStep("model", { builds_on: ["d1", "d2"] }),
    ]);
    const set = highlightForDecision(
      dag,
      makeDecision("d", { supporting_steps: ["model"] }),
    );
    expect([...set].sort()).toEqual(["d1", "d2", "model", "root"].sort());
  });
});

describe("countByStatus", () => {
  it("tallies every status bucket", () => {
    const dag = logicDag([
      makeStep("a", { status: "done" }),
      makeStep("b", { status: "done" }),
      makeStep("c", { status: "running" }),
      makeStep("d", { status: "proposed" }),
      makeStep("e", { status: "dead-end" }),
      makeStep("f", { status: "abandoned" }),
    ]);
    expect(countByStatus(dag)).toEqual({
      done: 2,
      running: 1,
      proposed: 1,
      "dead-end": 1,
      abandoned: 1,
    });
  });
});
