import type { Connector, ConnectorConfig, ConnectorQuery, RequirementDocument } from "./connector.js";
import { JiraConnector } from "./providers/jira.js";
import { GitHubConnector } from "./providers/github.js";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("connector-registry");

const CONNECTORS: Record<string, () => Connector> = {
  jira: () => new JiraConnector(),
  github: () => new GitHubConnector(),
};

export class ConnectorRegistry {
  private instances = new Map<string, Connector>();

  async register(name: string, config: ConnectorConfig): Promise<Connector> {
    const factory = CONNECTORS[name];
    if (!factory) {
      throw new Error(`Unknown connector: ${name}. Available: ${Object.keys(CONNECTORS).join(", ")}`);
    }

    const connector = factory();
    await connector.authenticate(config);

    const connected = await connector.testConnection();
    if (!connected) {
      logger.warn({ name }, "Connector authenticated but connection test failed");
    }

    this.instances.set(name, connector);
    logger.info({ name, connected }, "Connector registered");
    return connector;
  }

  get(name: string): Connector | undefined {
    return this.instances.get(name);
  }

  list(): string[] {
    return Array.from(this.instances.keys());
  }

  listAvailable(): string[] {
    return Object.keys(CONNECTORS);
  }

  async fetchRequirements(name: string, query: ConnectorQuery): Promise<RequirementDocument[]> {
    const connector = this.instances.get(name);
    if (!connector) {
      throw new Error(`Connector '${name}' not registered. Call register() first.`);
    }
    return connector.fetchRequirements(query);
  }
}
