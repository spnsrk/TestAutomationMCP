# Test Automation MCP — Tool Reference

Complete reference for all MCP tools organized by server. Each tool includes name, description, parameters, example usage, and return format.

---

## Web Server (23 tools)

Playwright-based browser automation. Tools operate on a shared browser context unless `web/launch` or `web/close` are used.

### Browser Lifecycle

#### web/launch
Launch a new browser instance with optional configuration.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| headless | boolean | No | true | Run browser in headless mode |
| browserType | enum | No | chromium | chromium, firefox, webkit |
| width | number | No | 1280 | Viewport width |
| height | number | No | 720 | Viewport height |

**Example:**
```json
{ "headless": true, "browserType": "chromium", "width": 1920, "height": 1080 }
```

**Return:** `{ status, browser }`

---

#### web/close
Close the browser instance.

**Parameters:** None

**Return:** `{ status: "success" }`

---

### Navigation

#### web/navigate
Navigate to a URL in the browser.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | — | The URL to navigate to |
| waitUntil | enum | No | load | load, domcontentloaded, networkidle, commit |

**Example:**
```json
{ "url": "https://example.com/login", "waitUntil": "domcontentloaded" }
```

**Return:** `{ url, title, statusCode }`

---

#### web/goBack
Navigate back in browser history.

**Parameters:** None

**Return:** `{ url, title }`

---

#### web/reload
Reload the current page.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| waitUntil | enum | No | load | load, domcontentloaded, networkidle, commit |

**Return:** `{ url, title }`

---

#### web/waitForURL
Wait for the page URL to match a pattern.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | — | URL or glob pattern to wait for |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ url }`

---

### Interaction

#### web/click
Click an element on the page.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| selector | string | Yes | — | CSS selector, text content, or role-based selector |
| button | enum | No | left | left, right, middle |
| clickCount | number | No | 1 | Number of clicks |
| timeout | number | No | 30000 | Timeout in ms |

**Example:**
```json
{ "selector": "[data-testid='submit-btn']", "button": "left" }
```

**Return:** `{ selector }`

---

#### web/fill
Fill an input field with text (clears existing value first).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| selector | string | Yes | — | Selector for the input element |
| value | string | Yes | — | Text to fill |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ selector, value }`

---

#### web/type
Type text character by character (appends to existing value).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| selector | string | Yes | — | Selector for the input |
| text | string | Yes | — | Text to type |
| delay | number | No | 50 | Delay between keystrokes in ms |

**Return:** `{ selector, text }`

---

#### web/select
Select an option from a dropdown.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| selector | string | Yes | — | Selector for the select element |
| value | string | No | — | Option value |
| label | string | No | — | Option label |
| index | number | No | — | Option index |

*Provide one of value, label, or index.*

**Return:** `{ selector, selected }`

---

#### web/hover
Hover over an element.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| selector | string | Yes | — | Selector for the element |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ selector }`

---

#### web/pressKey
Press a keyboard key or key combination.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| key | string | Yes | — | Key (e.g., Enter, Tab, Control+A) |

**Return:** `{ key }`

---

#### web/upload
Upload a file to a file input element.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| selector | string | Yes | — | Selector for file input |
| filePath | string | Yes | — | Path to file |

**Return:** `{ selector, filePath }`

---

### Snapshot & Inspection

#### web/snapshot
Get a structured accessibility snapshot of the current page (LLM-friendly).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| interestingOnly | boolean | No | true | Only include interactive/meaningful elements |

**Return:** `{ snapshot, url, title }`

---

#### web/screenshot
Take a screenshot of the current page or a specific element.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| path | string | No | — | File path to save the screenshot |
| selector | string | No | — | Selector for element screenshot |
| fullPage | boolean | No | false | Capture full page |
| type | enum | No | png | png, jpeg |

**Return:** `{ path, size, base64? }`

---

#### web/getDOM
Get the HTML content of the page or a specific element.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| selector | string | No | — | Selector for specific element |
| outer | boolean | No | true | Include outer element HTML |

**Return:** `{ html }`

---

#### web/evaluate
Execute JavaScript in the browser context and return the result.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| expression | string | Yes | — | JavaScript expression to evaluate |

**Return:** `{ result }`

---

### Assertions

#### web/assertVisible
Assert that an element is visible on the page.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| selector | string | Yes | — | Selector for the element |
| visible | boolean | No | true | Expected visibility |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ selector, visible, passed }` or `status: "failure"` with error

