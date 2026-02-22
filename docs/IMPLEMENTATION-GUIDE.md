# Implementation Guide

## Test Automation MCP Platform

**Version:** 0.1.0
**Last Updated:** February 2026

---

## 1. Project Structure

```
TestAutomationMCP/
├── packages/
│   ├── core/                      # Shared types, schemas, utilities
│   │   └── src/
│   │       ├── types/             # Zod schemas + TypeScript types
│   │       ├── utils/             # Logger, errors, registry, variables
│   │       └── schema/            # Test definition loader/validator
│   │
│   ├── agents/
│   │   ├── strategist/            # Test plan generation agent
│   │   ├── generator/             # Test definition generation agent
│   │   ├── executor/              # Test execution agent
│   │   └── analyzer/              # Results analysis agent
│   │
│   ├── mcp-servers/
│   │   ├── web/                   # Playwright web automation tools
│   │   ├── salesforce/            # jsforce + Playwright SF tools
│   │   ├── sap/                   # Playwright + node-rfc SAP tools
│   │   ├── api/                   # REST/GraphQL API testing tools
│   │   └── data/                  # Database testing tools
│   │
│   ├── gateway/                   # MCP orchestration, routing, scheduling
│   ├── cli/                       # Command-line interface
│   ├── llm/                       # Pluggable LLM abstraction layer
│   ├── api-server/                # Fastify REST API server
│   ├── dashboard/                 # Next.js web dashboard
│   └── connectors/                # External system connectors
│
├── config/
│   └── gateway.yaml               # Gateway configuration
│
├── tests/                         # Example test definition files
│   ├── suites/                    # Test suite YAML files
│   └── cross-system/              # Cross-system test scenarios
│
├── docker/
│   ├── Dockerfile.api             # API server container
│   ├── Dockerfile.dashboard       # Dashboard container
│   ├── Dockerfile.gateway         # Gateway container
│   ├── Dockerfile.web             # Web MCP server container
│   ├── docker-compose.yaml        # Basic compose
│   └── docker-compose.full.yaml   # Full stack compose
│
├── infra/
│   └── azure/
│       ├── main.bicep             # Azure infrastructure as code
│       └── deploy.sh              # Deployment script
│
├── .github/
│   └── workflows/
│       └── test.yaml              # CI/CD pipeline
│
├── docs/                          # Documentation
├── package.json                   # Root monorepo config
├── turbo.json                     # Turborepo task config
├── tsconfig.base.json             # Shared TypeScript config
└── vitest.config.mts              # Test runner config
```

---

## 2. Development Setup

### 2.1 Prerequisites

```bash
node --version   # v20.0.0 or higher
npm --version    # v10.0.0 or higher
```

### 2.2 Installation

```bash
git clone https://github.com/SapanGauri/TestAutomationMCP.git
cd TestAutomationMCP
npm install
```

### 2.3 Build All Packages

```bash
npm run build
# Or build specific packages:
npx turbo run build --filter=@test-automation-mcp/core
npx turbo run build --filter=@test-automation-mcp/api-server
```

### 2.4 Run Tests

```bash
npm test                    # Run all 153 tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
```

### 2.5 Start Development Servers

```bash
# Terminal 1: API Server
cd packages/api-server && npm start

# Terminal 2: Dashboard
cd packages/dashboard && npm run dev
```

The API server runs on `http://localhost:3100` and the dashboard on `http://localhost:3000`.

---

## 3. Package Implementation Details

### 3.1 Core Package

**Location:** `packages/core`

The core package defines the contract for the entire platform.

**Test Definition Schema (Zod):**
- `TestDefinitionSchema` -- Complete test with metadata, steps, assertions
- `TestSuiteSchema` -- Collection of tests with shared config
- `TestStepSchema` -- Individual step (tool call + params)
- `AssertionSchema` -- Expected outcome definition

**Key Utilities:**
- `createLogger(name)` -- Creates a Pino logger with the given component name
- `ToolRegistry` -- Generic registry pattern: `register(name, descriptor)`, `get(name)`, `list()`
- `VariableResolver` -- Resolves `${path.to.value}` expressions against a context object

**Error Hierarchy:**
```
TestAutomationError
├── ConnectionError
├── AuthenticationError
├── ToolExecutionError
├── TestDefinitionError
├── TimeoutError
└── AssertionError
```

### 3.2 Agent Package Pattern

All four agents follow the same structural pattern:

```typescript
export class AgentNameAgent {
  async mainMethod(request: RequestType): Promise<ResponseType> {
    // 1. Validate input
    // 2. Process
    // 3. Return structured result
  }
}
```

**Strategist Agent:**
- `analyze({ scope, requirements, targetSystems })` → `TestPlanResponse`
- Categorizes requirements by system type (web, sf, sap, api, data)
- Assigns priority and estimated duration
- Generates coverage targets

**Generator Agent:**
- `generate({ plannedTests })` → `TestGenerationResponse`
- Matches test type to step templates (e2e, integration, api, performance)
- Generates complete TestDefinition objects with setup/teardown

**Executor Agent:**
- `execute({ tests, environment, parallel })` → `TestExecutionResponse`
- Runs setup → steps → assertions → teardown
- Supports retry logic and parallel execution
- Evaluates assertions: equals, contains, regex, `>=`, `<=`, `>`, `<`

