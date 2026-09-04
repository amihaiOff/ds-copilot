// Launch glue (spec §10 run model): open the default browser at the served URL.
// Best-effort and fire-and-forget — a failure to open must never take down the
// server (the URL is also printed to the console). Skipped when DS_OPEN is
// "0"/"false" (e.g. headless/dev), so `npm run server` stays quiet on demand.
import { spawn } from "node:child_process";
import { platform } from "node:process";

/** Whether launch should try to open a browser (env-gated, default on). */
export function shouldOpenBrowser(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.DS_OPEN?.toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "no";
}

/** The platform command + args that open `url` in the default browser. */
export function openCommand(url: string, os: NodeJS.Platform = platform): [string, string[]] {
  switch (os) {
    case "darwin":
      return ["open", [url]];
    case "win32":
      // `start` is a cmd builtin; the empty "" is the window title arg.
      return ["cmd", ["/c", "start", "", url]];
    default:
      return ["xdg-open", [url]];
  }
}

/** Best-effort: open `url` in the default browser unless DS_OPEN disables it. */
export function openBrowser(url: string): void {
  if (!shouldOpenBrowser()) return;
  const [cmd, args] = openCommand(url);
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
      /* opener missing (e.g. no xdg-open) — the URL is printed anyway */
    });
    child.unref();
  } catch {
    /* never let a launch convenience crash the server */
  }
}