---

#### web/assertText
Assert that an element contains specific text.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| selector | string | Yes | — | Selector for the element |
| text | string | Yes | — | Expected text |
| exact | boolean | No | false | Exact match vs. contains |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ selector, expected, actual, passed }`

---

#### web/assertURL
Assert the current page URL matches an expected pattern.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | — | Expected URL or regex pattern |
| isRegex | boolean | No | false | Treat url as regex |

**Return:** `{ expected, actual, passed }`

---

#### web/assertElement
Assert properties of an element (attribute, CSS, count, etc.).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| selector | string | Yes | — | Selector for the element |
| attribute | string | No | — | Attribute name to check |
| value | string | No | — | Expected attribute value |
| cssProperty | string | No | — | CSS property to check |
| cssValue | string | No | — | Expected CSS value |
| count | number | No | — | Expected element count |

**Return:** `{ selector, passed, ... }`

---

### Network

#### web/interceptRequest
Intercept network requests and optionally mock the response.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| urlPattern | string | Yes | — | URL glob or regex to intercept |
| mockStatus | number | No | — | Mock response status |
| mockBody | string | No | — | Mock response body |
| mockHeaders | object | No | — | Mock response headers |
| abort | boolean | No | false | Abort the request instead of mocking |

**Return:** `{ urlPattern, abort }`

---

#### web/removeIntercept
Remove a previously set request interceptor.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| urlPattern | string | Yes | — | URL pattern to remove |

**Return:** `{ urlPattern }`

---

#### web/waitForResponse
Wait for a network response matching a URL pattern.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| urlPattern | string | Yes | — | URL pattern to match |
| status | number | No | — | Expected status code |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ url, status, headers }`

---

