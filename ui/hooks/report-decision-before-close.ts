// Hook 4 (Orchestrator / main session) — Stop report-decision-before-close
// (spec §6 hook 4).
//
// The Orchestrator must not close the conversation while a Decision it has
// agreed to is still unrecorded. If a pending-decision marker is present at Stop,
// this hook exits 2 so the turn continues and the Decision gets logged first.
//
// Binding seam: the escalation-relay flow drops a marker at
// `<project>/.ds/pending-decision` when a Decision is agreed; the decision-logging
// skill (S2) removes it once the record is written.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isMain, projectRoot, readHookInput, type HookInput } from "./hook-io";

export const PENDING_DECISION_MARKER = join(".ds", "pending-decision");

/** True when a Decision has been agreed but not yet recorded. */
export function hasPendingDecision(root: string): boolean {
  return existsSync(join(root, PENDING_DECISION_MARKER));
}

async function main(): Promise<void> {
  const input: HookInput = await readHookInput();
  // Don't re-block if Stop is already re-invoking us after a prior block.
  if (input.stop_hook_active) return;
  if (hasPendingDecision(projectRoot(input))) {
    process.stderr.write(
      "report-decision-before-close: a pending Decision is unrecorded (" +
        PENDING_DECISION_MARKER +
        " present). Log it via the decision-logging skill before closing.\n",
    );
    process.exit(2);
  }
}

if (isMain(import.meta.url)) {
  void main();
}
