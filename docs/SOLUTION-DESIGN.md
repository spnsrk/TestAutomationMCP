# Solution Design Document

## Test Automation MCP Platform

**Version:** 0.1.0
**Last Updated:** February 2026
**Author:** Sapan Sarkar

---

## 1. Problem Statement

Organizations testing full-stack web applications, Salesforce, and SAP systems face:

1. **Fragmented tooling** -- Different tools for each system (Selenium/Playwright for web, jsforce for Salesforce, SAP GUI scripting for SAP) with no unified orchestration.
2. **Manual test creation** -- Test cases are written manually from requirements documents, a time-consuming and error-prone process.
3. **Technical barriers** -- QA analysts, BAs, and PMs cannot create or run automated tests without developer assistance.
4. **No AI assistance** -- Existing tools don't leverage AI for requirement extraction, test generation, or failure analysis.
5. **Deployment complexity** -- No standardized way to host and share test automation infrastructure.

---

## 2. Solution Overview

The Test Automation MCP Platform solves these problems through:

### 2.1 Unified Protocol (MCP)

All test automation capabilities are exposed through the **Model Context Protocol** standard. Each target system (Web, Salesforce, SAP, API, Data) has its own MCP server with domain-specific tools, but they all communicate through the same protocol, enabling:
- Consistent tool invocation across systems
- Cross-system test orchestration
- Extensibility via new MCP servers

### 2.2 Multi-Agent Intelligence

Four autonomous agents handle the full testing lifecycle:

| Agent | Input | Output | AI-Powered |
|-------|-------|--------|------------|
| Strategist | Requirements/scope | Prioritized test plan | Yes |
| Generator | Test plan | Executable test definitions | Yes |
| Executor | Test definitions | Test results | No (deterministic) |
| Analyzer | Test results | Analysis, recommendations | Yes |

### 2.3 Document-First Workflow

Non-technical users interact through a document-first workflow:

1. Upload a requirements document (PDF, Word, Excel) or paste text
2. AI extracts structured test requirements
3. Review and approve the generated test plan
4. AI generates executable test definitions
5. Run tests with one click
6. View results with AI-powered failure analysis

### 2.4 Pluggable AI Layer

The LLM abstraction supports multiple providers:
- **Ollama** -- Free, local, no API key needed (default)
- **OpenAI** -- Cloud-based, high quality
- **Anthropic** -- Claude models
- **Azure OpenAI** -- Enterprise compliance

### 2.5 External System Connectors

Import requirements directly from:
- **Jira** -- User stories, bugs, tasks via REST API
- **GitHub** -- Issues from repositories
- (Future) Confluence, Azure DevOps

---

## 3. Solution Architecture

### 3.1 Layered Design

| Layer | Components | Responsibility |
|-------|-----------|---------------|
| **Presentation** | Dashboard (Next.js), CLI | User interface |
| **API** | Fastify REST Server | Request routing, auth, orchestration |
| **Intelligence** | LLM Router, Requirement Extractor | AI processing |
| **Agent** | Strategist, Generator, Executor, Analyzer | Test lifecycle management |
| **Protocol** | MCP Gateway, Router | Tool routing and MCP communication |
| **Execution** | 5 MCP Servers | Domain-specific test execution |
| **Storage** | SQLite + Drizzle ORM | Persistence |
| **Integration** | Connector Registry | External system integration |

### 3.2 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo | Turborepo | Single repo for all packages; shared build tooling |
| Language | TypeScript (ESM) | Type safety, modern JS ecosystem, native async |
| API Framework | Fastify | Fastest Node.js HTTP framework, plugin ecosystem |
| Frontend | Next.js + Tailwind | SSR/SSG, modern React, rapid UI development |
| Database | SQLite | Zero-config, embedded, no external service needed |
| ORM | Drizzle | Type-safe, lightweight, excellent SQLite support |
| LLM Default | Ollama | Free, local, no API key, privacy-preserving |
| Protocol | MCP (stdio) | Open standard, AI-native, extensible |
| IaC | Bicep | Azure-native, declarative, concise |
| Test Runner | Vitest | Fast, ESM-native, compatible with TypeScript |