**Analyzer Agent:**
- `analyze({ results })` → `AnalysisResponse`
- Computes summary statistics (pass rate, avg duration)
- Categorizes failures (assertion, timeout, configuration, environment, unknown)
- Generates actionable recommendations

### 3.3 MCP Server Pattern

Each MCP server:
1. Initializes its domain-specific client (Playwright, jsforce, etc.)
2. Registers tools via the ToolRegistry
3. Exposes tools through the MCP stdio transport

**Tool Definition Pattern:**
```typescript
{
  name: "web_navigate",
  description: "Navigate to a URL",
  inputSchema: { /* JSON Schema */ },
  handler: async (params) => { /* implementation */ }
}
```

### 3.4 API Server

**Framework:** Fastify 5.x with plugins:
- `@fastify/cors` -- Cross-origin support
- `@fastify/multipart` -- File uploads (50MB limit)
- `@fastify/websocket` -- Real-time updates
- `@fastify/static` -- Serve dashboard build

**Route Modules:**
| Module | Base Path | Purpose |
|--------|-----------|---------|
| `documents.ts` | `/api/documents` | Upload, parse, list, get documents |
| `test-plans.ts` | `/api/test-plans` | Create, approve, generate, get plans |
| `execution.ts` | `/api/tests` | Run tests, get run status |
| `results.ts` | `/api/results` | Get historical results, platform status |
| `connectors.ts` | `/api/connectors` | Register, import from external systems |

**Database:** SQLite via better-sqlite3 + Drizzle ORM
- Tables auto-created on first connection
- WAL mode for better concurrent read performance
- Foreign key constraints enforced

### 3.5 LLM Layer

**Router Pattern:** The `LLMRouter` selects a provider based on configuration and delegates all calls:

```typescript
const router = new LLMRouter({
  provider: "ollama",
  model: "llama3",
  baseUrl: "http://localhost:11434"
});

const result = await router.complete([
  { role: "system", content: "You are a test analyst." },
  { role: "user", content: "Extract requirements from: ..." }
], { jsonMode: true, temperature: 0.2 });
```

### 3.6 Dashboard

**Framework:** Next.js 14 (App Router) + Tailwind CSS

**Pages:**
| Route | Component | Data Source |
|-------|-----------|-------------|
| `/` | Home dashboard | `GET /api/status`, `GET /api/results` |
| `/documents` | Upload + list | `POST /api/documents/*`, `GET /api/documents` |
| `/test-plans` | Review + approve | `GET/POST /api/test-plans/*` |
| `/runs` | Execution monitor | `GET /api/tests/runs/*`, WebSocket |
| `/settings` | Configuration | `GET /api/config/*` |

### 3.7 Connectors

**Interface:**
```typescript
interface Connector {
  name: string;
  authenticate(config: ConnectorConfig): Promise<void>;
  testConnection(): Promise<boolean>;
  fetchRequirements(query: ConnectorQuery): Promise<RequirementDocument[]>;
  fetchSingle(externalId: string): Promise<RequirementDocument | null>;
}
```

**Registry:** `ConnectorRegistry` manages connector lifecycle -- register, get, list, fetch.

---

## 4. Adding a New MCP Server

To add support for a new system:

1. Create `packages/mcp-servers/new-system/`
2. Create `package.json` with `@test-automation-mcp/core` dependency
3. Implement tools following the ToolDescriptor pattern
4. Create a server class that registers all tools
5. Add entry in `config/gateway.yaml`
6. The Gateway router automatically discovers and routes to it

---

## 5. Adding a New Connector

1. Create `packages/connectors/src/providers/new-connector.ts`
2. Implement the `Connector` interface
3. Register it in `packages/connectors/src/registry.ts`
4. The API server connector routes automatically expose it

---

## 6. Adding a New LLM Provider

1. Create `packages/llm/src/providers/new-provider.ts`
2. Implement the `LLMProvider` interface
3. Add the provider name to the `LLMConfigSchema` enum
4. Add the case to `LLMRouter.createProvider()`

---

## 7. Build and Deployment

### 7.1 Docker (Local)

```bash
# Full stack
docker compose -f docker/docker-compose.full.yaml up --build

# With Ollama AI
docker compose -f docker/docker-compose.full.yaml --profile ai up --build
```

### 7.2 Azure

```bash
cd infra/azure
RESOURCE_GROUP=my-rg LOCATION=eastus ./deploy.sh
```

### 7.3 CI/CD

GitHub Actions workflow (`.github/workflows/test.yaml`) runs on every push:
1. Install dependencies
2. Build all packages
3. Run all tests
4. (On main branch) Build and push Docker images

---

## 8. Testing Strategy

| Layer | Tool | Files |
|-------|------|-------|
| Unit Tests | Vitest | `*.test.ts` in each package |
| Schema Validation | Zod | `core/src/schema/*.test.ts` |
| Integration Tests | Vitest + Mocks | `gateway/src/*.test.ts` |
| API Tests | (Future) Supertest | `api-server/src/**/*.test.ts` |
| E2E Tests | (Future) Playwright | `dashboard/e2e/` |

Current test count: **153 tests across 14 test files**, all passing.
