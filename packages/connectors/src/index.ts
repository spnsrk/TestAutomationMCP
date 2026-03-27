export {
  ConnectorConfigSchema,
  type ConnectorConfig,
  type RequirementDocument,
  type ConnectorQuery,
  type Connector,
} from "./connector.js";

export { ConnectorRegistry } from "./registry.js";
export { JiraConnector } from "./providers/jira.js";
export { GitHubConnector } from "./providers/github.js";
export { SalesforceConnector, generateCodeVerifier, generateCodeChallenge } from "./providers/salesforce.js";
export type { SalesforceCredentials, SalesforceTokens } from "./providers/salesforce.js";
