import { z } from "zod";

export const TestPrioritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);
export type TestPriority = z.infer<typeof TestPrioritySchema>;

export const TestTypeSchema = z.enum([
  "e2e",
  "integration",
  "api",
  "ui",
  "data-validation",
  "performance",
  "regression",
  "smoke",
]);
export type TestType = z.infer<typeof TestTypeSchema>;

export const AssertionSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()])
);
export type Assertion = z.infer<typeof AssertionSchema>;

export const TestStepSchema = z.object({
  name: z.string(),
  action: z.string().optional(),
  description: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  object: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  query: z.string().optional(),
  function: z.string().optional(),
  url: z.string().optional(),
  selector: z.string().optional(),
  value: z.string().optional(),
  save_as: z.string().optional(),
  assert: z.array(AssertionSchema).optional(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
  continueOnFailure: z.boolean().optional(),
});
export type TestStep = z.infer<typeof TestStepSchema>;

export const TestDefinitionSchema = z.object({
  test: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    type: TestTypeSchema,
    priority: TestPrioritySchema.default("medium"),
    tags: z.array(z.string()).default([]),
    timeout: z.number().default(300000),
    retries: z.number().default(0),

    variables: z.record(z.string(), z.unknown()).optional(),

    setup: z.array(TestStepSchema).optional(),
    steps: z.array(TestStepSchema).min(1),
    teardown: z.array(TestStepSchema).optional(),
  }),
});
export type TestDefinition = z.infer<typeof TestDefinitionSchema>;

export const TestSuiteSchema = z.object({
  suite: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    parallel: z.boolean().default(false),
    maxWorkers: z.number().default(1),
    tests: z.array(z.string()),
    variables: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type TestSuite = z.infer<typeof TestSuiteSchema>;
