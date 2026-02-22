import type { TestDefinition, TestSuite } from "./test-definition.js";
import type { TestResult, SuiteResult } from "./tool-result.js";

export type AgentRole =
  | "strategist"
  | "generator"
  | "executor"
  | "analyzer";

export interface AgentMessage<T = unknown> {
  id: string;
  from: AgentRole;
  to: AgentRole;
  timestamp: string;
  type: AgentMessageType;
  payload: T;
  correlationId?: string;
}

export type AgentMessageType =
  | "test_plan_request"
  | "test_plan_response"
  | "test_generation_request"
  | "test_generation_response"
  | "test_execution_request"
  | "test_execution_response"
  | "analysis_request"
  | "analysis_response"
  | "feedback";

export interface TestPlanRequest {
  scope: string;
  requirements?: string[];
  changedFiles?: string[];
  tags?: string[];
  targetSystems: ("web" | "salesforce" | "sap" | "api" | "data")[];
}

export interface TestPlanResponse {
  plan: {
    testCases: PlannedTestCase[];
    priority: string[];
    estimatedDuration: number;
    coverageTargets: CoverageTarget[];
  };
}

export interface PlannedTestCase {
  id: string;
  name: string;
  description: string;
  type: string;
  priority: string;
  targetSystems: string[];
  estimatedDuration: number;
}

export interface CoverageTarget {
  system: string;
  area: string;
  currentCoverage: number;
  targetCoverage: number;
}

export interface TestGenerationRequest {
  plannedTests: PlannedTestCase[];
  existingTests?: TestDefinition[];
  variables?: Record<string, unknown>;
}

export interface TestGenerationResponse {
  tests: TestDefinition[];
  testData: Record<string, unknown>;
  warnings?: string[];
}

export interface TestExecutionRequest {
  tests: TestDefinition[];
  suite?: TestSuite;
  environment: string;
  parallel?: boolean;
  maxWorkers?: number;
  variables?: Record<string, unknown>;
}

export interface TestExecutionResponse {
  results: TestResult[];
  suiteResult?: SuiteResult;
}

export interface AnalysisRequest {
  results: TestResult[];
  suiteResult?: SuiteResult;
  historicalResults?: SuiteResult[];
}

export interface AnalysisResponse {
  summary: AnalysisSummary;
  failures: FailureAnalysis[];
  recommendations: string[];
  trends?: TrendData[];
}

export interface AnalysisSummary {
  overallStatus: string;
  passRate: number;
  flakinessScore: number;
  criticalFailures: number;
  newFailures: number;
  fixedTests: number;
}

export interface FailureAnalysis {
  testId: string;
  testName: string;
  rootCause: string;
  category: "bug" | "environment" | "flaky" | "data" | "configuration" | "unknown";
  confidence: number;
  suggestedFix?: string;
  relatedTests?: string[];
}

export interface TrendData {
  date: string;
  passRate: number;
  totalTests: number;
  avgDuration: number;
  flakyTests: number;
}
