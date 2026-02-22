import type {
  TestGenerationRequest,
  TestGenerationResponse,
  PlannedTestCase,
  TestDefinition,
  TestStep,
  TestType,
  TestPriority,
} from "@test-automation-mcp/core";
import { createLogger } from "@test-automation-mcp/core";
import {
  webLoginTemplate,
  sfCrudTemplate,
  sapTransactionTemplate,
  apiCrudTemplate,
  crossSystemTemplate,
  dataValidationTemplate,
} from "./templates.js";

const logger = createLogger("generator-agent");

const VALID_TEST_TYPES: Set<string> = new Set([
  "e2e", "integration", "api", "ui", "data-validation",
  "performance", "regression", "smoke",
]);

const VALID_PRIORITIES: Set<string> = new Set([
  "critical", "high", "medium", "low",
]);

interface SystemDefaults {
  setupSteps: TestStep[];
  teardownSteps: TestStep[];
}

const SYSTEM_DEFAULTS: Record<string, SystemDefaults> = {
  web: {
    setupSteps: [
      {
        name: "Launch browser",
        action: "web/launch",
        params: { headless: "${headless_mode}" },
      },
      {
        name: "Set viewport",
        action: "web/setViewport",
        params: { width: 1280, height: 720 },
      },
    ],
    teardownSteps: [
      {
        name: "Capture final screenshot",
        action: "web/screenshot",
        params: { fullPage: true },
        save_as: "final_screenshot",
        continueOnFailure: true,
      },
      {
        name: "Close browser",
        action: "web/close",
        continueOnFailure: true,
      },
    ],
  },
  salesforce: {
    setupSteps: [
      {
        name: "Authenticate with Salesforce",
        action: "sf/auth.login",
        params: {
          loginUrl: "${sf_login_url}",
          username: "${sf_username}",
          password: "${sf_password}",
        },
        save_as: "sf_session",
        assert: [{ "result.success": true }],
      },
    ],
    teardownSteps: [
      {
        name: "Cleanup test data",
        action: "sf/data.deleteRecord",
        object: "${cleanup_object}",
        data: { Id: "${cleanup_record_id}" },
        continueOnFailure: true,
      },
      {
        name: "Logout from Salesforce",
        action: "sf/auth.logout",
        continueOnFailure: true,
      },
    ],
  },
  sap: {
    setupSteps: [
      {
        name: "Connect to SAP system",
        action: "sap/connect",
        params: {
          systemId: "${sap_system_id}",
          client: "${sap_client}",
          user: "${sap_username}",
          password: "${sap_password}",
        },
        save_as: "sap_session",
        assert: [{ "result.connected": true }],
      },
    ],
    teardownSteps: [
      {
        name: "Disconnect from SAP",
        action: "sap/disconnect",
        continueOnFailure: true,
      },
    ],
  },
  api: {
    setupSteps: [
      {
        name: "Configure API client",
        action: "api/configure",
        params: {
          baseUrl: "${api_base_url}",
          authType: "${api_auth_type}",
          token: "${api_token}",
        },
      },
    ],
    teardownSteps: [],
  },
  data: {
    setupSteps: [
      {
        name: "Connect to database",
        action: "data/connect",
        params: {
          host: "${db_host}",
          port: "${db_port}",
          database: "${db_name}",
          user: "${db_user}",
          password: "${db_password}",
        },
        save_as: "db_connection",
        assert: [{ "result.connected": true }],
      },
    ],
    teardownSteps: [
      {
        name: "Disconnect from database",
        action: "data/disconnect",
        continueOnFailure: true,
      },
    ],
  },
};

export class GeneratorAgent {
  async generate(
    request: TestGenerationRequest,
  ): Promise<TestGenerationResponse> {
    logger.info(
      { plannedCount: request.plannedTests.length },
      "Generating test definitions",
    );

    const tests: TestDefinition[] = [];
    const warnings: string[] = [];

    for (const planned of request.plannedTests) {
      try {
        const definition = this.generateTestCase(planned);

        if (request.variables) {
          definition.test.variables = {
            ...definition.test.variables,
            ...request.variables,
          };
        }

        if (request.existingTests) {
          const duplicate = request.existingTests.find(
            (existing) =>
              existing.test.name === definition.test.name ||
              existing.test.id === definition.test.id,
          );
          if (duplicate) {
            warnings.push(
              `Test "${planned.name}" may duplicate existing test "${duplicate.test.name}" (${duplicate.test.id})`,
            );
          }
        }

        tests.push(definition);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`Failed to generate test for "${planned.name}": ${message}`);
        logger.error({ planned, err: message }, "Test generation failed for planned case");
      }
    }

