import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    include: ["packages/**/src/**/*.test.ts", "packages/**/src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/**/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "**/*.d.ts", "**/index.ts"],
    },
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@test-automation-mcp/core": resolve(
        __dirname,
        "packages/core/src/index.ts"
      ),
    },
  },
});
