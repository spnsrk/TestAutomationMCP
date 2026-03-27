# Test Automation MCP Platform

An AI-powered, multi-agent test automation platform built on the **Model Context Protocol (MCP)** standard. Automates test design, generation, execution, and analysis across **full-stack web applications**, **Salesforce**, and **SAP** systems.

---

## Key Features

- **AI QA Engineer** -- Give it a Jira story, GitHub issue, design document, or paste requirements and an autonomous AI agent acts as a senior QA engineer: it reasons about the system, executes real tests using browser/API/DB tools, and produces a structured pass/fail report with root cause analysis. Powered by Anthropic Claude.
- **AI-Powered Test Generation** -- Upload a requirements document (PDF, Word, Excel) and the AI extracts requirements, creates test plans, and generates executable tests automatically.
- **Multi-System Testing** -- Unified testing across Web (Playwright), Salesforce (jsforce), SAP (Fiori/RFC/OData), REST/GraphQL APIs, and databases.
- **Web Dashboard** -- Non-technical users can upload documents, review test plans, run tests, and view results -- all from a browser, no CLI needed.
- **Pluggable LLM** -- Supports Ollama (free/local), OpenAI, Anthropic Claude, and Azure OpenAI. Default is Ollama (zero cost).
- **External Connectors** -- Import requirements directly from Jira, GitHub, and more.
- **Real-Time Monitoring** -- WebSocket-powered live execution updates in the dashboard.
- **Azure Deployment** -- Bicep templates for one-command Azure Container Apps deployment.

---

## Architecture

```
Users ──▶ Web Dashboard (Next.js) ──▶ API Server (Fastify)
                                           │
              ┌────────────────────────────┼──────────────────────────┐
              ▼                            ▼                          ▼
        LLM Router              Multi-Agent Pipeline              Connectors
    (Ollama/OpenAI/...)    Strategist → Generator → Executor → Analyzer
                                                                      │
                          AI QA Engineer (agent-qa)                   │
                          Claude ←→ MCP Gateway ←──────────────────────┘
                                       │
              ┌───────────┬────────────┼────────────┬───────────┐
              ▼           ▼            ▼            ▼           ▼
          Web MCP     SF MCP       SAP MCP       API MCP     Data MCP
        (Playwright)  (jsforce)  (RFC/OData)  (axios/GQL)  (pg/mongo)
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Install and Build

```bash
git clone https://github.com/SapanGauri/TestAutomationMCP.git
cd TestAutomationMCP
npm install
npm run build
```

### Start the Platform

```bash
# Terminal 1: API Server (port 3100)
node packages/api-server/dist/index.js

# Terminal 2: Dashboard (port 3000)
cd packages/dashboard && npm run dev
```

Open `http://localhost:3000` in your browser.

### Using Docker

```bash
docker compose -f docker/docker-compose.full.yaml up --build
```

---

## How to Use

### AI QA Engineer (Fastest Path)

Set your Anthropic API key and give it something to test:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Then from the Dashboard go to **QA Runs** → **New Run** and either:
- Paste a requirement or user story
- Enter a Jira issue key (e.g. `PROJ-123`)
- Enter a GitHub issue reference (e.g. `owner/repo#42`)
- Upload a design or solution document

The AI QA Engineer will autonomously reason about the system, execute browser/API/DB tests, and return a structured report with PASS/FAIL per test case, root causes, and risk level.

### For Non-Technical Users (Full Pipeline)

1. Open `http://localhost:3000`
2. Go to **Documents** and upload a PDF, Word, or Excel requirements document
3. The AI extracts requirements automatically
4. Click **Create Test Plan** to generate a prioritized test plan
5. Review the plan and click **Approve**
6. Click **Generate Tests** to create executable test definitions
7. Click **Run Tests** to execute
8. Watch live progress and view results with AI-powered analysis

### For Developers (CLI)

```bash
# Run a single test
npx tamcp run tests/suites/tc-web-001-login.yaml

# Run a suite
npx tamcp suite tests/suites/smoke-web.yaml

# Validate a test file
npx tamcp validate tests/suites/tc-web-001-login.yaml
```

---

## Project Structure

