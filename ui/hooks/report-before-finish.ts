// Hook 3 (Worker) — SubagentStop report-before-finish (spec §6 hook 3, §4.2).
//
// A Worker must not stop until it has either recorded its results (results.md
// conclusion + a terminal status) or emitted a BLOCKED escalation. If it tries
// to finish having done neither, this hook exits 2 — the message goes back to the
// Worker so it records or escalates instead of silently ending.
//
// Binding seam: the Worker's step dir comes from env (DS_STEP_DIR / DS_STEP_ID),
// as with write-confine.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseStep } from "@shared/index";
import { isMain, projectRoot, readHookInput, type HookInput } from "./hook-io";

const TERMINAL = new Set(["done", "dead-end"]);

/** results.md counts as a recorded conclusion when it exists and is non-empty. */
export function hasRecordedResults(resultsContent: string | null): boolean {
  return !!resultsContent && resultsContent.trim().length > 0;
}

/** A BLOCKED halt is in flight when logic_process.md logs the escalation. */
export function hasBlockedHalt(logicProcessContent: string | null): boolean {
  return (
    !!logicProcessContent &&
    /BLOCKED\s*[—–-]\s*needs\s+decision/i.test(logicProcessContent)
  );
}

export interface FinishInputs {
  status: string | undefined;
  resultsContent: string | null;
  logicProcessContent: string | null;
}

/** Block (exit 2) unless the step is properly finished or a BLOCKED halt is in flight. */
export function shouldBlockFinish(i: FinishInputs): { block: boolean; reason: string } {
  if (hasBlockedHalt(i.logicProcessContent)) return { block: false, reason: "" };
  const terminal = i.status !== undefined && TERMINAL.has(i.status);
  if (terminal && hasRecordedResults(i.resultsContent)) return { block: false, reason: "" };
  return {
    block: true,
    reason:
      "report-before-finish: you haven't recorded results (results.md conclusion + a terminal status of done|dead-end) or escalated. Run record-results, or emit a `BLOCKED — needs decision` escalation, before finishing.",
  };
}

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

async function main(): Promise<void> {
  const input: HookInput = await readHookInput();
  const root = projectRoot(input);
  const dir = process.env.DS_STEP_DIR;
  const id = process.env.DS_STEP_ID;
  const stepDir = dir && dir.trim() !== "" ? dir : id ? resolve(root, "steps", id) : undefined;

  // No bound step → nothing to enforce (fail open: this Worker isn't step-scoped).
  if (!stepDir) return;

  let status: string | undefined;
  const stepMd = readIfExists(join(stepDir, "step.md"));
  if (stepMd) {
    try {
      status = parseStep(stepMd).frontmatter.status;
    } catch {
      status = undefined;
    }
  }

  const result = shouldBlockFinish({
    status,
    resultsContent: readIfExists(join(stepDir, "results.md")),
    logicProcessContent: readIfExists(join(stepDir, "logic_process.md")),
  });

  if (result.block) {
    process.stderr.write(result.reason + "\n");
    process.exit(2);
  }
}

if (isMain(import.meta.url)) {
  void main();
}