#### web/waitForRequest
Wait for a network request matching a URL pattern.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| urlPattern | string | Yes | — | URL pattern to match |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ url, method, postData }`

---

### Visual

#### web/baselineCapture
Capture a baseline screenshot for visual comparison.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| name | string | Yes | — | Unique name for this baseline |
| selector | string | No | — | Selector for element |
| baselineDir | string | No | ./baselines | Directory for baselines |

**Return:** `{ name, path }`

---

#### web/compareScreenshot
Compare current page against a baseline screenshot.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| name | string | Yes | — | Baseline name to compare against |
| selector | string | No | — | Selector for element |
| threshold | number | No | 0.1 | Pixel difference threshold (0-1) |
| baselineDir | string | No | ./baselines | Baseline directory |
| diffDir | string | No | ./diffs | Directory for diff images |

**Return:** `{ name, passed, mismatchedPixels, totalPixels, diffPercent }`

---

## Salesforce Server (22 tools)

Requires `sf/auth.login` before data/apex/ui/metadata/integration tools. UI tools use a browser with session cookies.

### Authentication

#### sf/auth.login
Login to Salesforce using OAuth, SOAP, or JWT.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| loginUrl | string | No | https://login.salesforce.com | Use https://test.salesforce.com for sandboxes |
| username | string | Yes | — | Salesforce username |
| password | string | Yes | — | Salesforce password |
| securityToken | string | No | "" | Security token for SOAP |
| clientId | string | No | — | OAuth connected app client ID |
| clientSecret | string | No | — | OAuth connected app client secret |
| authMethod | enum | No | soap | oauth, soap, jwt |

**Return:** `{ userId, orgId, instanceUrl, authMethod }`

---

#### sf/auth.logout
Logout from Salesforce and clean up the connection.

**Parameters:** None

**Return:** `{ message }`

---

#### sf/auth.getConnection
Get the current Salesforce connection status.

**Parameters:** None

**Return:** `{ connected, accessTokenValid?, userId?, orgId?, instanceUrl? }`

---

### Data API

#### sf/data.soqlQuery
Execute a SOQL query against Salesforce.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| query | string | Yes | — | SOQL query string |
| tooling | boolean | No | false | Use Tooling API |

**Return:** `{ totalSize, done, records }`

---

#### sf/data.soslSearch
Execute a SOSL search across Salesforce objects.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| search | string | Yes | — | SOSL search string |

**Return:** `{ searchRecords }`

---

#### sf/data.insertRecord
Insert a new record into a Salesforce object.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| object | string | Yes | — | SObject API name (e.g., Account, Contact) |
| data | object | Yes | — | Field values for the new record |

**Return:** `{ id, success, object }`

---

#### sf/data.updateRecord
Update an existing Salesforce record by ID.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| object | string | Yes | — | SObject API name |
| id | string | Yes | — | Record ID to update |
| data | object | Yes | — | Field values to update |

**Return:** `{ id, success, object }`

---

#### sf/data.deleteRecord
Delete a Salesforce record by ID.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| object | string | Yes | — | SObject API name |
| id | string | Yes | — | Record ID to delete |

**Return:** `{ id, success, object }`

---

#### sf/data.upsertRecord
Upsert a record using an external ID field.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| object | string | Yes | — | SObject API name |
| externalIdField | string | Yes | — | API name of external ID field |
| data | object | Yes | — | Field values including external ID |

**Return:** `{ id, success, created, object }`

---

#### sf/data.bulkOperation
Perform a bulk operation (insert, update, delete, upsert) on multiple records.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| object | string | Yes | — | SObject API name |
| operation | enum | Yes | — | insert, update, delete, upsert |
| records | array | Yes | — | Array of records |
| externalIdField | string | No | — | For upsert operations |

**Return:** `{ operation, object, totalProcessed, successCount, failureCount, results }`

---

### Apex

#### sf/apex.runTests
Run Apex test classes and return results.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| testClassNames | array | Yes | — | Array of Apex test class names |
| testLevel | enum | No | RunSpecifiedTests | RunSpecifiedTests, RunLocalTests, RunAllTestsInOrg |

**Return:** `{ testRunId, summary, testResults, codeCoverage }`

---

#### sf/apex.executeAnonymous
Execute anonymous Apex code.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| code | string | Yes | — | Apex code to execute |

**Return:** `{ compiled, success }`

---

#### sf/apex.callRest
Call a custom Apex REST endpoint.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| method | enum | Yes | — | GET, POST, PUT, PATCH, DELETE |
| path | string | Yes | — | Path (e.g., /services/apexrest/MyEndpoint) |
| body | object | No | — | Request body for POST/PUT/PATCH |

**Return:** `{ method, path, response }`

---

### Lightning UI

#### sf/ui.navigateToApp
Navigate to a Salesforce Lightning app by name.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| appName | string | Yes | — | App name (e.g., Sales, standard__LightningSales) |
| timeout | number | No | 30000 | Navigation timeout in ms |

**Return:** `{ url, title, appName }`

---

#### sf/ui.navigateToRecord
Navigate to a specific record page.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| objectType | string | Yes | — | SObject API name |
| recordId | string | Yes | — | 18-character record ID |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ url, title, recordName, objectType, recordId }`

---

#### sf/ui.fillForm
Fill a Lightning form by mapping field labels to values.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fields | object | Yes | — | Map of field labels to values |
| timeout | number | No | 10000 | Per-field timeout in ms |

**Return:** `{ filledFields, errors? }`

---

#### sf/ui.clickButton
Click a button in the Lightning UI by its label text.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| label | string | Yes | — | Button label text |
| timeout | number | No | 10000 | Timeout in ms |

**Return:** `{ label, clicked }`

---

#### sf/ui.waitForToast
Wait for a Lightning toast notification.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| timeout | number | No | 15000 | Timeout in ms |
| expectedMessage | string | No | — | Optional expected message text |