```
TestAutomationMCP/
├── packages/
│   ├── core/               # Shared types, schemas, utilities
│   ├── agents/
│   │   ├── qa-agent/       # AI QA Engineer (Claude agentic loop)
│   │   ├── strategist/     # AI test plan generation
│   │   ├── generator/      # AI test case generation
│   │   ├── executor/       # Test execution engine
│   │   └── analyzer/       # Results analysis + recommendations
│   ├── mcp-servers/
│   │   ├── web/            # Playwright browser automation
│   │   ├── salesforce/     # jsforce + Lightning UI
│   │   ├── sap/            # Fiori + RFC + OData + GUI
│   │   ├── api/            # REST + GraphQL + Schema validation
│   │   └── data/           # PostgreSQL + MongoDB + Redis
│   ├── gateway/            # MCP orchestration + scheduling
│   ├── llm/                # Pluggable LLM (Ollama, OpenAI, Anthropic, Azure)
│   ├── api-server/         # Fastify REST API (port 3100)
│   ├── dashboard/          # Next.js web UI (port 3000)
│   ├── connectors/         # Jira, GitHub import connectors
│   └── cli/                # Command-line interface
├── config/                 # Gateway configuration
├── tests/                  # Example test definitions (YAML)
├── docker/                 # Dockerfiles + compose
├── infra/azure/            # Bicep IaC + deployment script
└── docs/                   # Full documentation
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | High-level and component architecture with diagrams |
| [Solution Design](docs/SOLUTION-DESIGN.md) | Problem statement, design decisions, data model |
| [Requirements](docs/REQUIREMENTS.md) | Functional and non-functional requirements matrix |
| [Implementation Guide](docs/IMPLEMENTATION-GUIDE.md) | Development setup, package details, extension guides |
| [Sequence Diagrams](docs/SEQUENCE-DIAGRAMS.md) | Mermaid sequence diagrams for all major flows |
| [API Reference](docs/API-REFERENCE.md) | Complete REST API documentation with examples |
| [User Guide](docs/USER-GUIDE.md) | Step-by-step guide for non-technical users |

---

## AI / LLM Configuration

The platform uses AI for requirement extraction, test strategy, failure analysis, and the autonomous AI QA Engineer. Configure via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | -- | **Required for AI QA Engineer.** Get from [console.anthropic.com](https://console.anthropic.com) |
| `LLM_PROVIDER` | `ollama` | `ollama`, `openai`, `anthropic`, `azure-openai` |
| `LLM_MODEL` | `llama3` | Model name |
| `LLM_BASE_URL` | `http://localhost:11434` | Provider API URL |
| `LLM_API_KEY` | -- | API key (cloud providers only) |

**Free local AI (test generation only):** Install [Ollama](https://ollama.ai), run `ollama pull llama3`, and the pipeline works out of the box.

**AI QA Engineer:** Requires `ANTHROPIC_API_KEY`. The agent uses Claude's tool-use capability in an agentic loop to autonomously execute tests.

---

## Testing

```bash
npm test                    # Run all 153 tests
npm run test:coverage       # With coverage report
```

All tests use **Vitest** and run in < 5 seconds.

---

## Deployment

### Docker Compose (Local)

```bash
docker compose -f docker/docker-compose.full.yaml up --build
```

### Azure (Production)

```bash
cd infra/azure
RESOURCE_GROUP=tamcp-rg LOCATION=eastus ./deploy.sh
```

This creates Azure Container Apps, Container Registry, and deploys both the API server and dashboard.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Language | TypeScript 5.7+ (ESM) |
| Runtime | Node.js 20+ |
| Monorepo | Turborepo |
| API Server | Fastify 5 |
| Frontend | Next.js 16, Tailwind CSS 4 |
| Database | SQLite (Drizzle ORM) |
| Browser Automation | Playwright |
| Testing | Vitest |
| Containerization | Docker |
| Cloud | Azure Container Apps |
| IaC | Bicep |
| CI/CD | GitHub Actions |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit and push
6. Open a Pull Request

---

## License

MIT

---

## Author

**Sapan Sarkar** -- [SapanGauri](https://github.com/SapanGauri)
