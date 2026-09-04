// The companion server (spec §10): a strictly read-only projection of on-disk
// state. It exposes the parsed DAG model over HTTP, pushes an SSE "update" event
// whenever `steps/`/`datasets/` change, and — in production — serves the built
// client. There are NO write endpoints: the browser never mutates state, and
// running a step is conversation-only (spec §1).
import { existsSync } from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import { readState, type ProjectState } from "@shared/read-seam";
import { watchProject, type StateWatcher } from "./watcher";
import { registerClient } from "./static";

export interface AppOptions {
  /** Project root containing `steps/` and `datasets/`. */
  projectRoot: string;
  /** Built client directory (`ui/client/dist`); served if it exists. */
  clientDir?: string;
  /** Inject a watcher (tests); defaults to a chokidar watcher on projectRoot. */
  watcher?: StateWatcher;
}

/** The wire shape of one DAG: nodes + edges (the `byId` index is client-rebuilt). */
interface WireDag {
  nodes: unknown[];
  edges: unknown[];
}
export interface WireState {
  logic: WireDag;
  datasets: WireDag;
}

/**
 * Project state onto the wire. `readState` returns Maps (`byId`) that do not
 * survive JSON serialization; we drop them rather than emit a misleading `{}`,
 * since nodes+edges fully describe each DAG and the client rebuilds the index.
 */
export function toWire(state: ProjectState): WireState {
  return {
    logic: { nodes: state.logic.nodes, edges: state.logic.edges },
    datasets: { nodes: state.datasets.nodes, edges: state.datasets.edges },
  };
}

/**
 * Build the Fastify app. The caller owns `listen()` and (for an injected
 * watcher) its lifecycle; a watcher created here is closed on `app.close()`.
 */
export function buildApp(opts: AppOptions): FastifyInstance {
  const { projectRoot } = opts;
  const app = Fastify({ logger: false });

  const ownsWatcher = opts.watcher === undefined;
  const watcher = opts.watcher ?? watchProject(projectRoot);
  if (ownsWatcher) {
    app.addHook("onClose", async () => {
      await watcher.close();
    });
  }

  // --- state: the parsed DAG model, re-derived on every request (ADR 0001) ---
  app.get("/api/state", async (): Promise<WireState> => {
    return toWire(readState(projectRoot));
  });

  // --- SSE: push an "update" event on any change under steps/ or datasets/ ----
  app.get("/api/events", (_req, reply) => {
    // Take the socket over from Fastify's normal reply lifecycle.
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering so events flush immediately.
      "X-Accel-Buffering": "no",
    });
    // A comment line opens the stream (and lets clients confirm connectivity).
    res.write(": connected\n\n");

    const onChange = (): void => {
      res.write(`event: update\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    };
    watcher.emitter.on("change", onChange);

    // Keep-alive comment so idle connections aren't reaped by intermediaries.
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 30_000);
    keepAlive.unref?.();

    const cleanup = (): void => {
      clearInterval(keepAlive);
      watcher.emitter.off("change", onChange);
    };
    res.on("close", cleanup);
    res.on("error", cleanup);
  });

  // --- production: serve the built client if present (absence tolerated) ------
  const clientDir = opts.clientDir;
  if (clientDir && existsSync(clientDir)) {
    registerClient(app, clientDir);
  }

  return app;
}
