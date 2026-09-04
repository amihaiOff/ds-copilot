// Entrypoint for the companion server (spec §10). Boots the read-only projection
// server: serves the parsed DAG model + SSE updates, and the built client if it
// exists. Run via `npm run server` (see ui/package.json).
//
// Defaults resolve relative to this file: the project root is the repo root
// (two levels up from ui/server), the client build is ui/client/dist. Override
// with DS_PROJECT_ROOT / DS_PORT / DS_HOST.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app";
import { openBrowser } from "./open-browser";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const projectRoot = process.env.DS_PROJECT_ROOT
  ? resolve(process.env.DS_PROJECT_ROOT)
  : repoRoot;
const clientDir = resolve(here, "..", "client", "dist");
const port = Number(process.env.DS_PORT ?? 4317);
const host = process.env.DS_HOST ?? "127.0.0.1";

const app = buildApp({ projectRoot, clientDir });

app
  .listen({ port, host })
  .then((address) => {
    // eslint-disable-next-line no-console
    console.log(`DS co-pilot server on ${address} (project: ${projectRoot})`);
    // Launch convenience: open the served UI in the default browser (spec §10
    // run model). `address` is e.g. http://127.0.0.1:4317; prefer localhost so
    // the browser opens a friendlier URL. Best-effort, env-gated (DS_OPEN=0).
    const url = `http://localhost:${port}`;
    openBrowser(url);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
