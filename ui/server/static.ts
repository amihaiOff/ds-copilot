// Serve the built client (`ui/client/dist`) in production. Kept tiny and
// dependency-free (no @fastify/static): the server reads files from one fixed
// directory and falls back to index.html for client-side routes. Strictly
// read-only — GET only, path-traversal guarded.
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function contentType(filePath: string): string {
  return MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Resolve a request URL path to a file inside `root`, or `null` if it escapes
 * `root` (path traversal) or does not exist. A directory / unknown route
 * resolves to `root/index.html` (SPA fallback).
 */
function resolveFile(root: string, urlPath: string): string | null {
  const rel = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const candidate = resolve(root, "." + normalize("/" + rel));
  // Confinement: the resolved path must stay within root.
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;

  if (rel !== "/" && existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  const indexHtml = join(root, "index.html");
  return existsSync(indexHtml) ? indexHtml : null;
}

/** Register a GET catch-all that serves the built client from `root`. */
export function registerClient(app: FastifyInstance, root: string): void {
  const clientRoot = resolve(root);
  app.get("/*", (req, reply) => {
    // API routes are registered separately; never shadow them.
    if (req.url.startsWith("/api/")) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    const file = resolveFile(clientRoot, req.url);
    if (!file) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.header("Content-Type", contentType(file));
    reply.send(readFileSync(file));
  });
}
