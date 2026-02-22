# Architecture Document

## Test Automation MCP Platform

**Version:** 0.1.0
**Last Updated:** February 2026

---

## 1. Executive Summary

The Test Automation MCP Platform is an AI-powered, multi-agent system built on the **Model Context Protocol (MCP)** standard. It automates test design, generation, execution, and analysis across full-stack web applications, Salesforce, and SAP systems. The platform provides both a CLI for developers and a web dashboard for non-technical users, with a pluggable LLM layer for AI-powered requirement extraction and test generation.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACES                                │
│  ┌──────────────────┐   ┌──────────────────┐   ┌────────────────────┐  │
│  │  Web Dashboard    │   │  CLI Tool         │   │  External          │  │
│  │  (Next.js)        │   │  (Commander.js)   │   │  Connectors        │  │
│  │  Port 3000        │   │                   │   │  (Jira, GitHub)    │  │
│  └────────┬─────────┘   └────────┬──────────┘   └────────┬───────────┘  │
└───────────┼──────────────────────┼─────────────────────────┼────────────┘
            │                      │                         │
            ▼                      ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          API LAYER                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Fastify REST API Server (Port 3100)                             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐  │   │
│  │  │Documents │ │Test Plans│ │Execution │ │Results   │ │Connec│  │   │
│  │  │  API     │ │  API     │ │  API     │ │  API     │ │ tors │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────┘  │   │
│  │  ┌──────────────────┐  ┌──────────────────────────────────┐     │   │
│  │  │ WebSocket Server │  │ Document Parser + AI Extractor   │     │   │
│  │  └──────────────────┘  └──────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────────────┐
│  AI / LLM Layer   │ │  Agent Layer      │ │  Storage Layer            │
│  ┌─────────────┐  │ │  ┌─────────────┐  │ │  ┌─────────────────────┐ │
│  │ LLM Router  │  │ │  │ Strategist  │  │ │  │ SQLite (Drizzle ORM)│ │
│  ├─────────────┤  │ │  │ Generator   │  │ │  │ - documents         │ │
│  │ Ollama      │  │ │  │ Executor    │  │ │  │ - test_plans        │ │
│  │ OpenAI      │  │ │  │ Analyzer    │  │ │  │ - test_definitions  │ │
│  │ Anthropic   │  │ │  └──────┬──────┘  │ │  │ - test_runs         │ │
│  │ Azure OpenAI│  │ │         │         │ │  │ - test_results      │ │
│  └─────────────┘  │ │         ▼         │ │  └─────────────────────┘ │
└───────────────────┘ │  ┌─────────────┐  │ └───────────────────────────┘
                      │  │  Gateway     │  │
                      │  │  + Router    │  │
                      │  └──────┬──────┘  │
                      └─────────┼─────────┘
                                │
         ┌──────────┬───────────┼───────────┬──────────┐
         ▼          ▼           ▼           ▼          ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────┐ ┌──────┐
    │ Web MCP │ │ SF MCP  │ │ SAP MCP │ │ API  │ │ Data │
    │ Server  │ │ Server  │ │ Server  │ │ MCP  │ │ MCP  │
    └─────────┘ └─────────┘ └─────────┘ └──────┘ └──────┘
