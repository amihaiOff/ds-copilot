// Shared plumbing for the Claude Code hook handlers in this directory.
//
// Every handler is deterministic TypeScript run via `tsx` (no agent in the hot
// path, spec §6/§8). Claude Code passes each hook a JSON event on stdin and
// reads the handler's decision from its exit code and/or stdout JSON. This module
// centralises: reading that event, locating the project root, the "am I the
// entrypoint?" guard, and the small PreToolUse decision emitters.
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The subset of the Claude Code hook event we read. Extra keys are preserved. */
export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  /** Set by Claude Code when a Stop hook is already re-invoking after a block. */
  stop_hook_active?: boolean;
  [key: string]: unknown;
}

/** Read all of stdin as a string (empty when there is no piped input). */
export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

/** Parse the hook event JSON from stdin, tolerating an empty/garbled payload. */
export async function readHookInput(): Promise<HookInput> {
  const raw = await readStdin();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as HookInput;
  } catch {
    return {};
  }
}

/**
 * Walk up from `start` to the first ancestor that looks like the project root
 * (holds a `steps/` or `datasets/` dir). Lets a handler run correctly whether it
 * is launched from the repo root or from `ui/`.
 */
export function findProjectRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "steps")) || existsSync(join(dir, "datasets"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/**
 * The project root the handler should read state from. Claude Code exports
 * `CLAUDE_PROJECT_DIR` for hook commands; otherwise fall back to the event's
 * `cwd`, then walk up from the process cwd.
 */
export function projectRoot(input: HookInput = {}): string {
  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  if (fromEnv) return fromEnv;
  return findProjectRoot(input.cwd ?? process.cwd());
}

/** True when this module is the process entrypoint (not imported by a test). */
export function isMain(metaUrl: string): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  const self = fileURLToPath(metaUrl);
  try {
    return realpathSync(arg) === realpathSync(self);
  } catch {
    return arg === self;
  }
}

// --- PreToolUse decision emitters (hooks 1, 2, 5) ---------------------------
// A PreToolUse hook communicates its verdict as JSON on stdout. Emitting nothing
// (exit 0) lets the tool through under the normal permission flow.

/** Block the pending tool call outright (hook 1 write-confine, hook 5 no-unilateral). */
export function denyPreTool(reason: string): void {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
}

/** Surface the call to the human for confirmation (hook 2 gated-action). */
export function askPreTool(reason: string): void {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason,
      },
    }),
  );
}

/** Inject read-only context at SessionStart (hook 6 session-catchup). */
export function emitSessionContext(context: string): void {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: context,
      },
    }),
  );
}