    const testData = this.generateTestData(tests);

    logger.info(
      { generated: tests.length, warnings: warnings.length },
      "Test generation complete",
    );

    return { tests, testData, warnings: warnings.length > 0 ? warnings : undefined };
  }

  generateTestCase(planned: PlannedTestCase): TestDefinition {
    const primarySystem = planned.targetSystems[0] ?? "web";
    const testType = this.resolveTestType(planned.type);
    const priority = this.resolvePriority(planned.priority);

    const steps = this.buildStepsForPlan(planned);
    const defaults = SYSTEM_DEFAULTS[primarySystem];
    const setup = defaults?.setupSteps ?? [];
    const teardown = defaults?.teardownSteps ?? [];

    return {
      test: {
        id: planned.id,
        name: planned.name,
        description: planned.description,
        type: testType,
        priority,
        tags: [
          ...planned.targetSystems,
          planned.type,
          planned.priority,
        ],
        timeout: Math.max(planned.estimatedDuration, 60000),
        retries: priority === "critical" ? 2 : 1,
        variables: {},
        setup,
        steps,
        teardown,
      },
    };
  }

  generateTestData(tests: TestDefinition[]): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    const systems = new Set<string>();
    for (const test of tests) {
      for (const tag of test.test.tags) {
        if (["web", "salesforce", "sap", "api", "data"].includes(tag)) {
          systems.add(tag);
        }
      }
    }

    if (systems.has("web")) {
      data["web"] = {
        login_username: "test_user@example.com",
        login_password: "Test_P@ssw0rd!",
        headless_mode: true,
        base_url: "https://app.example.com",
      };
    }

    if (systems.has("salesforce")) {
      data["salesforce"] = {
        sf_login_url: "https://test.salesforce.com",
        sf_username: "testuser@example.com.sandbox",
        sf_password: "SfTestPass123!",
        test_account: {
          Name: "Test Account — Automation",
          Industry: "Technology",
          BillingCity: "San Francisco",
        },
        test_contact: {
          FirstName: "Test",
          LastName: "Automation",
          Email: "test.automation@example.com",
        },
        test_opportunity: {
          Name: "Test Opportunity — Automation",
          StageName: "Prospecting",
          CloseDate: "2026-12-31",
          Amount: 10000,
        },
      };
    }

    if (systems.has("sap")) {
      data["sap"] = {
        sap_system_id: "DEV",
        sap_client: "100",
        sap_username: "TESTUSER",
        sap_password: "SapTest123!",
        test_material: {
          MATERIAL: "TEST-MAT-001",
          DESCRIPTION: "Test Material — Automation",
          UNIT: "EA",
        },
        test_purchase_order: {
          VENDOR: "0000001000",
          PURCH_ORG: "1000",
          PUR_GROUP: "001",
          COMP_CODE: "1000",
        },
      };
    }

    if (systems.has("api")) {
      data["api"] = {
        api_base_url: "https://api.example.com/v1",
        api_auth_type: "bearer",
        api_token: "${API_TOKEN}",
        resource_create: {
          name: "Test Resource — Automation",
          status: "active",
        },
        resource_update: {
          name: "Test Resource — Updated",
          status: "inactive",
        },
      };
    }

    if (systems.has("data")) {
      data["data"] = {
        db_host: "localhost",
        db_port: 5432,
        db_name: "testdb",
        db_user: "test_user",
        db_password: "${DB_PASSWORD}",
        validation_query: "SELECT * FROM test_table WHERE environment = 'test'",
      };
    }

    return data;
  }

  private resolveTestType(type: string): TestType {
    if (VALID_TEST_TYPES.has(type)) return type as TestType;
    if (type.includes("e2e") || type.includes("end-to-end")) return "e2e";
    if (type.includes("integ")) return "integration";
    if (type.includes("api") || type.includes("rest")) return "api";
    if (type.includes("ui") || type.includes("frontend")) return "ui";
    if (type.includes("data") || type.includes("validation")) return "data-validation";
    if (type.includes("perf") || type.includes("load")) return "performance";
    if (type.includes("regress")) return "regression";
    if (type.includes("smoke") || type.includes("sanity")) return "smoke";
    return "e2e";
  }

  private resolvePriority(priority: string): TestPriority {
    if (VALID_PRIORITIES.has(priority)) return priority as TestPriority;
    return "medium";
  }

  private buildStepsForPlan(planned: PlannedTestCase): TestStep[] {
    const primarySystem = planned.targetSystems[0] ?? "web";
    const type = planned.type.toLowerCase();

    if (planned.targetSystems.length > 1) {
      return crossSystemTemplate(
        planned.targetSystems[0],
        planned.targetSystems[1],
      );
    }

    switch (primarySystem) {
      case "web":
        return this.buildWebSteps(type, planned);
      case "salesforce":
        return this.buildSalesforceSteps(type, planned);
      case "sap":
        return this.buildSapSteps(type, planned);
      case "api":
        return this.buildApiSteps(type, planned);
      case "data":
        return this.buildDataSteps(type, planned);
      default:
        return this.buildGenericSteps(planned);
    }
  }

  private buildWebSteps(type: string, planned: PlannedTestCase): TestStep[] {
    switch (type) {
      case "e2e":
        return [
          ...webLoginTemplate("${base_url}"),
          {
            name: "Navigate to target page",
            action: "web/navigate",
            url: "${base_url}/${target_path}",
          },
          {
            name: "Perform primary action",
            action: "web/click",
            selector: "${primary_action_selector}",
          },
          {
            name: "Verify result",
            action: "web/waitForSelector",
            selector: "${success_indicator_selector}",
            timeout: 10000,
            assert: [{ "element.visible": true }],
          },
        ];
      case "ui":
        return [
          {
            name: "Navigate to page under test",
            action: "web/navigate",
            url: "${base_url}/${page_path}",
          },
          {
            name: "Wait for page load",
            action: "web/waitForSelector",
            selector: "${page_ready_selector}",
            timeout: 10000,
          },
          {
            name: "Verify page layout",
            action: "web/snapshot",
            save_as: "page_snapshot",
            assert: [{ "snapshot.status": "loaded" }],
          },
          {
            name: "Interact with primary element",
            action: "web/click",
            selector: "${primary_element_selector}",
          },
          {
            name: "Verify interaction result",
            action: "web/getText",
            selector: "${result_selector}",
            save_as: "interaction_result",
            assert: [{ "result.text": "not_empty" }],
          },
        ];
      case "smoke":
        return [
          {
            name: "Navigate to application",
            action: "web/navigate",
            url: "${base_url}",
            assert: [{ "response.status": 200 }],
          },
          {
            name: "Verify page loads",
            action: "web/waitForSelector",
            selector: "body",
            timeout: 10000,
            assert: [{ "element.visible": true }],
          },
          {
            name: "Check for console errors",
            action: "web/getConsoleErrors",
            save_as: "console_errors",
            assert: [{ "result.errorCount": 0 }],
          },
        ];
      case "regression":
        return [
          ...webLoginTemplate("${base_url}"),
          {
            name: "Navigate to regression target",
            action: "web/navigate",
            url: "${base_url}/${regression_path}",
          },
          {
            name: "Execute regression scenario",
            action: "web/click",
            selector: "${regression_trigger_selector}",
          },
          {
            name: "Verify no regression",
            action: "web/getText",
            selector: "${verification_selector}",
            save_as: "regression_result",
            assert: [{ "result.text": "${expected_text}" }],
          },
        ];
      case "performance":
        return [
          {
            name: "Start performance measurement",
            action: "web/startPerformance",
            save_as: "perf_start",
          },
          {
            name: "Navigate to target page",
            action: "web/navigate",
            url: "${base_url}/${perf_target_path}",
          },
          {
            name: "Wait for full load",
            action: "web/waitForSelector",
            selector: "${page_ready_selector}",
            timeout: 30000,
          },
          {
            name: "Collect performance metrics",
            action: "web/getPerformanceMetrics",
            save_as: "perf_metrics",
            assert: [
              { "metrics.firstContentfulPaint": "less_than_3000" },
              { "metrics.largestContentfulPaint": "less_than_4000" },
            ],
          },
        ];
      default:
        return this.buildGenericSteps(planned);
    }
  }

  private buildSalesforceSteps(
    type: string,
    planned: PlannedTestCase,
  ): TestStep[] {
    switch (type) {
      case "integration":
        return sfCrudTemplate("${sf_object_name}", {
          Name: "${record_name}",
          Description: "Automated test record",
        });
      case "api":
        return [
          {
            name: "Query Salesforce via REST",
            action: "sf/data.soqlQuery",
            query: "${sf_query}",
            save_as: "query_result",
            assert: [{ "result.done": true }],
          },
          {
            name: "Verify query results",
            action: "sf/data.soqlQuery",
            query: "SELECT COUNT() FROM ${sf_object_name}",
            save_as: "count_result",
            assert: [{ "result.totalSize": "greater_than_0" }],
          },
        ];
      case "data-validation":
        return [
          {
            name: "Query source data",
            action: "sf/data.soqlQuery",
            query: "${validation_query}",
            save_as: "source_data",
            assert: [{ "result.totalSize": "greater_than_0" }],
          },
          {
            name: "Validate field completeness",
            action: "sf/data.soqlQuery",
            query: "SELECT Id FROM ${sf_object_name} WHERE ${required_field} = null",
            save_as: "null_check",
            assert: [{ "result.totalSize": 0 }],
          },
          {
            name: "Validate referential integrity",
            action: "sf/data.soqlQuery",
            query: "SELECT Id FROM ${sf_object_name} WHERE ${lookup_field} NOT IN (SELECT Id FROM ${related_object})",
            save_as: "orphan_check",
            assert: [{ "result.totalSize": 0 }],
          },
        ];
      case "e2e":
        return [
          {
            name: "Navigate to Salesforce record",
            action: "web/navigate",
            url: "${sf_instance_url}/${sf_object_name}/new",
          },
          {
            name: "Fill record form",
            action: "web/fill",
            selector: "input[name='Name']",
            value: "${record_name}",
          },
          {
            name: "Save record",
            action: "web/click",
            selector: "button[title='Save']",
          },
          {
            name: "Verify record created via API",
            action: "sf/data.soqlQuery",
            query: "SELECT Id, Name FROM ${sf_object_name} WHERE Name = '${record_name}' ORDER BY CreatedDate DESC LIMIT 1",
            save_as: "created_record",
            assert: [{ "result.totalSize": 1 }],
          },
        ];
      default:
        return this.buildGenericSteps(planned);
    }
  }

  private buildSapSteps(type: string, planned: PlannedTestCase): TestStep[] {
    switch (type) {
      case "integration":
        return sapTransactionTemplate("${sap_tcode}", {
          MaterialNumber: "${material_number}",
          Plant: "${plant_code}",
        });
      case "e2e":
        return [
          {
            name: "Navigate to Fiori Launchpad",
            action: "web/navigate",
            url: "${sap_fiori_url}/cp.portal/site#Shell-home",
          },
          {
            name: "Open Fiori app",
            action: "web/click",
            selector: "[data-tile-id='${fiori_app_id}']",
          },
          {
            name: "Wait for app to load",
            action: "web/waitForSelector",
            selector: ".sapMPage",
            timeout: 15000,
          },
          {
            name: "Execute business action",
            action: "web/click",
            selector: "${fiori_action_selector}",
          },
          {
            name: "Verify via RFC",
            action: "sap/rfc.callFunction",
            function: "${verification_bapi}",
            params: { KEY: "${verification_key}" },
            save_as: "verification_result",
            assert: [{ "result.RETURN.TYPE": "S" }],
          },
        ];
      case "data-validation":
        return [
          {
            name: "Read SAP table data",
            action: "sap/rfc.callFunction",
            function: "RFC_READ_TABLE",
            params: {
              QUERY_TABLE: "${sap_table}",
              ROWCOUNT: 100,
              OPTIONS: [{ TEXT: "${sap_where_clause}" }],
            },
            save_as: "table_data",
            assert: [{ "result.DATA": "not_empty" }],
          },
          {
            name: "Validate record counts",
            action: "sap/rfc.callFunction",
            function: "RFC_READ_TABLE",
            params: {
              QUERY_TABLE: "${sap_table}",
              ROWCOUNT: 0,
              OPTIONS: [{ TEXT: "${sap_where_clause}" }],
            },
            save_as: "count_result",
          },
        ];
      default:
        return this.buildGenericSteps(planned);
    }
  }

  private buildApiSteps(type: string, planned: PlannedTestCase): TestStep[] {
    switch (type) {
      case "api":
        return apiCrudTemplate("${api_endpoint}", "PUT");
      case "integration":
        return [
          {
            name: "Authenticate with API",
            action: "api/request",
            params: {
              method: "POST",
              path: "/auth/token",
              body: {
                grant_type: "client_credentials",
                client_id: "${client_id}",
                client_secret: "${client_secret}",
              },
            },
            save_as: "auth_response",
            assert: [
              { "response.status": 200 },
              { "response.body.access_token": "not_empty" },
            ],
          },
          {
            name: "Call integration endpoint",
            action: "api/request",
            params: {
              method: "POST",
              path: "${integration_endpoint}",
              headers: {
                Authorization: "Bearer ${auth_response.body.access_token}",
              },
              body: "${integration_payload}",
            },
            save_as: "integration_response",
            assert: [{ "response.status": 200 }],
          },
          {
            name: "Verify integration result",
            action: "api/request",
            params: {
              method: "GET",
              path: "${integration_status_endpoint}/${integration_response.body.id}",
            },
            save_as: "status_response",
            assert: [
              { "response.status": 200 },
              { "response.body.status": "completed" },
            ],
            retries: 3,
            timeout: 15000,
          },
        ];
      case "smoke":
        return [
          {
            name: "Health check",
            action: "api/request",
            params: { method: "GET", path: "/health" },
            assert: [{ "response.status": 200 }],
          },
          {
            name: "Version check",
            action: "api/request",
            params: { method: "GET", path: "/version" },
            save_as: "version_response",
            assert: [
              { "response.status": 200 },
              { "response.body.version": "not_empty" },
            ],
          },
        ];
      case "performance":
        return [
          {
            name: "Warm up endpoint",
            action: "api/request",
            params: { method: "GET", path: "${perf_endpoint}" },
          },
          {
            name: "Measure response time",
            action: "api/request",
            params: { method: "GET", path: "${perf_endpoint}" },
            save_as: "perf_response",
            assert: [
              { "response.status": 200 },
              { "response.duration": "less_than_2000" },
            ],
          },
          {
            name: "Measure under load",
            action: "api/loadTest",
            params: {
              method: "GET",
              path: "${perf_endpoint}",
              concurrency: 10,
              duration: 30000,
            },
            save_as: "load_result",
            assert: [
              { "result.p95": "less_than_3000" },
              { "result.errorRate": "less_than_0.01" },
            ],
          },
        ];
      default:
        return this.buildGenericSteps(planned);
    }
  }

  private buildDataSteps(
    type: string,
    planned: PlannedTestCase,
  ): TestStep[] {
    switch (type) {
      case "data-validation":
        return dataValidationTemplate(
          "${validation_query}",
          { "result.rowCount": "greater_than_0" },
        );
      case "integration":
        return [
          {
            name: "Execute source query",
            action: "data/query",
            query: "${source_query}",
            save_as: "source_data",
            assert: [{ "result.rowCount": "greater_than_0" }],
          },
          {
            name: "Execute target query",
            action: "data/query",
            query: "${target_query}",
            save_as: "target_data",
            assert: [{ "result.rowCount": "greater_than_0" }],
          },
          {
            name: "Compare record counts",
            action: "data/compare",
            params: {
              source: "${source_data}",
              target: "${target_data}",
              keys: "${comparison_keys}",
            },
            save_as: "comparison_result",
            assert: [
              { "result.matchRate": "greater_than_0.99" },
              { "result.missingInTarget": 0 },
            ],
          },
        ];
      default:
        return this.buildGenericSteps(planned);
    }
  }

  private buildGenericSteps(planned: PlannedTestCase): TestStep[] {
    return [
      {
        name: `Initialize ${planned.targetSystems.join(", ")} test`,
        action: "util/log",
        params: {
          message: `Starting test: ${planned.name}`,
          level: "info",
        },
      },
      {
        name: "Execute primary validation",
        action: "util/assert",
        params: {
          condition: "${primary_condition}",
          message: "Primary validation for: " + planned.description,
        },
        assert: [{ "result.passed": true }],
      },
      {
        name: "Collect results",
        action: "util/log",
        params: {
          message: `Completed test: ${planned.name}`,
          level: "info",
        },
      },
    ];
  }
}
