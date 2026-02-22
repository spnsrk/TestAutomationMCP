# Sequence Diagrams

## Test Automation MCP Platform

**Version:** 0.1.0
**Last Updated:** February 2026

---

## 1. Document Upload and Requirement Extraction

```mermaid
sequenceDiagram
    actor User
    participant Dashboard
    participant API as API Server
    participant Parser as Document Parser
    participant LLM as LLM Router
    participant Extractor as Requirement Extractor
    participant DB as SQLite DB

    User->>Dashboard: Upload document (PDF/DOCX/XLSX)
    Dashboard->>API: POST /api/documents/upload (multipart)
    API->>DB: INSERT document (status: "parsing")
    API->>Parser: parseDocument(buffer, filename, mimeType)

    alt PDF
        Parser->>Parser: pdf-parse library
    else DOCX
        Parser->>Parser: mammoth library
    else XLSX
        Parser->>Parser: xlsx library
    else TXT/MD
        Parser->>Parser: UTF-8 decode
    end

    Parser-->>API: { text, metadata }
    API->>DB: UPDATE document (rawContent = text)
    API->>Extractor: extract(text)
    Extractor->>LLM: complete([system, user], { jsonMode: true })

    alt LLM Available
        LLM-->>Extractor: JSON { requirements, summary, confidence }
    else LLM Unavailable
        Extractor->>Extractor: fallbackExtraction(text)
        Note over Extractor: Regex-based bullet/keyword extraction
    end

    Extractor-->>API: ExtractionResult
    API->>DB: UPDATE document (status: "parsed", parsedRequirements)
    API-->>Dashboard: { id, name, status, extraction }
    Dashboard-->>User: Show extracted requirements
```

---

## 2. Test Plan Generation and Approval

```mermaid
sequenceDiagram
    actor User
    participant Dashboard
    participant API as API Server
    participant DB as SQLite DB
    participant Strategist as Strategist Agent

    User->>Dashboard: Click "Create Test Plan" on document
    Dashboard->>API: POST /api/test-plans { documentId }
    API->>DB: SELECT document WHERE id = documentId
    API->>API: Parse requirements from document
    API->>Strategist: analyze({ scope, requirements, targetSystems })
    Strategist->>Strategist: Categorize by system type
    Strategist->>Strategist: Assign priority + duration estimates
    Strategist->>Strategist: Generate coverage targets
    Strategist-->>API: TestPlanResponse { plan { testCases } }
    API->>DB: INSERT test_plan (status: "draft")
    API-->>Dashboard: { id, plan, status: "draft" }
    Dashboard-->>User: Show test plan for review

    User->>Dashboard: Review test cases, click "Approve"
    Dashboard->>API: POST /api/test-plans/:id/approve
    API->>DB: UPDATE test_plan SET status = "approved"
    API-->>Dashboard: { id, status: "approved" }
    Dashboard-->>User: Plan approved confirmation
```

---

## 3. Test Generation from Approved Plan

```mermaid
sequenceDiagram
    actor User
    participant Dashboard
    participant API as API Server
    participant DB as SQLite DB
    participant Generator as Generator Agent

    User->>Dashboard: Click "Generate Tests"
    Dashboard->>API: POST /api/test-plans/:id/generate
    API->>DB: SELECT test_plan WHERE id = :id
    API->>Generator: generate({ plannedTests })
    Generator->>Generator: Match test types to templates
    Generator->>Generator: Generate steps (setup, actions, assertions)
    Generator->>Generator: Add teardown steps
    Generator-->>API: { tests: TestDefinition[], warnings }

    loop For each generated test
        API->>DB: INSERT test_definition (YAML + JSON)
    end

    API-->>Dashboard: { generated: [{ id, name }], warnings }
    Dashboard-->>User: Show generated test list
```

---

## 4. Test Execution with Live Updates

```mermaid
sequenceDiagram
    actor User
    participant Dashboard
    participant WS as WebSocket
    participant API as API Server
    participant DB as SQLite DB
    participant Executor as Executor Agent
    participant Gateway as Gateway
    participant MCP as MCP Server

    User->>Dashboard: Click "Run Tests"
    Dashboard->>API: POST /api/tests/run { testPlanId, environment }
    API->>DB: SELECT test_definitions WHERE testPlanId
    API->>DB: INSERT test_run (status: "running")
    API-->>Dashboard: { runId, status: "running" }

    Dashboard->>WS: Connect to /ws/runs/:runId
    WS-->>Dashboard: Connection established

    Note over API: Async execution begins

    API->>Executor: execute({ tests, environment })

    loop For each test definition
        Executor->>Executor: Run setup steps

        loop For each test step
            Executor->>Gateway: callTool(toolName, params)
            Gateway->>MCP: Route to appropriate MCP server
            MCP-->>Gateway: ToolResult
            Gateway-->>Executor: ToolResult
        end

        Executor->>Executor: Evaluate assertions
        Executor->>Executor: Run teardown steps
        Executor-->>API: TestResult

        API->>DB: INSERT test_result
        API->>WS: Broadcast { type: "test_completed", testName, status }
        WS-->>Dashboard: Real-time update
        Dashboard-->>User: Show step-by-step progress
    end

    API->>DB: UPDATE test_run (status: "completed")

    Note over API: Analysis phase

    API->>API: AnalyzerAgent.analyze(results)
    API->>DB: UPDATE test_run (resultsSummaryJson)
    API->>WS: Broadcast { type: "run_completed", summary }
    WS-->>Dashboard: Final results
    Dashboard-->>User: Show results dashboard
```

