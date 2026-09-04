import { describe, it, expect } from "vitest";
import { buildDag, type LogicNode } from "@shared/dag";
import { toElkGraph, NODE_W, NODE_H } from "./layout";
import { makeStep } from "../test/factories";

function dag(nodes: LogicNode[]) {
  return buildDag(nodes, (n) => n.builds_on);
}

describe("toElkGraph", () => {
  it("emits one sized child per node and one edge per builds_on parent", () => {
    const g = toElkGraph(
      dag([
        makeStep("root"),
        makeStep("a", { builds_on: ["root"] }),
        makeStep("b", { builds_on: ["root", "a"] }),
      ]),
    );
    expect(g.children).toHaveLength(3);
    expect(g.children?.[0]).toMatchObject({ width: NODE_W, height: NODE_H });
    expect(g.edges).toHaveLength(3); // root→a, root→b, a→b
  });

  it("omits edges to a missing parent (elk errors on dangling refs)", () => {
    const g = toElkGraph(dag([makeStep("child", { builds_on: ["ghost"] })]));
    expect(g.edges).toEqual([]);
  });
});
