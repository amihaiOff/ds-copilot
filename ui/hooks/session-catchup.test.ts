import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildCatchup,
  buildStructuralIndex,
  buildFrontierInline,
  collectDecisionStatements,
  extractDecisionStatement,
} from "./session-catchup";
import { readState, computeFrontier } from "@shared/index";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, "__fixtures__", name);

const RUNNING = fixture("running-tree");
const LEAVES = fixture("leaves-tree");

const RT = {
  root: "01HRUN000000000000000000R1-root",
  eda: "01HRUN000000000000000000E2-eda",
  model: "01HRUN000000000000000000M3-model",
  deadend: "01HRUN000000000000000000D4-deadend",
};
const LV = {
  root: "01HLEAF00000000000000000R1-root",
  leafa: "01HLEAF00000000000000000A2-leafa",
  leafb: "01HLEAF00000000000000000B3-leafb",
  abandoned: "01HLEAF00000000000000000X4-abandoned",
};

describe("structural index — covers every step", () => {
  it("emits one line per step with id/title/kind/status/parents/path", () => {
    const { logic } = readState(RUNNING);
    const index = buildStructuralIndex(logic, RUNNING);
    const lines = index.split("\n");
    expect(lines).toHaveLength(4); // root, eda, model, deadend — terminals included here

    // every step id appears exactly once
    for (const id of Object.values(RT)) {
      expect(index).toContain(id);
    }
    // a representative line carries all six fields incl. child-owned parents + rel path
    const modelLine = lines.find((l) => l.includes(RT.model))!;
    expect(modelLine).toContain("CatBoost baseline");
    expect(modelLine).toContain("experiment");
    expect(modelLine).toContain("running");
    expect(modelLine).toContain(`parents: ${RT.eda}`);
    expect(modelLine).toContain(join("steps", RT.model));
  });
});

describe("frontier inline — running steps only", () => {
  it("inlines logic_process.md + results.md of the running step, excludes the rest", () => {
    const { logic } = readState(RUNNING);
    const frontier = computeFrontier(logic);
    expect(frontier.map((n) => n.id)).toEqual([RT.model]); // only running step

    const inline = buildFrontierInline(frontier);
    // the running step's curated logic + results are inlined verbatim
    expect(inline).toContain("dispatched a CatBoost fit");
    expect(inline).toContain("first fold AUC 0.81");
    // non-frontier steps (done root/eda, dead-end) are NOT inlined
    expect(inline).not.toContain("Profiled columns"); // eda logic_process
    expect(inline).not.toContain("Root framing accepted"); // root results
  });
});

describe("frontier inline — falls back to live leaves when nothing runs", () => {
  it("inlines both leaves, excludes the abandoned sibling", () => {
    const { logic } = readState(LEAVES);
    const frontier = computeFrontier(logic);
    expect(frontier.map((n) => n.id).sort()).toEqual([LV.leafa, LV.leafb].sort());
    expect(frontier.map((n) => n.id)).not.toContain(LV.abandoned);

    const inline = buildFrontierInline(frontier);
    expect(inline).toContain("SHAP values"); // leafa
    expect(inline).toContain("reliability curve"); // leafb
  });
});

describe("decisions — every statement, one line each", () => {
  it("lists all decisions across the tree, no rationale", () => {
    const { logic } = readState(RUNNING);
    const decisions = collectDecisionStatements(logic, RUNNING);
    const lines = decisions.split("\n");
    expect(lines).toHaveLength(2);
    expect(decisions).toContain("Use AUC as the primary target metric.");
    expect(decisions).toContain("Truncate renewals at 12 months.");
    // rationale bodies are excluded
    expect(decisions).not.toContain("Class imbalance");
    expect(decisions).not.toContain("Long tails");
  });

  it("falls back to the first heading when there is no statement frontmatter", () => {
    const { statement, id } = extractDecisionStatement(
      ["---", "id: 01HDECX", "---", "", "# Drop the leaky feature", "reasons..."].join("\n"),
      "fallback-id",
    );
    expect(id).toBe("01HDECX");
    expect(statement).toBe("Drop the leaky feature");
  });

  it("uses the filename as id when frontmatter omits it", () => {
    const { logic } = readState(LEAVES);
    const decisions = collectDecisionStatements(logic, LEAVES);
    expect(decisions).toContain("01HDEC00000000000000000H9-heading");
    expect(decisions).toContain("Drop the leaky signup_source feature");
  });
});

describe("buildCatchup — the whole injected context", () => {
  it("assembles all three sections; terminals excluded from the frontier", () => {
    const context = buildCatchup(RUNNING);
    expect(context).toContain("## Structural index");
    expect(context).toContain("## Frontier logic");
    expect(context).toContain("## Decisions");

    // structural index covers every step (incl. terminal dead-end)
    expect(context).toContain(RT.deadend);
    // frontier is the running step; the dead-end is never inlined as frontier logic
    const frontierSection = context.split("## Frontier logic")[1]!.split("## Decisions")[0]!;
    expect(frontierSection).toContain(RT.model);
    expect(frontierSection).not.toContain("hand-rules baseline"); // dead-end goal never inlined
  });

  it("handles an empty project gracefully", () => {
    const context = buildCatchup(here); // no steps/ under the hooks dir itself
    expect(context).toContain("_(no steps yet)_");
    expect(context).toContain("_(none recorded)_");
  });
});
