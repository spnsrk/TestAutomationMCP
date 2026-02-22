# User Guide

## Test Automation MCP Platform

**Version:** 0.1.0
**Last Updated:** February 2026

---

## 1. Getting Started

### 1.1 What Is This Platform?

The Test Automation MCP Platform is an AI-powered tool that lets you automatically generate and run tests for web applications, Salesforce, and SAP systems. You can:

- Upload a requirements document and get automated tests
- Import user stories from Jira
- Review and approve test plans before execution
- Run tests with one click and watch them execute in real-time
- View detailed results with AI-powered failure analysis

**No coding or command-line knowledge is required** -- everything is done through a web dashboard.

### 1.2 Starting the Platform

#### Option A: Docker (Recommended)

```bash
docker compose -f docker/docker-compose.full.yaml up
```

Then open `http://localhost:3000` in your browser.

#### Option B: Manual Start

```bash
# Terminal 1: Start the API server
cd packages/api-server && npm start

# Terminal 2: Start the dashboard
cd packages/dashboard && npm run dev
```

Then open `http://localhost:3000` in your browser.

---

## 2. Dashboard Overview

When you open the dashboard, you'll see the **Home** page with:

- **Quick Stats** -- Total runs, completed, currently running
- **Quick Actions** -- Shortcuts to upload requirements or view runs
- **Recent Runs** -- Latest test execution results

The **left sidebar** has navigation to all sections:

| Section | Purpose |
|---------|---------|
| **Dashboard** | Overview and quick actions |
| **Documents** | Upload and manage requirement documents |
| **Test Plans** | Review and approve AI-generated test plans |
| **Test Runs** | Monitor execution and view results |
| **Settings** | Configure LLM, environments |

---

## 3. Uploading Requirements

### 3.1 Supported Formats

| Format | Extensions | Description |
|--------|-----------|-------------|
| PDF | `.pdf` | Functional Design Documents, specs |
| Word | `.docx` | Requirements documents, user stories |
| Excel | `.xlsx`, `.xls` | Test case spreadsheets |
| Text | `.txt`, `.md`, `.csv` | Plain text, markdown |
| Paste | -- | Type or paste text directly |

### 3.2 Uploading a File

1. Go to **Documents** in the sidebar
2. Click **Upload File** tab
3. Either:
   - **Drag and drop** a file onto the upload area, or
   - Click **Choose File** and select from your computer
4. Wait for the upload to process (usually a few seconds)
5. The AI will automatically extract requirements from the document

### 3.3 Pasting Text

1. Go to **Documents** in the sidebar
2. Click **Paste Text** tab
3. Enter an optional **title** (e.g., "Login Feature Requirements")
4. Paste your requirements text into the large text area
5. Click **Submit & Extract Requirements**

### 3.4 What Happens After Upload

The platform:
1. Parses the document (extracts text from PDF/Word/Excel)
2. Sends the text to the AI for requirement extraction
3. Produces **Structured Requirements** with:
   - Unique ID (REQ-001, REQ-002, etc.)
   - Title
   - Description
   - Type (functional, UI, API, data, etc.)
   - Priority (critical, high, medium, low)
   - Target system (web, Salesforce, SAP, API, data)
   - Acceptance criteria

---

## 4. Reviewing Test Plans

### 4.1 Creating a Test Plan

After uploading a document:
1. On the **Documents** page, find your document with status **parsed**
2. Click **Create Test Plan**
3. The AI Strategist generates a prioritized test plan

### 4.2 Reviewing the Plan

1. Go to **Test Plans** in the sidebar
2. Click on a plan from the left panel
3. Review the test cases:
   - **ID** -- Unique test case identifier
   - **Name** -- What the test verifies
   - **Priority** -- Critical, High, Medium, Low
   - **Type** -- E2E, Integration, API, Unit, etc.
   - **Target Systems** -- Web, Salesforce, SAP, API, Data

### 4.3 Approving or Rejecting

- Click **Approve** to accept the test plan
- Click **Reject** if the plan needs changes (you can create a new one)

---

## 5. Generating and Running Tests

### 5.1 Generating Tests

After approving a plan:
1. On the **Test Plans** page, select your approved plan
2. Click **Generate Tests**
3. The AI Generator creates executable test definitions

### 5.2 Running Tests

1. Click **Run Tests** on the test plan
2. The tests start executing immediately
3. You'll see a progress indicator

### 5.3 Monitoring Execution

- Go to **Test Runs** in the sidebar
- Select an active run from the left panel
- Watch real-time progress as each test completes
- Results update live via WebSocket -- no need to refresh

---

## 6. Understanding Results

### 6.1 Run Summary

After a run completes, you'll see:

- **Total** -- Number of tests executed
- **Passed** -- Tests that succeeded (shown in green)
- **Failed** -- Tests that failed (shown in red)
- **Pass Rate** -- Percentage shown as a progress bar

### 6.2 Individual Test Results

Each test shows:
- **Status** -- Success, Failure, Error, or Skipped
- **Duration** -- How long it took (in milliseconds)
- **Details** -- Step-by-step results (click to expand)

### 6.3 AI Recommendations

The Analyzer provides:
- **Failure Categories** -- Why tests failed (assertion, timeout, config, etc.)
- **Recommendations** -- Specific suggestions to fix failing tests
- **Trend Data** -- Performance patterns over multiple runs

---

## 7. Importing from Jira

### 7.1 Configuring Jira

1. Go to **Settings** (or use the API directly)
2. Register your Jira connection with:
   - **Base URL** -- Your Jira instance (e.g., `https://yourcompany.atlassian.net`)
   - **Auth Type** -- Basic (email + API token) or Bearer token
   - **Credentials** -- Your Jira API token

### 7.2 Importing Stories

Once configured, import Jira stories via the API:

```
POST /api/connectors/jira/import
{
  "project": "PROJ",
  "status": ["To Do", "In Progress"],
  "maxResults": 50
}
```

The imported stories become a document with extracted requirements, just like uploading a file.

---

## 8. Settings and Configuration

### 8.1 LLM Configuration

The AI engine is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `ollama` | AI provider: ollama, openai, anthropic, azure-openai |
| `LLM_MODEL` | `llama3` | Model name |
| `LLM_BASE_URL` | `http://localhost:11434` | Provider API URL |
| `LLM_API_KEY` | -- | API key (for cloud providers) |

**Ollama (Free, Local):** Install [Ollama](https://ollama.ai), run `ollama pull llama3`, and the platform uses it by default.

**OpenAI:** Set `LLM_PROVIDER=openai` and `LLM_API_KEY=sk-...`

### 8.2 Environments

The platform supports multiple test environments:
- **default** -- Local development
- **staging** -- Staging environment
- **production** -- Production (read-only tests recommended)

---

## 9. Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| "API server not available" | Start the API server: `cd packages/api-server && npm start` |
| "LLM not available" | Install and start Ollama, or set cloud LLM env vars |
| Document upload fails | Check file size (max 50MB) and format (PDF, DOCX, XLSX, TXT) |
| No requirements extracted | Try a more detailed document, or check LLM connection in Settings |
| Tests show "simulated" | MCP servers are not connected; tests run in simulation mode |

### Getting Help

- Check the **Settings** page for system health
- Review the API server logs (printed to terminal)
- File issues on the GitHub repository

---

## 10. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Click sidebar item | Navigate to section |
| Drag & drop | Upload document |
| Click "Create Test Plan" | Generate plan from parsed document |
| Click "Approve" | Approve a test plan |
| Click "Generate Tests" | Create test definitions |
| Click "Run Tests" | Execute tests |
