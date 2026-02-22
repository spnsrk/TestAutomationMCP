import { z } from "zod";

export const EnvironmentConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),

  web: z
    .object({
      baseUrl: z.string().url(),
      browser: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
      headless: z.boolean().default(true),
      viewport: z
        .object({
          width: z.number().default(1280),
          height: z.number().default(720),
        })
        .optional(),
      timeout: z.number().default(30000),
    })
    .optional(),

  salesforce: z
    .object({
      loginUrl: z.string().url(),
      apiVersion: z.string().default("62.0"),
      authMethod: z.enum(["oauth", "soap", "jwt"]).default("oauth"),
      credentialKey: z.string(),
    })
    .optional(),

  sap: z
    .object({
      fioriUrl: z.string().url().optional(),
      guiHost: z.string().optional(),
      guiPort: z.number().optional(),
      systemId: z.string().optional(),
      client: z.string().optional(),
      rfcDestination: z.string().optional(),
      credentialKey: z.string(),
    })
    .optional(),

  database: z
    .object({
      type: z.enum(["postgresql", "mysql", "mssql", "mongodb", "redis"]),
      host: z.string(),
      port: z.number(),
      database: z.string(),
      credentialKey: z.string(),
      ssl: z.boolean().default(false),
    })
    .optional(),

  api: z
    .object({
      baseUrl: z.string().url(),
      authType: z.enum(["bearer", "basic", "apikey", "oauth2", "none"]).default("none"),
      credentialKey: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

export const GatewayConfigSchema = z.object({
  port: z.number().default(3100),
  host: z.string().default("localhost"),
  logLevel: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  environments: z.record(z.string(), EnvironmentConfigSchema),
  defaultEnvironment: z.string(),
  mcpServers: z.object({
    web: z.object({ command: z.string(), args: z.array(z.string()) }).optional(),
    salesforce: z.object({ command: z.string(), args: z.array(z.string()) }).optional(),
    sap: z.object({ command: z.string(), args: z.array(z.string()) }).optional(),
    api: z.object({ command: z.string(), args: z.array(z.string()) }).optional(),
    data: z.object({ command: z.string(), args: z.array(z.string()) }).optional(),
  }),
  execution: z.object({
    maxParallelTests: z.number().default(4),
    defaultTimeout: z.number().default(300000),
    retryAttempts: z.number().default(1),
    retryDelay: z.number().default(5000),
  }),
  reporting: z.object({
    outputDir: z.string().default("./reports"),
    formats: z.array(z.enum(["json", "html", "allure", "junit"])).default(["json"]),
    screenshotsOnFailure: z.boolean().default(true),
  }),
});
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
