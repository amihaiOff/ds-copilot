// Hook 1 (Worker) — PreToolUse write-confinement (spec §6, §4 "Writes: its own
// steps/<id>/ tree only").
//
// A Worker executes exactly one step and may write only inside that step's
// directory. This hook denies any Write/Edit/MultiEdit/NotebookEdit whose target
// resolves outside it. Enforcement keys on the write path (a tool signature) —
// the honest limit of §4.2.
//
// Binding seam (wired by step-dispatch / the Worker agent frontmatter, S3/S5):
// the Worker's own step dir is passed via env — `DS_STEP_DIR` (absolute) or
// `DS_STEP_ID` (resolved under <project>/steps/<id>). With neither set the hook
// fails closed.
import { resolve, sep } from "node:path";
import {
  denyPreTool,
  isMain,
  projectRoot,
  readHookInput,
  type HookInput,
} from "./hook-io";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export interface ConfineResult {
  allowed: boolean;
  reason: string;
}

/** True unless `filePath` (resolved against `cwd`) lives inside `stepDir`. */
export function checkWriteConfined(args: {
  filePath: string | undefined;
  stepDir: string | undefined;
  cwd: string;
}): ConfineResult {
  const { filePath, stepDir, cwd } = args;
  if (!stepDir) {
    return {
      allowed: false,
      reason:
        "write-confine: no step directory is bound (set DS_STEP_DIR or DS_STEP_ID at dispatch); a Worker must write inside its own step dir.",
    };
  }
  if (!filePath) return { allowed: true, reason: "" };

  const target = resolve(cwd, filePath);
  const base = resolve(stepDir);
  const within = target === base || target.startsWith(base + sep);
  return within
    ? { allowed: true, reason: "" }
    : {
        allowed: false,
        reason: `write-confine: a Worker may write only inside its step dir (${base}); refusing write to ${target}.`,
      };
}

/**
 * The write target a tool declares. Most write tools use `file_path`;
 * NotebookEdit uses `notebook_path`. Falling back to the latter keeps a
 * NotebookEdit from escaping confinement fail-open (undefined path → allowed).
 */
export function extractWritePath(
  toolInput: Record<string, unknown> | undefined,
): string | undefined {
  const candidate = toolInput?.["file_path"] ?? toolInput?.["notebook_path"];
  return typeof candidate === "string" ? candidate : undefined;
}

/** Resolve the bound step dir from env (DS_STEP_DIR wins over DS_STEP_ID). */
export function resolveStepDir(root: string): string | undefined {
  const dir = process.env.DS_STEP_DIR;
  if (dir && dir.trim() !== "") return dir;
  const id = process.env.DS_STEP_ID;
  if (id && id.trim() !== "") return resolve(root, "steps", id);
  return undefined;
}

async function main(): Promise<void> {
  const input: HookInput = await readHookInput();
  if (!input.tool_name || !WRITE_TOOLS.has(input.tool_name)) return; // not our tool
  // NotebookEdit carries its target as `notebook_path`, not `file_path`;
  // extractWritePath falls back to it so a NotebookEdit can't escape
  // confinement fail-open.
  const filePath = extractWritePath(input.tool_input);
  const result = checkWriteConfined({
    filePath,
    stepDir: resolveStepDir(projectRoot(input)),
    cwd: input.cwd ?? process.cwd(),
  });
  if (!result.allowed) denyPreTool(result.reason);
}

if (isMain(import.meta.url)) {
  void main();
}
