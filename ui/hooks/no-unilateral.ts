// Hook 5 (Orchestrator / main session) — PreToolUse no-unilateral-decisions
// (spec §6 hook 5, §4.2).
//
// A first-class Decision record must be written through the decision-logging
// skill, never as an ad-hoc edit — a mis-recorded Decision silently steers the
// Root Task. Enforcement keys on the write path (a tool signature, §4.2's honest
// limit): a direct Write/Edit to `steps/<id>/decisions/<id>.md` is denied unless
// the decision-logging skill has marked its turn.
//
// Binding seam: the decision-logging skill (S2) exports `DS_DECISION_SKILL=1`
// for the duration of its turn; this hook treats that as authorisation.
import {
  denyPreTool,
  isMain,
  readHookInput,
  type HookInput,
} from "./hook-io";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** True when the path targets a first-class Decision record. */
export function isDecisionPath(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, "/");
  return /(^|\/)steps\/[^/]+\/decisions\/[^/]+\.md$/.test(norm);
}

export function checkNoUnilateral(args: {
  toolName: string | undefined;
  filePath: string | undefined;
  skillActive: boolean;
}): { allowed: boolean; reason: string } {
  const { toolName, filePath, skillActive } = args;
  if (!toolName || !WRITE_TOOLS.has(toolName) || !filePath) {
    return { allowed: true, reason: "" };
  }
  if (isDecisionPath(filePath) && !skillActive) {
    return {
      allowed: false,
      reason:
        "no-unilateral-decisions: a Decision record must be written via the decision-logging skill, not a direct edit (the skill sets DS_DECISION_SKILL=1 for its turn).",
    };
  }
  return { allowed: true, reason: "" };
}

async function main(): Promise<void> {
  const input: HookInput = await readHookInput();
  const result = checkNoUnilateral({
    toolName: input.tool_name,
    filePath: input.tool_input?.["file_path"] as string | undefined,
    skillActive: process.env.DS_DECISION_SKILL === "1",
  });
  if (!result.allowed) denyPreTool(result.reason);
}

if (isMain(import.meta.url)) {
  void main();
}
