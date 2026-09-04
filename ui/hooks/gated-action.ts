// Hook 2 (Worker) — PreToolUse gate on consequential actions (spec §6 hook 2).
//
// A Worker's train/eval run, warehouse write/DDL, or expensive read is gated:
//   - silent-pass when the command signature matches a dispatch-time pre-approval
//     (the autonomy lever — every choice pinned in the brief is class-1, §4.1/§4.2);
//   - otherwise `ask` — the reason carries the question + the Worker's recommendation
//     and surfaces in the main session, labelled by subagent.
//
// Binding seam (written by step-dispatch, S3): approved command fragments live in
// `steps/<id>/gated-approvals.json` (a JSON array of strings). A command that
// `includes` any fragment is treated as pre-approved. Missing file → nothing
// pre-approved → every gated command asks.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  askPreTool,
  isMain,
  projectRoot,
  readHookInput,
  type HookInput,
} from "./hook-io";

// Signatures of consequential commands (v1: local train/eval + SQL DDL/DML).
//
// Spec §6 hook 2 also lists "expensive read" as a gated action. It is NOT
// pattern-matched here: an expensive read has no reliable command signature —
// `SELECT ...` spans the trivial (`SELECT 1`) and the ruinous (a full-table
// warehouse scan), and gating every read would drown the Worker in `ask`
// prompts for cheap queries. Cost is a property of the data/engine, not the
// shell string a tool-signature hook can see, so expensive-read gating is
// DEFERRED as a spec honest-limit (same class as the independent-steps
// convention, §6 / #7). See README "Honest limits". TODO(#8): revisit if the
// warehouse client exposes a pre-flight cost/bytes-scanned estimate the hook
// can key on.
export const DEFAULT_GATED_PATTERNS: readonly RegExp[] = [
  /\b(?:fit|train|cross_val\w*|GridSearch\w*|RandomizedSearch\w*)\b/i,
  /\b(?:catboost|xgboost|lightgbm|sklearn)\b/i,
  /\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|MERGE|TRUNCATE|COPY)\b/,
];

export function isGatedCommand(
  command: string,
  patterns: readonly RegExp[] = DEFAULT_GATED_PATTERNS,
): boolean {
  return patterns.some((p) => p.test(command));
}

export function isPreApproved(command: string, approvals: readonly string[]): boolean {
  return approvals.some((a) => a.trim() !== "" && command.includes(a));
}

export interface GateResult {
  decision: "allow" | "ask";
  reason: string;
}

/** Allow non-gated or pre-approved commands; ask on everything else gated. */
export function evaluateGate(args: {
  command: string | undefined;
  approvals: readonly string[];
}): GateResult {
  const { command, approvals } = args;
  if (!command || !isGatedCommand(command)) return { decision: "allow", reason: "" };
  if (isPreApproved(command, approvals)) return { decision: "allow", reason: "" };
  return {
    decision: "ask",
    reason:
      "gated-action: a consequential command was not pre-approved in the brief. " +
      `Command: \`${command}\`. Confirm to run it, or the Worker should escalate a BLOCKED decision.`,
  };
}

/** Load the dispatch-time approvals for the bound step, or [] if none. */
export function loadApprovals(root: string): string[] {
  const dir = process.env.DS_STEP_DIR;
  const id = process.env.DS_STEP_ID;
  const stepDir = dir && dir.trim() !== "" ? dir : id ? resolve(root, "steps", id) : undefined;
  if (!stepDir) return [];
  const file = join(stepDir, "gated-approvals.json");
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const input: HookInput = await readHookInput();
  if (input.tool_name !== "Bash") return; // gate keys on shell command signatures
  const command = input.tool_input?.["command"] as string | undefined;
  const result = evaluateGate({ command, approvals: loadApprovals(projectRoot(input)) });
  if (result.decision === "ask") askPreTool(result.reason);
}

if (isMain(import.meta.url)) {
  void main();
}
