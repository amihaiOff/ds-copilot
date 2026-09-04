// End-to-end smoke test (spec §11 / S8): boot the real companion server against
// the repo's own example step tree (the S0 fixture step committed under
// `steps/`) and assert the state endpoint projects it. This is the integration
// check that the read-seam → Fastify → HTTP path works end to end on real
// on-disk state, not a synthesized tmp tree.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

// The example fixture step committed at the repo root (S0 scaffold, spec §3.2).
const EXAMPLE_STEP_ID = "01J9ZX4K7Q8N2P3R4S5T6V7W8X-target-leakage-check";

describe("e2e smoke (spec §11) — server serves the real example step tree", () => {
  let app: FastifyInstance;
  let base: string;

  beforeAll(async () => {
    app = buildApp({ projectRoot: repoRoot });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/state includes the example step from steps/", async () => {
    const res = await fetch(`${base}/api/state`);
    expect(res.status).toBe(200);
    const body = await res.json();

    const ids = body.logic.nodes.map((n: { id: string }) => n.id);
    expect(ids).toContain(EXAMPLE_STEP_ID);

    const example = body.logic.nodes.find(
      (n: { id: string }) => n.id === EXAMPLE_STEP_ID,
    );
    expect(example.kind).toBe("analysis");
    expect(example.status).toBe("proposed");
    // The fixture is a DAG root: no builds-on parents.
    expect(example.builds_on).toEqual([]);
  });
});
