import chalk from "chalk";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

interface InitOptions {
  verbose?: boolean;
  quiet?: boolean;
}

const SAMPLE_GATEWAY_CONFIG = `port: 3100
host: localhost
logLevel: info

environments:
  default:
    name: default
    description: Local development environment
    web:
      baseUrl: http://localhost:3000
      browser: chromium
      headless: true
      viewport:
        width: 1280
        height: 720
      timeout: 30000
    api:
      baseUrl: http://localhost:3000/api
      authType: none

defaultEnvironment: default

mcpServers:
  web:
    command: node
    args: ["../mcp-servers/web/dist/index.js"]

execution:
  maxParallelTests: 4
  defaultTimeout: 300000
  retryAttempts: 1
  retryDelay: 5000

reporting:
  outputDir: ./reports
  formats:
    - json
    - html
  screenshotsOnFailure: true
`;

const SAMPLE_TEST = `test:
  id: "TC-SAMPLE-001"
  name: "Sample Test - Homepage Check"
  description: "Verify the homepage loads and displays the expected title"
  type: smoke
  priority: high
  tags: [smoke, web, sample]
  timeout: 60000

  variables:
    expectedTitle: "Welcome"

  steps:
    - name: "Navigate to homepage"
      action: web/navigate
      url: "\${baseUrl}/"

    - name: "Verify page loaded"
      action: web/assertVisible
      selector: "body"

    - name: "Check page title"
      action: web/assertText
      selector: "h1"
      value: "\${expectedTitle}"
`;

const SAMPLE_SUITE = `suite:
  id: "SUITE-SAMPLE-SMOKE"
  name: "Sample Smoke Suite"
  description: "A sample smoke test suite"
  tags: [smoke, sample]
  parallel: false
  maxWorkers: 1
  tests:
    - "TC-SAMPLE-001"
`;

const SAMPLE_ENV = `# Web Application
WEB_BASE_URL=http://localhost:3000

# API
API_BASE_URL=http://localhost:3000/api
API_AUTH_TOKEN=

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=test_automation
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
NODE_ENV=development
`;

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function createFileIfMissing(filePath: string, content: string, label: string): Promise<boolean> {
  if (await pathExists(filePath)) {
    console.log(`  ${chalk.yellow("○")} ${label} ${chalk.gray("(already exists)")}`);
    return false;
  }
  await writeFile(filePath, content, "utf-8");
  console.log(`  ${chalk.green("✓")} ${label}`);
  return true;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const cwd = process.cwd();

  console.log();
  console.log(chalk.bold.cyan("Initializing Test Automation MCP project"));
  console.log(chalk.gray("─".repeat(50)));
  console.log();

  console.log(chalk.bold("Creating directories..."));
  const dirs = [
    "config",
    "tests",
    "tests/suites",
    "reports",
  ];

  for (const dir of dirs) {
    const dirPath = join(cwd, dir);
    if (await pathExists(dirPath)) {
      console.log(`  ${chalk.yellow("○")} ${dir}/ ${chalk.gray("(already exists)")}`);
    } else {
      await mkdir(dirPath, { recursive: true });
      console.log(`  ${chalk.green("✓")} ${dir}/`);
    }
  }

  console.log();
  console.log(chalk.bold("Creating config files..."));
  await createFileIfMissing(
    join(cwd, "config", "gateway.yaml"),
    SAMPLE_GATEWAY_CONFIG,
    "config/gateway.yaml"
  );

  console.log();
  console.log(chalk.bold("Creating sample test files..."));
  await createFileIfMissing(
    join(cwd, "tests", "tc-sample-001.yaml"),
    SAMPLE_TEST,
    "tests/tc-sample-001.yaml"
  );
  await createFileIfMissing(
    join(cwd, "tests", "suites", "smoke-sample.yaml"),
    SAMPLE_SUITE,
    "tests/suites/smoke-sample.yaml"
  );

  console.log();
  console.log(chalk.bold("Creating environment file..."));
  await createFileIfMissing(
    join(cwd, ".env.example"),
    SAMPLE_ENV,
    ".env.example"
  );

  console.log();
  console.log(chalk.gray("─".repeat(50)));
  console.log();
  console.log(chalk.green.bold("Project initialized successfully!"));
  console.log();
  console.log(chalk.bold("Next steps:"));
  console.log(`  1. Copy ${chalk.cyan(".env.example")} to ${chalk.cyan(".env")} and fill in your values`);
  console.log(`  2. Edit ${chalk.cyan("config/gateway.yaml")} for your environment`);
  console.log(`  3. Write your test definitions in ${chalk.cyan("tests/")}`);
  console.log(`  4. Validate your tests: ${chalk.cyan("tamcp validate tests/")}`);
  console.log(`  5. Run a test: ${chalk.cyan("tamcp run tests/tc-sample-001.yaml")}`);
  console.log();
}
