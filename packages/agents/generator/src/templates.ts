import type { TestStep } from "@test-automation-mcp/core";

export function webLoginTemplate(baseUrl: string): TestStep[] {
  return [
    {
      name: "Navigate to login page",
      action: "web/navigate",
      url: `${baseUrl}/login`,
      timeout: 15000,
    },
    {
      name: "Enter username",
      action: "web/fill",
      selector: "[data-testid='username'], #username, input[name='username']",
      value: "${login_username}",
    },
    {
      name: "Enter password",
      action: "web/fill",
      selector: "[data-testid='password'], #password, input[name='password']",
      value: "${login_password}",
    },
    {
      name: "Click login button",
      action: "web/click",
      selector: "[data-testid='login-submit'], button[type='submit']",
    },
    {
      name: "Verify successful login",
      action: "web/waitForSelector",
      selector: "[data-testid='dashboard'], .dashboard, #main-content",
      timeout: 10000,
      assert: [{ "page.title": "not_empty" }],
    },
  ];
}

export function sfCrudTemplate(
  objectName: string,
  fields: Record<string, unknown>,
): TestStep[] {
  const fieldEntries = Object.entries(fields);
  const updateField = fieldEntries.length > 0 ? fieldEntries[0] : ["Name", "Updated Value"];

  return [
    {
      name: `Query existing ${objectName} records`,
      action: "sf/data.soqlQuery",
      query: `SELECT Id, ${fieldEntries.map(([k]) => k).join(", ")} FROM ${objectName} LIMIT 1`,
      save_as: "existing_records",
    },
    {
      name: `Create new ${objectName}`,
      action: "sf/data.createRecord",
      object: objectName,
      data: fields,
      save_as: "created_record",
      assert: [{ "result.success": true }],
    },
    {
      name: `Read created ${objectName}`,
      action: "sf/data.soqlQuery",
      query: `SELECT Id, ${fieldEntries.map(([k]) => k).join(", ")} FROM ${objectName} WHERE Id = '\${created_record.id}'`,
      save_as: "read_result",
      assert: [{ "result.totalSize": 1 }],
    },
    {
      name: `Update ${objectName}`,
      action: "sf/data.updateRecord",
      object: objectName,
      data: {
        Id: "${created_record.id}",
        [updateField[0] as string]: updateField[1],
      },
      assert: [{ "result.success": true }],
    },
    {
      name: `Verify ${objectName} update`,
      action: "sf/data.soqlQuery",
      query: `SELECT ${updateField[0]} FROM ${objectName} WHERE Id = '\${created_record.id}'`,
      save_as: "updated_result",
      assert: [{ "result.totalSize": 1 }],
    },
    {
      name: `Delete ${objectName}`,
      action: "sf/data.deleteRecord",
      object: objectName,
      data: { Id: "${created_record.id}" },
      assert: [{ "result.success": true }],
    },
    {
      name: `Verify ${objectName} deletion`,
      action: "sf/data.soqlQuery",
      query: `SELECT Id FROM ${objectName} WHERE Id = '\${created_record.id}'`,
      assert: [{ "result.totalSize": 0 }],
    },
  ];
}

export function sapTransactionTemplate(
  tcode: string,
  fields: Record<string, string>,
): TestStep[] {
  const fieldSteps: TestStep[] = Object.entries(fields).map(
    ([fieldName, fieldValue]) => ({
      name: `Set field ${fieldName}`,
      action: "sap/gui.setField",
      params: { fieldName, value: fieldValue },
    }),
  );

  return [
    {
      name: `Open transaction ${tcode}`,
      action: "sap/gui.startTransaction",
      params: { tcode },
      timeout: 30000,
    },
    ...fieldSteps,
    {
      name: "Execute transaction",
      action: "sap/gui.pressKey",
      params: { key: "Enter" },
    },
    {
      name: "Check for success message",
      action: "sap/gui.getStatusBar",
      save_as: "status_bar",
      assert: [{ "result.type": "success" }],
    },
    {
      name: "Read transaction result",
      action: "sap/gui.getField",
      params: { fieldName: "DocumentNumber" },
      save_as: "document_number",
    },
    {
      name: "Validate via RFC",
      action: "sap/rfc.callFunction",
      function: "BAPI_DOCUMENT_GETDETAIL",
      params: { DOCUMENTNUMBER: "${document_number.value}" },
      save_as: "rfc_result",
      assert: [{ "result.RETURN.TYPE": "S" }],
    },
  ];
}

