import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the tsconfig `@shared/*` path so server/client tests can import
      // the S1 read-seam (Vitest does not read tsconfig paths on its own).
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["{client,server,shared}/**/*.{test,spec}.ts"],
  },
});
