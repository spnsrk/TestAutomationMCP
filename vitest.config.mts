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
      "@test-automation-mcp/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@test-automation-mcp/gateway": resolve(__dirname, "packages/gateway/src/index.ts"),
      "@test-automation-mcp/connectors": resolve(__dirname, "packages/connectors/src/index.ts"),
      "@test-automation-mcp/llm": resolve(__dirname, "packages/llm/src/index.ts"),
      "@test-automation-mcp/agent-qa": resolve(__dirname, "packages/agents/qa-agent/src/index.ts"),
      "@test-automation-mcp/agent-strategist": resolve(__dirname, "packages/agents/strategist/src/index.ts"),
      "@test-automation-mcp/agent-generator": resolve(__dirname, "packages/agents/generator/src/index.ts"),
      "@test-automation-mcp/agent-executor": resolve(__dirname, "packages/agents/executor/src/index.ts"),
      "@test-automation-mcp/agent-analyzer": resolve(__dirname, "packages/agents/analyzer/src/index.ts"),
    },
  },
});
