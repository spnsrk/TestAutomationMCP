import { describe, it, expect } from "vitest";
import { EnvironmentConfigSchema, GatewayConfigSchema } from "./config.js";

describe("EnvironmentConfigSchema", () => {
  it("should parse a minimal config with only a name", () => {
    const result = EnvironmentConfigSchema.safeParse({ name: "default" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("default");
      expect(result.data.web).toBeUndefined();
      expect(result.data.salesforce).toBeUndefined();
    }
  });

  it("should parse a full web config", () => {
    const input = {
      name: "staging-web",
      description: "Staging web environment",
      web: {
        baseUrl: "https://staging.example.com",
        browser: "firefox",
        headless: false,
        viewport: { width: 1920, height: 1080 },
        timeout: 60000,
      },
    };
    const result = EnvironmentConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("staging-web");
      expect(result.data.web!.baseUrl).toBe("https://staging.example.com");
      expect(result.data.web!.browser).toBe("firefox");
      expect(result.data.web!.headless).toBe(false);
      expect(result.data.web!.viewport!.width).toBe(1920);
      expect(result.data.web!.timeout).toBe(60000);
    }
  });

  it("should parse a full salesforce config", () => {
    const input = {
      name: "sf-sandbox",
      salesforce: {
        loginUrl: "https://test.salesforce.com",
        apiVersion: "62.0",
        authMethod: "oauth",
        credentialKey: "sf-creds",
      },
    };
    const result = EnvironmentConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salesforce!.loginUrl).toBe("https://test.salesforce.com");
      expect(result.data.salesforce!.apiVersion).toBe("62.0");
      expect(result.data.salesforce!.authMethod).toBe("oauth");
      expect(result.data.salesforce!.credentialKey).toBe("sf-creds");
    }
  });

  it("should apply defaults for web browser and headless", () => {
    const input = {
      name: "defaults-test",
      web: { baseUrl: "https://example.com" },
    };
    const result = EnvironmentConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.web!.browser).toBe("chromium");
      expect(result.data.web!.headless).toBe(true);
      expect(result.data.web!.timeout).toBe(30000);
    }
  });

  it("should reject an invalid web baseUrl", () => {
    const result = EnvironmentConfigSchema.safeParse({
      name: "bad",
      web: { baseUrl: "not-a-url" },
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing name", () => {
    const result = EnvironmentConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("GatewayConfigSchema", () => {
  const validGatewayConfig = {
    environments: { default: { name: "default" } },
    defaultEnvironment: "default",
    mcpServers: {},
    execution: {},
    reporting: {},
  };

  it("should parse with defaults applied", () => {
    const result = GatewayConfigSchema.safeParse(validGatewayConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.port).toBe(3100);
      expect(result.data.host).toBe("localhost");
      expect(result.data.logLevel).toBe("info");
      expect(result.data.execution.maxParallelTests).toBe(4);
      expect(result.data.execution.defaultTimeout).toBe(300000);
      expect(result.data.execution.retryAttempts).toBe(1);
      expect(result.data.execution.retryDelay).toBe(5000);
      expect(result.data.reporting.outputDir).toBe("./reports");
      expect(result.data.reporting.formats).toEqual(["json"]);
      expect(result.data.reporting.screenshotsOnFailure).toBe(true);
    }
  });

  it("should parse with explicit values overriding defaults", () => {
    const input = {
      port: 4000,
      host: "0.0.0.0",
      logLevel: "debug" as const,
      environments: { prod: { name: "prod" } },
      defaultEnvironment: "prod",
      mcpServers: {
        web: { command: "node", args: ["dist/index.js"] },
      },
      execution: { maxParallelTests: 8, defaultTimeout: 60000, retryAttempts: 3, retryDelay: 1000 },
      reporting: { outputDir: "/tmp/reports", formats: ["json", "html"] as const, screenshotsOnFailure: false },
    };
    const result = GatewayConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.port).toBe(4000);
      expect(result.data.host).toBe("0.0.0.0");
      expect(result.data.logLevel).toBe("debug");
      expect(result.data.mcpServers.web!.command).toBe("node");
    }
  });

  it("should reject missing required field: environments", () => {
    const result = GatewayConfigSchema.safeParse({
      defaultEnvironment: "default",
      mcpServers: {},
      execution: {},
      reporting: {},
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing required field: defaultEnvironment", () => {
    const result = GatewayConfigSchema.safeParse({
      environments: { default: { name: "default" } },
      mcpServers: {},
      execution: {},
      reporting: {},
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing required field: execution", () => {
    const result = GatewayConfigSchema.safeParse({
      environments: { default: { name: "default" } },
      defaultEnvironment: "default",
      mcpServers: {},
      reporting: {},
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid logLevel", () => {
    const result = GatewayConfigSchema.safeParse({
      ...validGatewayConfig,
      logLevel: "verbose",
    });
    expect(result.success).toBe(false);
  });
});
