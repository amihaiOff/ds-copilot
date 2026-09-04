import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkNoUnilateral, isDecisionPath } from "./no-unilateral";
import { hasPendingDecision, PENDING_DECISION_MARKER } from "./report-decision-before-close";

describe("no-unilateral (hook 5)", () => {
  it("recognises a Decision record path", () => {
    expect(isDecisionPath("steps/01STEP-x/decisions/01DEC-y.md")).toBe(true);
    expect(isDecisionPath("/proj/steps/01STEP-x/decisions/01DEC-y.md")).toBe(true);
    expect(isDecisionPath("steps/01STEP-x/results.md")).toBe(false);
    expect(isDecisionPath("steps/01STEP-x/decisions/notes.txt")).toBe(false);
  });

  it("denies a direct edit to a Decision record when the skill is not active", () => {
    const r = checkNoUnilateral({
      toolName: "Write",
      filePath: "steps/01STEP-x/decisions/01DEC-y.md",
      skillActive: false,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/decision-logging skill/);
  });

  it("allows the write when the decision-logging skill has marked its turn", () => {
    expect(
      checkNoUnilateral({
        toolName: "Write",
        filePath: "steps/01STEP-x/decisions/01DEC-y.md",
        skillActive: true,
      }).allowed,
    ).toBe(true);
  });

  it("ignores non-decision writes and non-write tools", () => {
    expect(
      checkNoUnilateral({ toolName: "Write", filePath: "steps/01STEP-x/results.md", skillActive: false })
        .allowed,
    ).toBe(true);
    expect(
      checkNoUnilateral({ toolName: "Bash", filePath: undefined, skillActive: false }).allowed,
    ).toBe(true);
  });
});

describe("report-decision-before-close (hook 4)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), "ds-hook-"));
    dirs.push(d);
    return d;
  };

  it("reports no pending decision when the marker is absent", () => {
    expect(hasPendingDecision(tmp())).toBe(false);
  });

  it("detects a pending decision when the marker is present", () => {
    const root = tmp();
    mkdirSync(join(root, ".ds"), { recursive: true });
    writeFileSync(join(root, PENDING_DECISION_MARKER), "truncate renewals\n");
    expect(hasPendingDecision(root)).toBe(true);
  });
});
