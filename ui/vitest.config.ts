import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["{client,server,shared}/**/*.{test,spec}.ts"],
  },
});