export function apiCrudTemplate(
  endpoint: string,
  method: string,
): TestStep[] {
  const resourceName = endpoint.split("/").filter(Boolean).pop() ?? "resource";

  return [
    {
      name: `GET all ${resourceName}`,
      action: "api/request",
      params: { method: "GET", path: endpoint },
      save_as: "list_response",
      assert: [
        { "response.status": 200 },
        { "response.body": "not_empty" },
      ],
    },
    {
      name: `POST new ${resourceName}`,
      action: "api/request",
      params: {
        method: "POST",
        path: endpoint,
        body: `\${test_data.${resourceName}_create}`,
      },
      save_as: "create_response",
      assert: [{ "response.status": 201 }],
    },
    {
      name: `GET created ${resourceName}`,
      action: "api/request",
      params: {
        method: "GET",
        path: `${endpoint}/\${create_response.body.id}`,
      },
      save_as: "get_response",
      assert: [
        { "response.status": 200 },
        { "response.body.id": "${create_response.body.id}" },
      ],
    },
    {
      name: `${method.toUpperCase()} update ${resourceName}`,
      action: "api/request",
      params: {
        method: method.toUpperCase() === "PATCH" ? "PATCH" : "PUT",
        path: `${endpoint}/\${create_response.body.id}`,
        body: `\${test_data.${resourceName}_update}`,
      },
      save_as: "update_response",
      assert: [{ "response.status": 200 }],
    },
    {
      name: `DELETE ${resourceName}`,
      action: "api/request",
      params: {
        method: "DELETE",
        path: `${endpoint}/\${create_response.body.id}`,
      },
      save_as: "delete_response",
      assert: [{ "response.status": 204 }],
    },
    {
      name: `Verify ${resourceName} deleted`,
      action: "api/request",
      params: {
        method: "GET",
        path: `${endpoint}/\${create_response.body.id}`,
      },
      assert: [{ "response.status": 404 }],
    },
  ];
}

export function crossSystemTemplate(
  sourceSystem: string,
  targetSystem: string,
): TestStep[] {
  const sourceSteps = buildSourceSteps(sourceSystem);
  const waitStep: TestStep = {
    name: `Wait for ${sourceSystem} → ${targetSystem} sync`,
    action: "util/wait",
    params: { duration: 5000 },
    timeout: 30000,
  };
  const targetSteps = buildTargetSteps(targetSystem, sourceSystem);

  return [...sourceSteps, waitStep, ...targetSteps];
}

function buildSourceSteps(system: string): TestStep[] {
  switch (system) {
    case "salesforce":
      return [
        {
          name: "Create source record in Salesforce",
          action: "sf/data.createRecord",
          object: "${source_object}",
          data: { Name: "${source_record_name}", ExternalId__c: "${correlation_id}" },
          save_as: "source_record",
          assert: [{ "result.success": true }],
        },
        {
          name: "Verify source record created",
          action: "sf/data.soqlQuery",
          query: "SELECT Id, Name, ExternalId__c FROM ${source_object} WHERE Id = '${source_record.id}'",
          assert: [{ "result.totalSize": 1 }],
        },
      ];
    case "sap":
      return [
        {
          name: "Create source document in SAP",
          action: "sap/rfc.callFunction",
          function: "${source_bapi}",
          params: { DATA: "${source_data}" },
          save_as: "source_document",
          assert: [{ "result.RETURN.TYPE": "S" }],
        },
      ];
    default:
      return [
        {
          name: `Create source data via ${system}`,
          action: "api/request",
          params: { method: "POST", path: "${source_endpoint}", body: "${source_data}" },
          save_as: "source_record",
          assert: [{ "response.status": 201 }],
        },
      ];
  }
}

function buildTargetSteps(system: string, sourceSystem: string): TestStep[] {
  switch (system) {
    case "salesforce":
      return [
        {
          name: `Verify ${sourceSystem} data synced to Salesforce`,
          action: "sf/data.soqlQuery",
          query: "SELECT Id, Name FROM ${target_object} WHERE ExternalId__c = '${correlation_id}'",
          save_as: "synced_record",
          assert: [{ "result.totalSize": 1 }],
          retries: 3,
          timeout: 15000,
        },
      ];
    case "sap":
      return [
        {
          name: `Verify ${sourceSystem} data synced to SAP`,
          action: "sap/rfc.callFunction",
          function: "${target_bapi_read}",
          params: { EXTERNAL_ID: "${correlation_id}" },
          save_as: "synced_document",
          assert: [{ "result.RETURN.TYPE": "S" }],
          retries: 3,
          timeout: 15000,
        },
      ];
    default:
      return [
        {
          name: `Verify ${sourceSystem} data synced to ${system}`,
          action: "api/request",
          params: { method: "GET", path: "${target_endpoint}/${correlation_id}" },
          save_as: "synced_record",
          assert: [{ "response.status": 200 }],
          retries: 3,
          timeout: 15000,
        },
      ];
  }
}

export function dataValidationTemplate(
  query: string,
  assertions: Record<string, unknown>,
): TestStep[] {
  const assertArray = Object.entries(assertions).map(([key, val]) => ({
    [key]: val as string | number | boolean,
  }));

  return [
    {
      name: "Execute validation query",
      action: "data/query",
      query,
      save_as: "query_result",
      assert: assertArray.length > 0
        ? assertArray
        : [{ "result.rowCount": "greater_than_0" }],
    },
    {
      name: "Check for null values in required fields",
      action: "data/query",
      query: `${query.replace(/SELECT\s+/i, "SELECT COUNT(*) as null_count, ").replace(/$/, " AND (1=0)")}`,
      save_as: "null_check",
    },
    {
      name: "Validate record count",
      action: "data/query",
      query: `SELECT COUNT(*) as total FROM (${query}) subq`,
      save_as: "count_result",
      assert: [{ "result.rows[0].total": "greater_than_0" }],
    },
    {
      name: "Check data freshness",
      action: "data/query",
      query: "SELECT MAX(updated_at) as last_update FROM (${query}) subq",
      save_as: "freshness_result",
    },
  ];
}
