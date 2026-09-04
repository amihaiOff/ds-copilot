import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The repo vitest.config.ts only includes {client,server,shared}. This config
// runs the ui/hooks tests and wires the @shared alias (mirrors tsconfig paths)
// so the handlers can import the S1 read-seam the way they do at runtime.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    root: here,
    include: ["**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: { "@shared": resolve(here, "../shared") },
  },
});