```

---

## 3. Component Architecture

### 3.1 Core Layer (`packages/core`)

The foundational package providing shared types, schemas, and utilities used by all other packages.

| Module | Purpose |
|--------|---------|
| `types/test-definition.ts` | Zod schemas for TestDefinition, TestSuite, TestStep, Assertion |
| `types/tool-result.ts` | Types for ToolResult, StepResult, TestResult, SuiteResult |
| `types/agent-messages.ts` | Inter-agent communication message types |
| `types/config.ts` | Environment and Gateway configuration schemas |
| `utils/logger.ts` | Pino-based structured logger factory |
| `utils/errors.ts` | Custom error hierarchy (ConnectionError, AuthenticationError, etc.) |
| `utils/registry.ts` | Generic ToolRegistry pattern for extensible tool management |
| `utils/variables.ts` | `${var.path}` interpolation engine |
| `schema/test-definition.schema.ts` | YAML/JSON test file loader and validator |

### 3.2 Agent Layer (`packages/agents/*`)

Four autonomous agents that form the intelligence pipeline:

```
Requirements ──▶ Strategist ──▶ Generator ──▶ Executor ──▶ Analyzer ──▶ Report
```

| Agent | Responsibility |
|-------|---------------|
| **Strategist** | Analyzes scope and requirements; produces prioritized test plan with coverage targets |
| **Generator** | Takes planned test cases and generates complete TestDefinition objects with steps, assertions, setup/teardown |
| **Executor** | Executes test definitions against target systems; handles retries, parallel execution, assertion evaluation |
| **Analyzer** | Computes pass rates, categorizes failures by root cause, generates trend data and recommendations |

### 3.3 MCP Server Layer (`packages/mcp-servers/*`)

Five domain-specific MCP servers, each exposing tools via the Model Context Protocol:

| Server | Transport | Tools | Technology |
|--------|-----------|-------|------------|
| **Web** | stdio | navigate, interact, snapshot, assert, network, visual, performance | Playwright |
| **Salesforce** | stdio | auth, data (SOQL/DML), apex, ui, metadata, integration | jsforce + Playwright |
| **SAP** | stdio | auth, fiori, rfc, odata, gui, idoc | Playwright + node-rfc + axios |
| **API** | stdio | rest, graphql, contract | axios + graphql-request + Ajv |
| **Data** | stdio | query, compare, generate, validate | pg, mongodb, ioredis |

### 3.4 Gateway (`packages/gateway`)

Orchestration hub that:
- Manages MCP client connections to all servers
- Routes tool calls to the appropriate server via the Router
- Handles cron-based scheduled test runs via the Scheduler
- Sends notifications (Slack, Teams, Email) on completion

### 3.5 API Server (`packages/api-server`)

Fastify-based REST API that wraps all engine functionality for the web dashboard:
- Document upload and parsing (PDF, DOCX, XLSX, TXT)
- AI-powered requirement extraction via LLM
- Test plan creation, approval, generation
- Test execution with WebSocket live updates
- Results retrieval and analysis
- Connector-based import (Jira, GitHub)

### 3.6 LLM Layer (`packages/llm`)

Pluggable AI abstraction supporting:
- **Ollama** (default, free, local)
- **OpenAI** (GPT-4o, GPT-4o-mini)
- **Anthropic** (Claude)
- **Azure OpenAI** (enterprise)

All providers implement a unified `LLMProvider` interface with `complete(messages, options)`.

### 3.7 Dashboard (`packages/dashboard`)

Next.js 14 web application with:
- 5 main pages (Dashboard, Documents, Test Plans, Runs, Settings)
- Tailwind CSS styling with responsive design
- Real-time WebSocket updates during test execution
- Drag-and-drop document upload

### 3.8 Connectors (`packages/connectors`)

Extensible connector framework for importing requirements from external tools:
- **Jira** -- REST API with JQL queries, acceptance criteria extraction
- **GitHub** -- Issues import via GitHub API
- Pluggable via `Connector` interface

### 3.9 CLI (`packages/cli`)

Command-line interface for developers:
- `tamcp run <file>` -- Execute a single test definition
- `tamcp suite <file>` -- Execute a test suite
- `tamcp validate <file>` -- Validate test files
- `tamcp status` -- Check platform health

---

## 4. Data Flow Architecture

### 4.1 Document-to-Test Pipeline

```
Document Upload ──▶ Format Parser ──▶ Raw Text ──▶ LLM Extractor
                                                        │
                                                        ▼
                                              Structured Requirements
                                                        │
                                                        ▼
                                              Strategist Agent ──▶ Test Plan
                                                                      │
                                                                      ▼
                                              Generator Agent ──▶ Test Definitions
                                                                      │
                                                                      ▼
                                              Executor Agent ──▶ Test Results
                                                                      │
                                                                      ▼
                                              Analyzer Agent ──▶ Analysis + Report
```

### 4.2 Test Execution Pipeline

```
TestDefinition
    │
    ├── setup steps (optional)
    │
    ├── test steps (sequential or parallel)
    │   ├── Step 1: tool call ──▶ MCP Server ──▶ result
    │   ├── Step 2: tool call ──▶ MCP Server ──▶ result
    │   └── Step N: assertions evaluated
    │
    ├── teardown steps (optional)
    │
    └── TestResult (status, duration, step results, assertion results)
```

---

## 5. Deployment Architecture

### 5.1 Local Development

```
docker-compose.full.yaml
├── api-server     (Port 3100)
├── dashboard      (Port 3000)
└── ollama         (Port 11434, optional AI profile)
```

### 5.2 Azure Production

```
Azure Container Apps Environment
├── tamcp-api          (Container App, auto-scale 1-3)
├── tamcp-dashboard    (Container App, auto-scale 1-3)
├── Azure Container Registry
└── EmptyDir Volume    (SQLite data persistence)
```

---

## 6. Security Architecture

| Layer | Mechanism |
|-------|-----------|
| API Server | CORS configuration, request body size limits (50MB) |
| LLM Keys | Environment variables, never in code |
| Connectors | Basic auth, Bearer token, OAuth support |
| Database | WAL mode, foreign key enforcement |
| Docker | Non-root containers, multi-stage builds |
| Azure | Container Apps managed TLS, ACR admin auth |

---

## 7. Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Language | TypeScript | 5.7+ |
| Runtime | Node.js | 20+ |
| Monorepo | Turborepo | 2.4+ |
| Web Framework | Fastify | 5.2+ |
| Frontend | Next.js | 16+ |
| CSS | Tailwind CSS | 4+ |
| Database | SQLite (better-sqlite3) | - |
| ORM | Drizzle ORM | 0.39+ |
| Browser Automation | Playwright | 1.50+ |
| Testing | Vitest | 4+ |
| Container | Docker | - |
| Cloud | Azure Container Apps | - |
| IaC | Bicep | - |
| CI/CD | GitHub Actions | - |

---

## 8. Package Dependency Graph

```
                    ┌─────────┐
                    │  core   │
                    └────┬────┘
         ┌───────┬───────┼───────┬────────────────────┐
         ▼       ▼       ▼       ▼                    ▼
     ┌───────┐ ┌───┐ ┌───────┐ ┌──────────┐    ┌──────────┐
     │agents │ │llm│ │gateway│ │mcp-servers│    │connectors│
     │(4 pkg)│ └─┬─┘ └───────┘ │ (5 pkg)  │    └─────┬────┘
     └───┬───┘   │              └──────────┘          │
         │       │                                     │
         ▼       ▼                                     ▼
    ┌─────────────────┐                          ┌──────────┐
    │   api-server     │◄────────────────────────│connectors│
    └────────┬────────┘                          └──────────┘
             │
             ▼
      ┌────────────┐        ┌─────┐
      │  dashboard  │        │ cli │
      └────────────┘        └─────┘
```