---

## 5. Connector Import (Jira Example)

```mermaid
sequenceDiagram
    actor User
    participant Dashboard
    participant API as API Server
    participant Registry as Connector Registry
    participant Jira as Jira REST API
    participant Extractor as Requirement Extractor
    participant DB as SQLite DB

    User->>Dashboard: Configure Jira connection
    Dashboard->>API: POST /api/connectors/register { name: "jira", config }
    API->>Registry: register("jira", config)
    Registry->>Jira: GET /rest/api/2/myself (test connection)
    Jira-->>Registry: 200 OK
    Registry-->>API: Connector registered
    API-->>Dashboard: { name: "jira", status: "registered" }

    User->>Dashboard: Click "Import from Jira"
    Dashboard->>API: POST /api/connectors/jira/import { project: "PROJ" }
    API->>Registry: fetchRequirements("jira", query)
    Registry->>Jira: GET /rest/api/2/search?jql=project="PROJ"
    Jira-->>Registry: { issues: [...] }
    Registry-->>API: RequirementDocument[]
    API->>API: Combine into document text
    API->>DB: INSERT document
    API->>Extractor: extract(combinedText)
    Extractor-->>API: ExtractionResult
    API->>DB: UPDATE document (parsed)
    API-->>Dashboard: { documentId, importedCount, extraction }
    Dashboard-->>User: Show imported requirements
```

---

## 6. Scheduled Test Execution

```mermaid
sequenceDiagram
    participant Scheduler as Cron Scheduler
    participant Gateway as Gateway Server
    participant Router as Router
    participant MCP as MCP Servers
    participant Notifier as Notification Service

    Note over Scheduler: Cron expression triggers (e.g., "0 2 * * *")

    Scheduler->>Gateway: Trigger scheduled suite
    Gateway->>Gateway: Load suite definition (YAML)

    loop For each test in suite
        Gateway->>Router: routeToolCall(toolName, params)
        Router->>MCP: Forward to appropriate server
        MCP-->>Router: ToolResult
        Router-->>Gateway: ToolResult
    end

    Gateway->>Gateway: Compile results
    Gateway->>Notifier: sendNotification(results)

    alt Slack configured
        Notifier->>Notifier: POST to Slack webhook
    end

    alt Teams configured
        Notifier->>Notifier: POST to Teams webhook
    end

    alt Email configured
        Notifier->>Notifier: Send SMTP email
    end
```

---

## 7. MCP Tool Execution Detail

```mermaid
sequenceDiagram
    participant Executor
    participant Gateway
    participant Router
    participant WebMCP as Web MCP Server
    participant Playwright

    Executor->>Gateway: callTool("web_navigate", { url: "https://app.example.com" })
    Gateway->>Router: route("web_navigate", params)
    Router->>Router: Lookup tool prefix → "web" server
    Router->>WebMCP: Forward via MCP stdio transport
    WebMCP->>Playwright: page.goto(url)
    Playwright-->>WebMCP: Navigation complete
    WebMCP-->>Router: { status: "success", data: { title, url } }
    Router-->>Gateway: ToolResult
    Gateway-->>Executor: ToolResult

    Executor->>Gateway: callTool("web_interact", { action: "click", selector: "#btn" })
    Gateway->>Router: route("web_interact", params)
    Router->>WebMCP: Forward
    WebMCP->>Playwright: page.click("#btn")
    Playwright-->>WebMCP: Click complete
    WebMCP-->>Router: { status: "success" }
    Router-->>Gateway: ToolResult
    Gateway-->>Executor: ToolResult
```

---

## 8. LLM Provider Selection

```mermaid
sequenceDiagram
    participant API as API Server
    participant Router as LLM Router
    participant Config as LLM Config
    participant Provider as LLM Provider

    API->>Router: new LLMRouter(config)
    Router->>Config: LLMConfigSchema.parse(config)
    Config-->>Router: Validated config

    alt provider == "ollama"
        Router->>Router: new OllamaProvider(config)
    else provider == "openai"
        Router->>Router: new OpenAIProvider(config)
    else provider == "anthropic"
        Router->>Router: new AnthropicProvider(config)
    else provider == "azure-openai"
        Router->>Router: new AzureOpenAIProvider(config)
    end

    API->>Router: complete(messages, options)
    Router->>Provider: complete(messages, options)
    Provider->>Provider: POST to provider API
    Provider-->>Router: LLMCompletionResult
    Router-->>API: { content, model, usage }
```