**Return:** `{ message, variant, matched, expectedMessage? }`

---

#### sf/ui.getRecordDetail
Extract field label-value pairs from the current record detail page.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fieldLabels | array | No | — | Specific fields to extract; omit for all |
| timeout | number | No | 10000 | Timeout in ms |

**Return:** `{ fields, fieldCount }`

---

### Metadata

#### sf/metadata.describeObject
Describe a Salesforce SObject including fields and relationships.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| objectName | string | Yes | — | SObject API name |

**Return:** `{ name, label, fields, childRelationships, recordTypes, ... }`

---

#### sf/metadata.getFieldSet
Get the details of a field set on an object.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| objectName | string | Yes | — | SObject API name |
| fieldSetName | string | Yes | — | Field set API name |

**Return:** `{ fullName, label, displayedFields, availableFields }`

---

#### sf/metadata.listObjects
List available Salesforce SObjects.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| filter | enum | No | all | all, custom, standard |
| keyword | string | No | — | Optional keyword to filter |

**Return:** `{ totalCount, objects }`

---

### Integration

#### sf/integration.publishEvent
Publish a Salesforce Platform Event.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| eventName | string | Yes | — | Platform Event API name (ends with __e) |
| payload | object | Yes | — | Event field values |

**Return:** `{ eventName, eventId, success }`

---

#### sf/integration.callApi
Call an external API from Salesforce context (Named Credentials or direct URL).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| method | enum | Yes | — | GET, POST, PUT, PATCH, DELETE |
| endpoint | string | Yes | — | Full URL or callout:MyNC/path |
| headers | object | No | — | Custom HTTP headers |
| body | object | No | — | Request body |
| timeout | number | No | 30000 | Request timeout in ms |

**Return:** `{ method, endpoint, executed }`

---

#### sf/integration.checkFlow
Check the execution status of a Salesforce Flow.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| flowNameOrId | string | Yes | — | Flow API name, version ID, or interview ID |
| lookupBy | enum | No | name | name, interviewId |

**Return:** `{ apiName, label, status, isActive, versionNumber, ... }` or interview details

---

## SAP Server (26 tools)

Supports Fiori (browser), RFC (node-rfc), OData (HTTP), GUI Scripting (Windows), and IDoc.

### Authentication

#### sap/auth.loginFiori
Login to SAP Fiori Launchpad via Playwright.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | — | SAP Fiori Launchpad URL |
| username | string | Yes | — | SAP username |
| password | string | Yes | — | SAP password |
| timeout | number | No | 60000 | Login timeout in ms |

**Return:** `{ url, title, loggedIn }`

---

#### sap/auth.loginRfc
Establish an RFC connection using node-rfc. Requires SAP NW RFC SDK.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| ashost | string | Yes | — | SAP application server hostname |
| sysnr | string | Yes | — | System number (e.g., 00) |
| client | string | Yes | — | Client number (e.g., 100) |
| user | string | Yes | — | SAP username |
| passwd | string | Yes | — | SAP password |
| lang | string | No | EN | Logon language |

**Return:** `{ connected, systemInfo }`

---

#### sap/auth.getStatus
Get the current SAP connection status for Fiori, RFC, and OData.

**Parameters:** None

**Return:** `{ fiori: { loggedIn, url }, rfc: { connected, alive, systemInfo } }`

---

### Fiori UI

#### sap/fiori.navigateLaunchpad
Navigate to the SAP Fiori Launchpad home page.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | No | — | Fiori Launchpad URL; omit to reload current |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ url, title }`

---

#### sap/fiori.openApp
Open a Fiori app by tile or semantic object/action.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tileTitle | string | No | — | Title text of the Fiori tile |
| semanticObject | string | No | — | Semantic object (e.g., SalesOrder) |
| action | string | No | display | Semantic action (display, create) |
| params | object | No | — | Navigation parameters |
| timeout | number | No | 30000 | Timeout in ms |

*Provide either tileTitle or semanticObject.*

**Return:** `{ url, title }`

---

#### sap/fiori.fillField
Fill a UI5 input field by ID or label.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fieldId | string | No | — | UI5 control ID |
| label | string | No | — | Label text |
| value | string | Yes | — | Value to enter |
| clearFirst | boolean | No | true | Clear existing value first |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ selector, value }`