### 3.3 Cross-Cutting Concerns

**Logging:** Pino structured JSON logging with child loggers per component.

**Error Handling:** Custom error hierarchy (`TestAutomationError` base) with typed errors for each failure category (Connection, Authentication, ToolExecution, TestDefinition, Timeout, Assertion).

**Configuration:** Zod schema validation for all configuration inputs. Environment variables for secrets. YAML files for gateway configuration.

**Variable Resolution:** `${variable.path}` interpolation throughout test definitions, supporting step output references, environment variables, and custom context.

---

## 4. Data Model

### 4.1 Entity Relationship

```
documents 1──────* test_plans 1──────* test_definitions
                 test_plans 1──────* test_runs 1──────* test_results
```

### 4.2 Core Entities

**Document**
- Represents an uploaded requirements document
- States: uploaded → parsing → parsed → error
- Stores raw text and AI-extracted structured requirements

**Test Plan**
- Generated by the Strategist from requirements
- States: draft → approved / rejected
- Contains prioritized test cases with coverage targets

**Test Definition**
- Generated by the Generator from a test plan
- Stored as both YAML and JSON
- Contains steps, assertions, setup/teardown

**Test Run**
- An execution instance of one or more test definitions
- States: queued → running → completed / failed
- Tracks environment, parallelism, timing

**Test Result**
- Individual test result within a run
- States: success, failure, error, skipped
- Contains full step-by-step results and optional analysis

### 4.3 Test Definition Schema

```yaml
test:
  name: "Login with valid credentials"
  description: "Verify user can log in"
  type: e2e
  priority: high
  tags: [auth, login, smoke]
  timeout: 30000
  retries: 1

  setup:
    - tool: web_navigate
      params:
        url: "${env.baseUrl}/login"

  steps:
    - tool: web_interact
      action: fill
      params:
        selector: "#email"
        value: "${env.testUser.email}"
    - tool: web_interact
      action: click
      params:
        selector: "#loginButton"
    - tool: web_assert
      params:
        selector: ".dashboard"
        state: visible

  assertions:
    - type: status
      expected: success
    - type: response_time
      expected: "< 3000"

  teardown:
    - tool: web_navigate
      params:
        url: "${env.baseUrl}/logout"
```

---

## 5. Integration Points

### 5.1 LLM Integration

```
API Server ──▶ LLM Router ──▶ Provider (Ollama/OpenAI/Anthropic/Azure)
                   │
                   ├── Requirement Extraction (jsonMode: true)
                   ├── Test Strategy Generation
                   └── Failure Analysis
```

### 5.2 External Connectors

```
API Server ──▶ Connector Registry ──▶ Jira REST API
                                  ──▶ GitHub API
                                  ──▶ (Future: Confluence, Azure DevOps)
```

### 5.3 Notification Channels

```
Gateway ──▶ Slack Webhook
        ──▶ Microsoft Teams Webhook
        ──▶ Email (SMTP)
```

---

## 6. Scalability Considerations

| Aspect | Current | Future |
|--------|---------|--------|
| Database | SQLite (single file) | PostgreSQL (multi-user) |
| Job Queue | setImmediate (in-process) | BullMQ + Redis |
| Storage | Local filesystem | Azure Blob Storage |
| Compute | Single container | Horizontal auto-scale (1-3) |
| MCP Transport | stdio (child process) | HTTP/SSE (network) |

---

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| LLM unavailable | AI features degrade | Fallback regex-based extractor; tests still run manually |
| Large documents | Slow parsing | 50MB upload limit; text truncation at 50K chars for LLM |
| SQLite concurrency | Write contention | WAL mode; future migration path to PostgreSQL |
| MCP server crash | Test execution fails | Process restart; per-test error handling |
| Docker build time | Slow CI/CD | Multi-stage builds; layer caching |
