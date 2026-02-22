#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { runCommand } from "./commands/run.js";
import { validateCommand } from "./commands/validate.js";
import { initCommand } from "./commands/init.js";
import { suiteCommand } from "./commands/suite.js";
import { listCommand } from "./commands/list.js";
import { reportCommand } from "./commands/report.js";
import { statusCommand } from "./commands/status.js";

const program = new Command();

program
  .name("tamcp")
  .description("Test Automation MCP — CLI for running and managing test definitions")
  .version("0.1.0")
  .option("-c, --config <path>", "path to gateway config file", "config/gateway.yaml")
  .option("-v, --verbose", "enable verbose output")
  .option("-q, --quiet", "suppress non-essential output");

program
  .command("run <test-file>")
  .description("Run a single test YAML file")
  .option("-e, --environment <name>", "target environment", "default")
  .option("--headless", "run browser in headless mode", true)
  .option("--no-headless", "run browser with visible UI")
  .option("-t, --timeout <ms>", "override test timeout in milliseconds")
  .action(async (testFile: string, opts) => {
    const globalOpts = program.opts();
    await runCommand(testFile, { ...globalOpts, ...opts });
  });

program
  .command("suite <suite-file>")
  .description("Run a test suite")
  .option("-e, --environment <name>", "target environment", "default")
  .option("-p, --parallel", "run tests in parallel", false)
  .option("-w, --workers <count>", "number of parallel workers", "4")
  .option("--tags <tags>", "filter by tags (comma-separated)")
  .action(async (suiteFile: string, opts) => {
    const globalOpts = program.opts();
    await suiteCommand(suiteFile, { ...globalOpts, ...opts });
  });

program
  .command("validate <path>")
  .description("Validate test definition YAML files")
  .action(async (targetPath: string) => {
    const globalOpts = program.opts();
    await validateCommand(targetPath, globalOpts);
  });

program
  .command("list <directory>")
  .description("List all test definitions in a directory")
  .action(async (directory: string) => {
    const globalOpts = program.opts();
    await listCommand(directory, globalOpts);
  });

program
  .command("report <results-file>")
  .description("Generate a report from results JSON")
  .option("-f, --format <type>", "output format (json|text|junit)", "text")
  .action(async (resultsFile: string, opts) => {
    const globalOpts = program.opts();
    await reportCommand(resultsFile, { ...globalOpts, ...opts });
  });

program
  .command("init")
  .description("Initialize a new test project")
  .action(async () => {
    const globalOpts = program.opts();
    await initCommand(globalOpts);
  });

program
  .command("status")
  .description("Show gateway status")
  .action(async () => {
    const globalOpts = program.opts();
    await statusCommand(globalOpts as { config: string; verbose?: boolean; quiet?: boolean });
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(chalk.red(`\nFatal error: ${err.message}`));
  if (process.env["DEBUG"]) {
    console.error(err.stack);
  }
  process.exit(1);
});