---

#### sap/fiori.clickButton
Click a UI5 button by text or ID.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | No | — | Button text |
| buttonId | string | No | — | UI5 control ID |
| timeout | number | No | 30000 | Timeout in ms |

*Provide either text or buttonId.*

**Return:** `{ text }`

---

#### sap/fiori.selectListItem
Select an item from a UI5 list.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| listId | string | No | — | ID of the list control |
| itemText | string | Yes | — | Text of the item to select |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ itemText, listId }`

---

#### sap/fiori.readTable
Read data from a UI5 sap.m.Table or sap.ui.table.Table.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tableId | string | No | — | Table control ID; omit for first table |
| maxRows | number | No | 100 | Maximum rows to read |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ headers, data, totalRows }`

---

#### sap/fiori.assertControl
Assert that a UI5 control property has the expected value.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| controlId | string | Yes | — | UI5 control ID |
| property | string | Yes | — | Property name (value, text, visible, enabled) |
| expectedValue | string/number/boolean | Yes | — | Expected value |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ controlId, property, expectedValue, actualValue, passed }`

---

#### sap/fiori.getSnapshot
Get an accessibility snapshot of the current Fiori page.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ pageInfo, accessibilityTree }`

---

### RFC / BAPI

#### sap/rfc.callFunction
Call an RFC function module on the connected SAP system.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| functionName | string | Yes | — | RFC function name (e.g., BAPI_USER_GET_DETAIL) |
| importParams | object | No | {} | Import parameters |
| tableParams | object | No | {} | Table parameters |

**Return:** `{ functionName, result }`

---

#### sap/rfc.callBAPI
Call a BAPI with automatic BAPI_TRANSACTION_COMMIT on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| bapiName | string | Yes | — | BAPI name (e.g., BAPI_SALESORDER_CREATEFROMDAT2) |
| params | object | Yes | — | All BAPI parameters |
| autoCommit | boolean | No | true | Call BAPI_TRANSACTION_COMMIT on success |

**Return:** `{ bapiName, result, returnMessages, committed }`

---

#### sap/rfc.getStructure
Get the structure and metadata of an RFC function module.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| functionName | string | Yes | — | RFC function name |

**Return:** `{ functionName, import, export, changing, tables }`

---

### OData

#### sap/odata.query
Query an OData entity set with filtering, selection, expansion, paging.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| serviceUrl | string | Yes | — | Base OData service URL |
| entitySet | string | Yes | — | Entity set name |
| select | string | No | — | $select fields, comma-separated |
| filter | string | No | — | $filter expression |
| expand | string | No | — | $expand navigation properties |
| top | number | No | — | $top |
| skip | number | No | — | $skip |
| orderby | string | No | — | $orderby |
| count | boolean | No | false | Include $count |
| format | enum | No | json | json, xml |

**Return:** `{ entitySet, results, count?, nextLink? }`

---

#### sap/odata.create
Create a new entity via OData POST.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| serviceUrl | string | Yes | — | Base OData service URL |
| entitySet | string | Yes | — | Entity set name |
| data | object | Yes | — | Entity data |

**Return:** `{ entitySet, created, statusCode }`

---

#### sap/odata.update
Update an entity via OData PATCH or PUT.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| serviceUrl | string | Yes | — | Base OData service URL |
| entityPath | string | Yes | — | Entity path with key (e.g., A_SalesOrder('1000000')) |
| data | object | Yes | — | Fields to update |
| method | enum | No | PATCH | PATCH, PUT |

**Return:** `{ entityPath, method, statusCode }`

---

#### sap/odata.delete
Delete an entity via OData DELETE.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| serviceUrl | string | Yes | — | Base OData service URL |
| entityPath | string | Yes | — | Entity path with key |

