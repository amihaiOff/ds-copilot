// Vite config for the read-only browser client (spec §10, S7 slice).
//
// Root is `ui/` (this file + index.html live here); the React source lives under
// `ui/client/`. The build emits to `client/dist`, which the companion server
// serves in production (see ui/server/main.ts → clientDir = ui/client/dist).
//
// `@shared` mirrors the tsconfig path so the client imports the S1 types
// (`@shared/dag`, `@shared/schema`) — NEVER the read-seam barrel, which pulls in
// node:fs. In dev, `/api/*` is proxied to the companion server.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const SERVER_PORT = Number(process.env.DS_PORT ?? 4317);

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./client/dist", import.meta.url)),
    emptyOutDir: true,
  },
});
