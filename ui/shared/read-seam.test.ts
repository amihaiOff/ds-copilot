import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readLogicDag, readDatasetDag, parseStep } from "./read-seam";
import { computeFrontier } from "./dag";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, "__fixtures__", name);

const ROOT = "01J9ZXAAAAAAAAAAAAAAAAAAAA-root";
const EDA = "01J9ZXBBBBBBBBBBBBBBBBBBBB-eda";
const LEAKAGE = "01J9ZXCCCCCCCCCCCCCCCCCCCC-leakage";
const MODEL = "01J9ZXDDDDDDDDDDDDDDDDDDDD-model";
const ABANDON = "01J9ZXEEEEEEEEEEEEEEEEEEEE-abandon";
const DEADEND = "01J9ZXFFFFFFFFFFFFFFFFFFFF-deadend";

function edgeSet(edges: { from: string; to: string }[]): Set<string> {
  return new Set(edges.map((e) => `${e.from}->${e.to}`));
}

describe("readLogicDag — parse steps/ into a multi-parent Logic DAG", () => {
  const dag = readLogicDag(join(fixture("logic-dag"), "steps"));

  it("parses every step into a node keyed by id", () => {
    expect(dag.nodes).toHaveLength(6);
    expect([...dag.byId.keys()].sort()).toEqual(
      [ROOT, EDA, LEAKAGE, MODEL, ABANDON, DEADEND].sort(),
    );
  });

  it("derives child-owned builds_on edges, including a multi-parent node", () => {
    const edges = edgeSet(dag.edges);
    // root has two direct children, plus abandoned child
    expect(edges.has(`${ROOT}->${EDA}`)).toBe(true);
    expect(edges.has(`${ROOT}->${LEAKAGE}`)).toBe(true);
    expect(edges.has(`${ROOT}->${ABANDON}`)).toBe(true);
    // MODEL is multi-parent: builds on both EDA and LEAKAGE
    expect(edges.has(`${EDA}->${MODEL}`)).toBe(true);
    expect(edges.has(`${LEAKAGE}->${MODEL}`)).toBe(true);
    // dead-end hangs off EDA
    expect(edges.has(`${EDA}->${DEADEND}`)).toBe(true);
    expect(dag.edges).toHaveLength(6);

    const model = dag.byId.get(MODEL);
    expect(model?.builds_on).toEqual([EDA, LEAKAGE]);
  });

  it("carries typed frontmatter fields and the goal body onto each node", () => {
    const model = dag.byId.get(MODEL);
    expect(model?.kind).toBe("experiment");
    expect(model?.status).toBe("running");
    expect(model?.created).toBe("2026-09-03"); // Date coerced to YYYY-MM-DD
    expect(model?.code_ref?.entrypoint).toBe("code/main.py");
    expect(model?.goal).toContain("Train a CatBoost baseline");

    const root = dag.byId.get(ROOT);
    expect(root?.builds_on).toEqual([]);
    expect(root?.code_ref).toBeNull();
  });
});

describe("computeFrontier — §8 frontier semantics", () => {
  it("prefers running steps and excludes abandoned + dead-end", () => {
    const dag = readLogicDag(join(fixture("logic-dag"), "steps"));
    const frontier = computeFrontier(dag).map((n) => n.id);
    expect(frontier).toEqual([MODEL]); // the only running step
    expect(frontier).not.toContain(ABANDON);
    expect(frontier).not.toContain(DEADEND);
  });

  it("falls back to live leaves when nothing is running, terminals excluded", () => {
    const dag = readLogicDag(join(fixture("frontier-leaves"), "steps"));
    const frontier = computeFrontier(dag).map((n) => n.id);
    // The live leaf is the only frontier member; its child is a dead-end
    // (terminal → ignored for leaf-ness), and the abandoned sibling is excluded.
    expect(frontier).toEqual(["01J9ZXH000000000000000000H-leaf"]);
  });
});

describe("readDatasetDag — parse datasets/ into a lineage DAG", () => {
  const dag = readDatasetDag(join(fixture("dataset-lineage"), "datasets"));
  const BASE = "01J9ZXDSA0000000000000000A-churn-base";
  const FEATURED = "01J9ZXDSB0000000000000000B-churn-featured";
  const TRAIN = "01J9ZXDSC0000000000000000C-churn-train";

  it("parses each dataset and derives child-owned derived_from edges", () => {
    expect(dag.nodes).toHaveLength(3);
    const edges = edgeSet(dag.edges);
    expect(edges.has(`${BASE}->${FEATURED}`)).toBe(true);
    // TRAIN is multi-parent in the lineage DAG
    expect(edges.has(`${BASE}->${TRAIN}`)).toBe(true);
    expect(edges.has(`${FEATURED}->${TRAIN}`)).toBe(true);
    expect(dag.edges).toHaveLength(3);
  });

  it("keeps a grounded dataset parentless and preserves unknown fields", () => {
    const base = dag.byId.get(BASE);
    expect(base?.kind).toBe("grounded");
    expect(base?.derived_from).toEqual([]);
    expect(base?.row_count).toBe(100000);

    const train = dag.byId.get(TRAIN);
    expect(train?.kind).toBe("derived");
    expect(train?.status).toBe("partial");
    expect(train?.row_count).toBe("unknown"); // §7: recorded, never omitted
    expect(train?.file_bytes).toBe("unknown");
  });
});

describe("parseStep — pure content parse", () => {
  it("validates frontmatter and trims the body", () => {
    const { frontmatter, body } = parseStep(
      [
        "---",
        "id: 01TEST0000000000000000000-x-hello",
        "title: Hello",
        "kind: analysis",
        "status: proposed",
        "created: 2026-09-04",
        "---",
        "",
        "Body text.",
        "",
      ].join("\n"),
    );
    expect(frontmatter.id).toBe("01TEST0000000000000000000-x-hello");
    expect(frontmatter.builds_on).toEqual([]); // defaulted
    expect(frontmatter.dataset_ref).toBeNull(); // defaulted
    expect(frontmatter.code_ref).toBeNull(); // defaulted
    expect(body).toBe("Body text.");
  });

  it("rejects an invalid status", () => {
    expect(() =>
      parseStep(
        ["---", "id: x", "title: X", "kind: analysis", "status: bogus", "created: 2026-09-04", "---", ""].join(
          "\n",
        ),
      ),
    ).toThrow();
  });
});
