# API Reference

## Test Automation MCP Platform

**Version:** 0.1.0
**Base URL:** `http://localhost:3100`

---

## 1. Documents

### Upload Document

```
POST /api/documents/upload
Content-Type: multipart/form-data
```

**Body:** Form data with `file` field (PDF, DOCX, XLSX, TXT, MD, CSV)

**Response (201):**
```json
{
  "id": "uuid",
  "name": "requirements.pdf",
  "status": "parsed",
  "metadata": {
    "pageCount": 5,
    "wordCount": 2340,
    "format": "pdf"
  },
  "extraction": {
    "requirements": [
      {
        "id": "REQ-001",
        "title": "User login with valid credentials",
        "description": "System shall allow users to log in",
        "type": "functional",
        "priority": "high",
        "targetSystem": "web",
        "acceptanceCriteria": ["User enters valid email", "System redirects to dashboard"]
      }
    ],
    "summary": "Login and authentication requirements",
    "confidence": 0.85
  }
}
```

### Submit Text

```
POST /api/documents/text
Content-Type: application/json
```

**Body:**
```json
{
  "text": "The system shall allow users to...",
  "title": "Login Requirements"
}
```

**Response (201):** Same structure as upload.

### List Documents

```
GET /api/documents
```

**Response (200):**
```json
{
  "documents": [
    {
      "id": "uuid",
      "name": "requirements.pdf",
      "type": "pdf",
      "status": "parsed",
      "createdAt": "2026-02-22T10:00:00.000Z",
      "updatedAt": "2026-02-22T10:00:05.000Z"
    }
  ]
}
```

### Get Document

```
GET /api/documents/:id
```

**Response (200):** Full document with `parsedRequirements` object.

---

## 2. Test Plans

### Create Test Plan

```
POST /api/test-plans
Content-Type: application/json
```

**Body:**
```json
{
  "documentId": "uuid"
}
```

Or with direct requirements:
```json
{
  "requirements": [
    {
      "id": "REQ-001",
      "title": "User login",
      "description": "...",
      "type": "functional",
      "priority": "high",
      "targetSystem": "web",
      "acceptanceCriteria": ["..."]
    }
  ]
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "status": "draft",
  "plan": {
    "testCases": [
      {
        "id": "TC-001",
        "name": "Verify user login with valid credentials",
        "type": "e2e",
        "priority": "high",
        "targetSystems": ["web"],
        "estimatedDuration": 15000
      }
    ],
    "estimatedDuration": 60000
  },
  "requirementCount": 5
}
```

### List Test Plans

```
GET /api/test-plans
```

### Get Test Plan

```
GET /api/test-plans/:id
```

### Approve Test Plan

```
POST /api/test-plans/:id/approve
```

**Response (200):**
```json
{ "id": "uuid", "status": "approved" }
```

### Reject Test Plan

```
POST /api/test-plans/:id/reject
```

### Generate Tests

```
POST /api/test-plans/:id/generate
```

**Response (201):**
```json
{
  "testPlanId": "uuid",
  "generated": [
    { "id": "uuid", "name": "Verify user login with valid credentials" },
    { "id": "uuid", "name": "Verify login error with invalid password" }
  ],
  "warnings": []
}
```

---

## 3. Test Execution

### Run Tests

```
POST /api/tests/run
Content-Type: application/json
```

**Body:**
```json
{
  "testPlanId": "uuid",
  "environment": "default",
  "parallel": false
}
```

Or with specific test definition IDs:
```json
{
  "testDefinitionIds": ["uuid1", "uuid2"],
  "environment": "staging"
}
```

**Response (202):**
```json
{
  "runId": "uuid",
  "status": "running",
  "testCount": 5
}
```

### List Runs

```
GET /api/tests/runs
```

**Response (200):**
```json
{
  "runs": [
    {
      "id": "uuid",
      "status": "completed",
      "environment": "default",
      "startedAt": "2026-02-22T10:05:00.000Z",
      "finishedAt": "2026-02-22T10:05:30.000Z",
      "resultsSummaryJson": {
        "total": 10,
        "passed": 9,
        "failed": 1,
        "errors": 0,
        "passRate": 90,
        "recommendations": ["Review failing assertion in test TC-003"]
      }
    }
  ]
}
```

### Get Run Details

```
GET /api/tests/runs/:id
```

**Response (200):** Run details with full `results` array including per-test step results.

---

## 4. Results

### Get Historical Results

```
GET /api/results?limit=20&status=completed
```

### Get Specific Run Results

```
GET /api/results/:runId
```

**Response (200):**
```json
{
  "run": { "id": "uuid", "status": "completed", "..." : "..." },
  "results": [
    {
      "id": "uuid",
      "testId": "TC-001",
      "testName": "Verify user login",
      "status": "success",
      "duration": 2500,
      "result": { "...full TestResult..." },
      "analysis": null
    }
  ]
}
```

---

## 5. WebSocket

### Live Execution Updates

```
WS /ws/runs/:runId
```

**Messages received:**

```json
{ "type": "run_started", "runId": "uuid", "testCount": 5 }
```

```json
{ "type": "test_completed", "testId": "TC-001", "testName": "Login test", "status": "success", "duration": 2500 }
```

```json
{ "type": "run_completed", "runId": "uuid", "summary": { "total": 5, "passed": 4, "failed": 1, "passRate": 80 } }
```

```json
{ "type": "run_failed", "runId": "uuid", "error": "Execution error message" }
```

---

## 6. Connectors

### List Connectors

```
GET /api/connectors
```

**Response (200):**
```json
{
  "registered": ["jira"],
  "available": ["jira", "github"]
}
```

### Register Connector

```
POST /api/connectors/register
Content-Type: application/json
```

**Body:**
```json
{
  "name": "jira",
  "config": {
    "type": "jira",
    "baseUrl": "https://yourcompany.atlassian.net",
    "auth": {
      "type": "basic",
      "username": "user@company.com",
      "password": "jira-api-token"
    }
  }
}
```

### Import from Connector

```
POST /api/connectors/:name/import
Content-Type: application/json
```

**Body:**
```json
{
  "project": "PROJ",
  "status": ["To Do", "In Progress"],
  "labels": ["test-automation"],
  "maxResults": 50
}
```

**Response (201):**
```json
{
  "documentId": "uuid",
  "importedCount": 15,
  "extractedRequirements": 12,
  "extraction": { "..." }
}
```

---

## 7. Platform Status

### Health Check

```
GET /api/status
```

**Response (200):**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "stats": {
    "totalRuns": 42,
    "completedRuns": 40,
    "runningRuns": 1
  }
}
```

### LLM Configuration

```
GET /api/config/llm
```

**Response (200):**
```json
{
  "provider": "ollama",
  "model": "llama3",
  "available": true
}
```

### Environments

```
GET /api/config/environments
```

**Response (200):**
```json
{
  "environments": [
    { "name": "default", "description": "Local development environment" },
    { "name": "staging", "description": "Staging environment" }
  ]
}
```

---

## 8. Error Responses

All error responses follow the format:

```json
{
  "error": "Human-readable error message",
  "details": "Optional technical details"
}
```

| Status Code | Meaning |
|-------------|---------|
| 400 | Bad request (missing/invalid parameters) |
| 404 | Resource not found |
| 500 | Internal server error |
