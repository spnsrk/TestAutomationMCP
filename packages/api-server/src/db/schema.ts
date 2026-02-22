import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // pdf, docx, xlsx, text
  status: text("status").notNull().default("uploaded"), // uploaded, parsing, parsed, error
  rawContent: text("raw_content"),
  parsedRequirements: text("parsed_requirements"), // JSON string
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const testPlans = sqliteTable("test_plans", {
  id: text("id").primaryKey(),
  documentId: text("document_id").references(() => documents.id),
  status: text("status").notNull().default("draft"), // draft, approved, rejected
  planJson: text("plan_json").notNull(), // JSON string of TestPlanResponse
  requirementsJson: text("requirements_json"), // JSON string of structured requirements
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const testDefinitions = sqliteTable("test_definitions", {
  id: text("id").primaryKey(),
  testPlanId: text("test_plan_id").references(() => testPlans.id),
  name: text("name").notNull(),
  definitionYaml: text("definition_yaml").notNull(), // YAML string
  definitionJson: text("definition_json").notNull(), // JSON string of TestDefinition
  createdAt: text("created_at").notNull(),
});

export const testRuns = sqliteTable("test_runs", {
  id: text("id").primaryKey(),
  testPlanId: text("test_plan_id").references(() => testPlans.id),
  status: text("status").notNull().default("queued"), // queued, running, completed, failed
  environment: text("environment").notNull().default("default"),
  parallel: integer("parallel", { mode: "boolean" }).default(false),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  resultsSummaryJson: text("results_summary_json"), // JSON string
  createdAt: text("created_at").notNull(),
});

export const testResults = sqliteTable("test_results", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => testRuns.id),
  testId: text("test_id").notNull(),
  testName: text("test_name").notNull(),
  status: text("status").notNull(), // success, failure, error, skipped
  duration: integer("duration").notNull().default(0),
  resultJson: text("result_json").notNull(), // JSON string of TestResult
  analysisJson: text("analysis_json"), // JSON string of analysis
  createdAt: text("created_at").notNull(),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type TestPlan = typeof testPlans.$inferSelect;
export type NewTestPlan = typeof testPlans.$inferInsert;
export type TestDefinitionRow = typeof testDefinitions.$inferSelect;
export type TestRun = typeof testRuns.$inferSelect;
export type TestResultRow = typeof testResults.$inferSelect;
