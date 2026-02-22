export {
  TestDefinitionSchema,
  TestSuiteSchema,
  TestStepSchema,
  TestPrioritySchema,
  TestTypeSchema,
  AssertionSchema,
} from "./types/test-definition.js";
export type {
  TestDefinition,
  TestSuite,
  TestStep,
  TestPriority,
  TestType,
  Assertion,
} from "./types/test-definition.js";

export type {
  ToolResult,
  ToolResultStatus,
  StepResult,
  AssertionResult,
  TestResult,
  SuiteResult,
  NetworkEntry,
} from "./types/tool-result.js";

export type {
  AgentRole,
  AgentMessage,
  AgentMessageType,
  TestPlanRequest,
  TestPlanResponse,
  PlannedTestCase,
  CoverageTarget,
  TestGenerationRequest,
  TestGenerationResponse,
  TestExecutionRequest,
  TestExecutionResponse,
  AnalysisRequest,
  AnalysisResponse,
  AnalysisSummary,
  FailureAnalysis,
  TrendData,
} from "./types/agent-messages.js";

export {
  EnvironmentConfigSchema,
  GatewayConfigSchema,
} from "./types/config.js";
export type {
  EnvironmentConfig,
  GatewayConfig,
} from "./types/config.js";

export {
  loadTestDefinition,
  loadTestSuite,
  validateTestDefinition,
  validateTestSuite,
} from "./schema/test-definition.schema.js";

export { ToolRegistry } from "./utils/registry.js";
export type { ToolDescriptor } from "./utils/registry.js";

export { VariableResolver } from "./utils/variables.js";

export { createLogger, createChildLogger } from "./utils/logger.js";
export type { LogLevel } from "./utils/logger.js";

export {
  TestAutomationError,
  ConnectionError,
  AuthenticationError,
  ToolExecutionError,
  TestDefinitionError,
  TimeoutError,
  AssertionError,
} from "./utils/errors.js";
