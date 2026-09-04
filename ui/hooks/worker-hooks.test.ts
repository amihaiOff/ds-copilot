import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { checkWriteConfined, extractWritePath } from "./write-confine";
import {
  evaluateGate,
  isGatedCommand,
  isPreApproved,
} from "./gated-action";
import {
  shouldBlockFinish,
  hasBlockedHalt,
  hasRecordedResults,
} from "./report-before-finish";

const STEP = "/proj/steps/01STEP-x";

describe("write-confine (hook 1)", () => {
  it("allows a write inside the bound step dir", () => {
    const r = checkWriteConfined({
      filePath: join(STEP, "results.md"),
      stepDir: STEP,
      cwd: "/proj",
    });
    expect(r.allowed).toBe(true);
  });

  it("allows nested writes (assets/, code/) under the step dir", () => {
    expect(
      checkWriteConfined({ filePath: join(STEP, "assets/plot.png"), stepDir: STEP, cwd: "/proj" })
        .allowed,
    ).toBe(true);
    expect(
      checkWriteConfined({ filePath: join(STEP, "code/main.py"), stepDir: STEP, cwd: "/proj" })
        .allowed,
    ).toBe(true);
  });

  it("denies a write to another step dir", () => {
    const r = checkWriteConfined({
      filePath: "/proj/steps/01OTHER-y/results.md",
      stepDir: STEP,
      cwd: "/proj",
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/only inside its step dir/);
  });

  it("denies escaping via a relative path", () => {
    expect(
      checkWriteConfined({ filePath: "../01OTHER-y/results.md", stepDir: STEP, cwd: STEP }).allowed,
    ).toBe(false);
    expect(
      checkWriteConfined({ filePath: "/proj/dslib/util.py", stepDir: STEP, cwd: "/proj" }).allowed,
    ).toBe(false);
  });

  it("fails closed when no step dir is bound", () => {
    const r = checkWriteConfined({ filePath: join(STEP, "results.md"), stepDir: undefined, cwd: "/proj" });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/no step directory is bound/);
  });

  it("does not deny a step-dir prefix sibling (steps/01STEP-x-evil)", () => {
    const r = checkWriteConfined({
      filePath: "/proj/steps/01STEP-x-evil/results.md",
      stepDir: STEP,
      cwd: "/proj",
    });
    expect(r.allowed).toBe(false); // prefix match must respect the path separator
  });

  it("extractWritePath reads file_path for the common write tools", () => {
    expect(extractWritePath({ file_path: join(STEP, "results.md") })).toBe(
      join(STEP, "results.md"),
    );
  });

  it("extractWritePath falls back to notebook_path (NotebookEdit) so it can't escape fail-open", () => {
    // NotebookEdit has no file_path; without the fallback the path is undefined
    // and confinement allows the write outright.
    expect(extractWritePath({ notebook_path: "/proj/dslib/evil.ipynb" })).toBe(
      "/proj/dslib/evil.ipynb",
    );
    const r = checkWriteConfined({
      filePath: extractWritePath({ notebook_path: "/proj/dslib/evil.ipynb" }),
      stepDir: STEP,
      cwd: "/proj",
    });
    expect(r.allowed).toBe(false);
  });

  it("extractWritePath returns undefined when no path key is present", () => {
    expect(extractWritePath({})).toBeUndefined();
    expect(extractWritePath(undefined)).toBeUndefined();
  });
});

describe("gated-action (hook 2)", () => {
  it("classifies train/eval and SQL DDL as gated", () => {
    expect(isGatedCommand("python -c 'model.fit(X, y)'")).toBe(true);
    expect(isGatedCommand("catboost fit ...")).toBe(true);
    expect(isGatedCommand("psql -c 'DROP TABLE users'")).toBe(true);
    expect(isGatedCommand("ls -la && cat results.md")).toBe(false);
  });

  it("matches a command against dispatch-time approvals", () => {
    expect(isPreApproved("python train.py --split 0.2", ["train.py --split 0.2"])).toBe(true);
    expect(isPreApproved("python train.py --split 0.5", ["train.py --split 0.2"])).toBe(false);
  });

  it("allows non-gated commands", () => {
    expect(evaluateGate({ command: "ls -la", approvals: [] }).decision).toBe("allow");
  });

  it("asks on a gated command with no matching approval, carrying the command", () => {
    const r = evaluateGate({ command: "python -c 'model.fit(X,y)'", approvals: [] });
    expect(r.decision).toBe("ask");
    expect(r.reason).toContain("model.fit");
  });

  it("silent-passes a gated command that matches a pre-approval", () => {
    const r = evaluateGate({
      command: "python train.py --split 0.2",
      approvals: ["train.py --split 0.2"],
    });
    expect(r.decision).toBe("allow");
  });
});

describe("report-before-finish (hook 3)", () => {
  it("does not block a properly finished step (terminal status + results)", () => {
    const r = shouldBlockFinish({
      status: "done",
      resultsContent: "## Conclusion\nAUC 0.83.",
      logicProcessContent: "did the work",
    });
    expect(r.block).toBe(false);
  });

  it("does not block a dead-end that recorded results", () => {
    expect(
      shouldBlockFinish({ status: "dead-end", resultsContent: "unfruitful", logicProcessContent: "x" })
        .block,
    ).toBe(false);
  });

  it("does not block when a BLOCKED halt is in flight", () => {
    expect(hasBlockedHalt("... BLOCKED — needs decision: which metric?")).toBe(true);
    const r = shouldBlockFinish({
      status: "running",
      resultsContent: null,
      logicProcessContent: "hit a fork\nBLOCKED — needs decision: drop feature X?",
    });
    expect(r.block).toBe(false);
  });

  it("blocks finishing with no results and no escalation", () => {
    const r = shouldBlockFinish({ status: "running", resultsContent: null, logicProcessContent: "just ran" });
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/haven't recorded results/);
  });

  it("blocks a non-terminal status even with results present", () => {
    expect(
      shouldBlockFinish({ status: "running", resultsContent: "partial", logicProcessContent: "x" }).block,
    ).toBe(true);
  });

  it("treats empty results.md as not-recorded", () => {
    expect(hasRecordedResults("   \n  ")).toBe(false);
    expect(hasRecordedResults("## Conclusion\nx")).toBe(true);
  });
});
