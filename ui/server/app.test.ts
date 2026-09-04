import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { readState } from "@shared/read-seam";
import { buildApp } from "./app";
import { watchProject, type StateWatcher } from "./watcher";

const ROOT_ID = "01J9ZXAAAAAAAAAAAAAAAAAAAA-root";
const CHILD_ID = "01J9ZXBBBBBBBBBBBBBBBBBBBB-eda";

function stepMd(id: string, buildsOn: string[]): string {
  return [
    "---",
    `id: ${id}`,
    `title: ${id}`,
    "kind: analysis",
    `builds_on: ${JSON.stringify(buildsOn)}`,
    "status: proposed",
    "created: 2026-09-04",
    "---",
    `Goal of ${id}.`,
    "",
  ].join("\n");
}

function writeStep(root: string, id: string, buildsOn: string[]): void {
  const dir = join(root, "steps", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "step.md"), stepMd(id, buildsOn));
}

describe("server (spec §10) — read-only projection endpoints", () => {
  let root: string;
  let watcher: StateWatcher;
  let app: FastifyInstance;
  let base: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "ds-server-"));
    mkdirSync(join(root, "steps"), { recursive: true });
    mkdirSync(join(root, "datasets"), { recursive: true });
    writeStep(root, ROOT_ID, []);
    writeStep(root, CHILD_ID, [ROOT_ID]);

    // Inject a watcher we can await to `ready`, so post-startup writes are seen.
    watcher = watchProject(root);
    await once(watcher.emitter, "ready");

    app = buildApp({ projectRoot: root, watcher });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await app.close();
    await watcher.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("GET /api/state returns the parsed DAG model (nodes + edges)", async () => {
    const res = await fetch(`${base}/api/state`);
    expect(res.status).toBe(200);
    const body = await res.json();

    const expected = readState(root);
    // Same nodes as the read-seam parses directly from disk.
    expect(body.logic.nodes.map((n: { id: string }) => n.id).sort()).toEqual(
      expected.logic.nodes.map((n) => n.id).sort(),
    );
    // The child-owned builds_on edge is projected.
    expect(body.logic.edges).toContainEqual({ from: ROOT_ID, to: CHILD_ID });
    // A typed frontmatter field survives serialization.
    const child = body.logic.nodes.find((n: { id: string }) => n.id === CHILD_ID);
    expect(child.status).toBe("proposed");
    expect(child.builds_on).toEqual([ROOT_ID]);
    // Datasets DAG present (empty here) — shape is stable.
    expect(body.datasets).toEqual({ nodes: [], edges: [] });
  });

  it("GET /api/events pushes an 'update' event when a file changes", async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/events`, {
      headers: { accept: "text/event-stream" },
      signal: ctrl.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read until we see the marker `needle`, then return the accumulated text.
    async function readUntil(needle: string): Promise<string> {
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`stream ended before "${needle}"`);
        buf += decoder.decode(value, { stream: true });
        if (buf.includes(needle)) return buf;
      }
    }

    // The opening comment confirms our SSE handler ran and is subscribed.
    await readUntil(": connected");

    // Mutate the watched tree -> should push an SSE update.
    writeStep(root, "01J9ZXCCCCCCCCCCCCCCCCCCCC-new", [ROOT_ID]);

    const payload = await readUntil("event: update");
    expect(payload).toContain("event: update");
    expect(payload).toMatch(/data: \{.*"ts".*\}/);

    ctrl.abort();
    reader.cancel().catch(() => {});
  });
});
