# Requirements Document

## Test Automation MCP Platform

**Version:** 0.1.0
**Last Updated:** February 2026

---

## 1. Functional Requirements

### 1.1 Test Automation Engine

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-001 | System shall execute automated tests against web applications using Playwright | Critical | Implemented |
| FR-002 | System shall execute automated tests against Salesforce using jsforce and Playwright | Critical | Implemented |
| FR-003 | System shall execute automated tests against SAP using Playwright (Fiori), node-rfc, and OData | Critical | Implemented |
| FR-004 | System shall execute REST and GraphQL API tests with schema validation | High | Implemented |
| FR-005 | System shall execute data validation tests against PostgreSQL, MongoDB, and Redis | High | Implemented |
| FR-006 | System shall support YAML/JSON test definition format | Critical | Implemented |
| FR-007 | System shall support test suites grouping multiple test definitions | High | Implemented |
| FR-008 | System shall support setup and teardown steps per test | High | Implemented |
| FR-009 | System shall support test retries on failure | Medium | Implemented |
| FR-010 | System shall support parallel test execution | Medium | Implemented |
| FR-011 | System shall support variable interpolation in test definitions | High | Implemented |
| FR-012 | System shall support assertion evaluation (equals, contains, regex, comparison operators) | Critical | Implemented |

### 1.2 AI / Intelligence

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-020 | System shall analyze requirements and generate prioritized test plans | High | Implemented |
| FR-021 | System shall generate executable test definitions from test plans | High | Implemented |
| FR-022 | System shall analyze test results and provide failure categorization | High | Implemented |
| FR-023 | System shall generate AI-powered recommendations for test improvements | Medium | Implemented |
| FR-024 | System shall extract structured requirements from uploaded documents using LLM | High | Implemented |
| FR-025 | System shall support multiple LLM providers (Ollama, OpenAI, Anthropic, Azure OpenAI) | High | Implemented |
| FR-026 | System shall provide fallback requirement extraction when LLM is unavailable | Medium | Implemented |

### 1.3 Document Processing

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-030 | System shall accept PDF document uploads and extract text | High | Implemented |
| FR-031 | System shall accept Word (.docx) document uploads and extract text | High | Implemented |
| FR-032 | System shall accept Excel (.xlsx) uploads and extract data | High | Implemented |
| FR-033 | System shall accept plain text / markdown paste | High | Implemented |
| FR-034 | System shall support file uploads up to 50MB | Medium | Implemented |

### 1.4 Web Dashboard

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-040 | Dashboard shall display platform overview with statistics | High | Implemented |
| FR-041 | Dashboard shall provide drag-and-drop document upload | High | Implemented |
| FR-042 | Dashboard shall display extracted requirements from documents | High | Implemented |
| FR-043 | Dashboard shall allow test plan review, approval, and rejection | High | Implemented |
| FR-044 | Dashboard shall allow one-click test generation from approved plans | High | Implemented |
| FR-045 | Dashboard shall allow one-click test execution | High | Implemented |
| FR-046 | Dashboard shall display real-time test execution progress via WebSocket | High | Implemented |
| FR-047 | Dashboard shall display test results with pass/fail charts and analysis | High | Implemented |
| FR-048 | Dashboard shall display LLM configuration and environment settings | Medium | Implemented |

### 1.5 External Integrations

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-050 | System shall import requirements from Jira via REST API | High | Implemented |
| FR-051 | System shall import requirements from GitHub Issues | Medium | Implemented |
| FR-052 | System shall send notifications to Slack on test completion | Medium | Implemented |
| FR-053 | System shall send notifications to Microsoft Teams | Medium | Implemented |
| FR-054 | System shall send notifications via Email (SMTP) | Low | Implemented |
| FR-055 | System shall support scheduled test execution via cron expressions | Medium | Implemented |

### 1.6 CLI

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-060 | CLI shall execute single test definition files | High | Implemented |
| FR-061 | CLI shall execute test suite files | High | Implemented |
| FR-062 | CLI shall validate test definition syntax | Medium | Implemented |
| FR-063 | CLI shall display platform status | Low | Implemented |

---

## 2. Non-Functional Requirements

### 2.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-001 | API response time (non-execution endpoints) | < 200ms |
| NFR-002 | Document parsing time (< 10 pages) | < 5 seconds |
| NFR-003 | LLM requirement extraction time | < 30 seconds |
| NFR-004 | Dashboard initial load time | < 3 seconds |
| NFR-005 | WebSocket update latency | < 100ms |

### 2.2 Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-010 | API server uptime | 99.5% |
| NFR-011 | Data persistence (no data loss on restart) | WAL mode enabled |
| NFR-012 | Graceful error handling (no unhandled crashes) | All errors caught |
| NFR-013 | Test execution isolation (one test failure doesn't affect others) | Per-test try/catch |

### 2.3 Usability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-020 | Non-technical user can upload document and run tests | No CLI/code knowledge required |
| NFR-021 | Dashboard responsive on desktop and tablet | Tailwind responsive breakpoints |
| NFR-022 | Clear error messages for all failure modes | User-friendly error text |

### 2.4 Security

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-030 | LLM API keys stored in environment variables, never in code | Env-var only |
| NFR-031 | Connector credentials not persisted to database | In-memory only |
| NFR-032 | Upload file type validation | Extension whitelist |
| NFR-033 | Request body size limit | 50MB max |

### 2.5 Maintainability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-040 | Codebase uses TypeScript with strict mode | Enabled |
| NFR-041 | Minimum 80% unit test coverage on core/agent packages | 153 tests passing |
| NFR-042 | Monorepo with clear package boundaries | Turborepo workspaces |
| NFR-043 | All configurations validated via Zod schemas | Schema-first |

---

## 3. System Requirements

### 3.1 Development Environment

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker (optional, for containerized deployment)
- Git

### 3.2 Production Environment

- Docker runtime OR Node.js 20+ host
- 2GB RAM minimum
- 10GB disk space
- Network access to target systems under test
- (Optional) Ollama for local AI, or API key for cloud LLM provider

### 3.3 Azure Deployment

- Azure subscription
- Azure CLI installed
- Permissions to create: Container Apps, Container Registry

---

## 4. Constraints

| Constraint | Description |
|-----------|-------------|
| MCP Transport | Currently stdio only; HTTP/SSE transport planned for future |
| Database | SQLite (single-writer); PostgreSQL migration path defined |
| Concurrent Users | Single-user optimized; multi-user requires PostgreSQL |
| SAP GUI | Windows-only VBScript COM bridge for SAP GUI automation |
| Browser Tests | Requires Playwright browsers installed in execution environment |