**Return:** `{ entityPath, deleted }`

---

#### sap/odata.batch
Execute multiple OData operations in a single $batch request.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| serviceUrl | string | Yes | — | Base OData service URL |
| operations | array | Yes | — | Array of { method, path, data? } |
| atomicChangeset | boolean | No | true | Wrap modifications in changeset |

**Return:** `{ statusCode, operationCount, response }`

---

#### sap/odata.getMetadata
Fetch the OData service $metadata document.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| serviceUrl | string | Yes | — | Base OData service URL |

**Return:** `{ serviceUrl, metadata }`

---

### GUI Scripting (Windows only)

#### sap/gui.openTransaction
Open a SAP transaction code in SAP GUI. Requires Windows + SAP GUI with scripting enabled.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tcode | string | Yes | — | Transaction code (e.g., VA01, SE38) |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ tcode, windowTitle }`

---

#### sap/gui.fillField
Fill a SAP GUI field by technical ID.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fieldId | string | Yes | — | SAP GUI field ID |
| value | string | Yes | — | Value to enter |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ fieldId, value }`

---

#### sap/gui.pressButton
Press a SAP GUI button by technical ID.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| buttonId | string | Yes | — | SAP GUI button ID |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ buttonId }`

---

#### sap/gui.readField
Read the value of a SAP GUI field.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fieldId | string | Yes | — | SAP GUI field ID |
| timeout | number | No | 30000 | Timeout in ms |

**Return:** `{ fieldId, value }`

---

#### sap/gui.readTable
Read data from an ALV grid or table control in SAP GUI.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tableId | string | No | wnd[0]/usr/cntlGRID1/shellcont/shell | Table control ID |
| maxRows | number | No | 100 | Maximum rows |
| timeout | number | No | 60000 | Timeout in ms |

**Return:** `{ headers, rows, totalRows }`

---

### IDoc

#### sap/idoc.send
Send an IDoc to the SAP system via RFC.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| idocType | string | Yes | — | IDoc basic type (e.g., ORDERS05) |
| mesType | string | Yes | — | Message type (e.g., ORDERS) |
| senderPort | string | No | SAPPORT | Sender port |
| senderPartner | string | Yes | — | Sender partner number |
| senderPartnerType | string | No | LS | Sender partner type |
| receiverPort | string | No | SAPPORT | Receiver port |
| receiverPartner | string | Yes | — | Receiver partner number |
| receiverPartnerType | string | No | LS | Receiver partner type |
| segments | array | Yes | — | Array of { segmentName, data } |

**Return:** `{ idocNumber, idocType, mesType, segmentCount }`

---

#### sap/idoc.getStatus
Get the processing status of an IDoc by document number.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| idocNumber | string | Yes | — | IDoc document number |

**Return:** `{ idocNumber, statusCode, statusDescription, direction, mesType, ... }`

---

#### sap/idoc.listRecent
List recent IDocs filtered by message type, direction, status.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mesType | string | No | — | Filter by message type |
| direction | enum | No | — | inbound, outbound |
| status | string | No | — | Filter by status code |
| limit | number | No | 50 | Maximum IDocs to return |
| fromDate | string | No | — | Start date (YYYYMMDD) |
| toDate | string | No | — | End date (YYYYMMDD) |

**Return:** `{ idocs, count, filters }`

---

## API Server (10 tools)

REST, GraphQL, and OpenAPI contract validation.

### REST

#### api/rest.request
Make an HTTP request and return the response.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| method | enum | Yes | — | GET, POST, PUT, PATCH, DELETE |
| url | string | Yes | — | Request URL |
| headers | object | No | — | Request headers |
| body | any | No | — | Request body (JSON) |
| timeout | number | No | 30000 | Timeout in ms |
| validateStatus | boolean | No | true | Accept any HTTP status without throwing |

**Return:** `{ statusCode, statusText, headers, body, duration }`

---

#### api/rest.assertStatus
Assert that an HTTP request returns the expected status code.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | — | Request URL |
| method | enum | No | GET | HTTP method |
| headers | object | No | — | Request headers |
| body | any | No | — | Request body |
| expectedStatus | number | Yes | — | Expected HTTP status code |

**Return:** `{ passed, expected, actual, url, method }`

---

#### api/rest.assertSchema
Validate an HTTP response body against a JSON Schema.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | — | Request URL |
| method | enum | No | GET | HTTP method |
| headers | object | No | — | Request headers |
| body | any | No | — | Request body |
| schema | object | Yes | — | JSON Schema to validate against |

**Return:** `{ passed, url, method, statusCode, errors?, body }`

---

#### api/rest.assertHeaders
Assert that an HTTP response contains the expected headers.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | — | Request URL |
| method | enum | No | GET | HTTP method |
| headers | object | No | — | Request headers |
| body | any | No | — | Request body |
| expectedHeaders | object | Yes | — | Expected response headers |

**Return:** `{ passed, url, method, mismatches?, responseHeaders }`

---

#### api/rest.assertResponseTime
Assert that an HTTP request completes within the specified time.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | — | Request URL |
| method | enum | No | GET | HTTP method |
| headers | object | No | — | Request headers |
| body | any | No | — | Request body |
| maxMs | number | Yes | — | Maximum allowed response time in ms |

**Return:** `{ passed, maxMs, actualMs, url, method, statusCode }`

---

### GraphQL

#### api/graphql.query
Execute a GraphQL query and return the response.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| endpoint | string | Yes | — | GraphQL endpoint URL |
| query | string | Yes | — | GraphQL query string |
| variables | object | No | — | Query variables |
| headers | object | No | — | Request headers |

**Return:** `{ result, duration }`

---

#### api/graphql.mutate
Execute a GraphQL mutation and return the response.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| endpoint | string | Yes | — | GraphQL endpoint URL |
| mutation | string | Yes | — | GraphQL mutation string |
| variables | object | No | — | Mutation variables |
| headers | object | No | — | Request headers |

**Return:** `{ result, duration }`

---

#### api/graphql.assertField
Assert that a specific field in a GraphQL response matches the expected value.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| endpoint | string | Yes | — | GraphQL endpoint URL |
| query | string | Yes | — | GraphQL query string |
| variables | object | No | — | Query variables |
| headers | object | No | — | Request headers |
| fieldPath | string | Yes | — | Dot-separated path (e.g., user.name) |
| expectedValue | any | Yes | — | Expected value |

**Return:** `{ passed, fieldPath, expected, actual, fullResponse }`

---

### Contract

#### api/contract.validateOpenAPI
Validate an API response against an OpenAPI specification.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| specUrl | string | No | — | URL to fetch OpenAPI spec |
| specPath | string | No | — | Local file path to OpenAPI spec |
| endpoint | string | Yes | — | API endpoint path |
| method | enum | No | GET | HTTP method |
| baseUrl | string | No | — | Base URL for live API call |
| headers | object | No | — | Request headers |
| body | any | No | — | Request body |
| statusCode | string | No | 200 | Expected status code for schema |

*Provide specUrl or specPath. Provide baseUrl to validate against a live API.*

**Return:** `{ passed?, endpoint, method, statusCode?, schemaErrors?, responseBody? }`

---

#### api/contract.compareSpecs
Compare two OpenAPI specifications and detect breaking changes.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| oldSpec | string | Yes | — | URL or path to old/baseline spec |
| newSpec | string | Yes | — | URL or path to new spec |

**Return:** `{ hasBreakingChanges, summary, addedEndpoints, removedEndpoints, changedEndpoints }`

---

## Data Server (10 tools)

SQL, MongoDB, Redis queries; dataset comparison; test data generation; validation.

### Query

#### data/query.sql
Execute a SQL query against PostgreSQL.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| connectionString | string | Yes | — | PostgreSQL connection string |
| query | string | Yes | — | SQL query |
| params | array | No | — | Parameterized values ($1, $2, ...) |

**Return:** `{ rows, rowCount, fields }`

---

#### data/query.mongo
Execute a MongoDB query.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| connectionString | string | Yes | — | MongoDB connection string |
| database | string | Yes | — | Database name |
| collection | string | Yes | — | Collection name |
| filter | object | No | {} | Query filter document |
| projection | object | No | — | Fields to include/exclude |
| sort | object | No | — | Sort specification |
| limit | number | No | 100 | Maximum documents |

**Return:** `{ documents, count, database, collection }`

---

#### data/query.redis
Execute a Redis command.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| connectionString | string | Yes | — | Redis connection string |
| command | string | Yes | — | Redis command (GET, SET, HGETALL, etc.) |
| args | array | No | [] | Command arguments |

**Return:** `{ command, args, result }`

---

### Compare

#### data/compare.datasets
Compare two SQL datasets row by row.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| source | object | Yes | — | { connectionString, query, params? } |
| target | object | Yes | — | { connectionString, query, params? } |
| keyColumns | array | Yes | — | Columns for join keys |
| compareColumns | array | No | — | Columns to compare; omit for all non-key |
| tolerance | number | No | 0 | Numeric tolerance for float comparisons |

**Return:** `{ passed, summary, mismatches, sourceOnly, targetOnly }`

---

#### data/compare.rowCount
Compare row counts between two SQL queries.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sourceQuery | object | Yes | — | { connectionString, query, params? } |
| targetQuery | object | Yes | — | { connectionString, query, params? } |

**Return:** `{ passed, sourceCount, targetCount, difference }`

---

### Generate

#### data/generate.testData
Generate an array of test data records based on a field schema.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| schema | array | Yes | — | [{ name, type, values? }] — types: name, firstName, lastName, email, phone, address, number, float, date, datetime, uuid, boolean, enum, string, id |
| count | number | No | 10 | Number of records (1–10000) |

**Return:** `{ records, count, fields }`

---

#### data/generate.seed
Seed a PostgreSQL table with generated or provided records.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| connectionString | string | Yes | — | PostgreSQL connection string |
| table | string | Yes | — | Target table name |
| records | array | Yes | — | Records to insert |
| truncateFirst | boolean | No | false | Truncate table before inserting |

**Return:** `{ table, inserted, columns }`

---

### Validate

#### data/validate.assertRowCount
Assert the row count from a SQL query matches expectations.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| connectionString | string | Yes | — | PostgreSQL connection string |
| query | string | Yes | — | SQL query |
| params | array | No | — | Parameterized values |
| expected | number | Yes | — | Expected row count |
| operator | enum | No | eq | eq, gt, lt, gte, lte |

**Return:** `{ passed, operator, expected, actual, query }`

---

#### data/validate.assertValue
Assert a specific value in a SQL query result.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| connectionString | string | Yes | — | PostgreSQL connection string |
| query | string | Yes | — | SQL query |
| params | array | No | — | Parameterized values |
| row | number | No | 0 | Row index (0-based) |
| column | string | Yes | — | Column name |
| expected | any | Yes | — | Expected value |

**Return:** `{ passed, row, column, expected, actual, query }`

---

#### data/validate.assertNotNull
Assert that a column has no NULL values in the query results.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| connectionString | string | Yes | — | PostgreSQL connection string |
| query | string | Yes | — | SQL query |
| params | array | No | — | Parameterized values |
| column | string | Yes | — | Column name to check |

**Return:** `{ passed, column, totalRows, nullCount, nullRowIndices, query }`

---

## Tool Result Format

All tools return a consistent structure:

```json
{
  "status": "success" | "failure" | "error" | "skipped",
  "tool": "namespace/toolName",
  "duration": 123,
  "data": { /* tool-specific payload */ },
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { /* optional */ }
  },
  "metadata": {
    "screenshot": "base64...",
    "snapshot": "..."
  }
}
```

- **success** — Tool completed successfully; `data` contains the result.
- **failure** — Assertion or business logic failed; `data` may contain details.
- **error** — Unexpected exception; `error` contains code and message.
- **skipped** — Step was skipped (e.g., conditional).
