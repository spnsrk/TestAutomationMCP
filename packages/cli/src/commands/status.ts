import chalk from "chalk";
import ora from "ora";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { GatewayConfigSchema, type GatewayConfig } from "@test-automation-mcp/core";

interface StatusOptions {
  config: string;
  verbose?: boolean;
  quiet?: boolean;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const spinner = ora({ text: "Loading gateway config...", isSilent: options.quiet }).start();

  const configPath = resolve(process.cwd(), options.config);

  let config: GatewayConfig;
  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = parseYaml(raw);
    config = GatewayConfigSchema.parse(parsed);
    spinner.succeed("Gateway config loaded");
  } catch (err) {
    spinner.fail("Failed to load gateway config");
    console.error(chalk.red(`\n${(err as Error).message}`));
    console.error(chalk.gray(`Looked for config at: ${configPath}`));
    process.exit(1);
  }

  console.log();
  console.log(chalk.bold.cyan("Gateway Status"));
  console.log(chalk.gray("─".repeat(50)));
  console.log(`  ${chalk.bold("Host:")}         ${config.host}`);
  console.log(`  ${chalk.bold("Port:")}         ${config.port}`);
  console.log(`  ${chalk.bold("Log Level:")}    ${config.logLevel}`);
  console.log(`  ${chalk.bold("Default Env:")}  ${config.defaultEnvironment}`);
  console.log();

  console.log(chalk.bold("  Environments"));
  for (const [name, env] of Object.entries(config.environments)) {
    const isDefault = name === config.defaultEnvironment;
    const marker = isDefault ? chalk.green(" (default)") : "";
    console.log(`    ${chalk.cyan("●")} ${name}${marker}`);
    if (env.description) {
      console.log(`      ${chalk.gray(env.description)}`);
    }
    const systems: string[] = [];
    if (env.web) systems.push("web");
    if (env.api) systems.push("api");
    if (env.salesforce) systems.push("salesforce");
    if (env.sap) systems.push("sap");
    if (env.database) systems.push("database");
    if (systems.length > 0) {
      console.log(`      ${chalk.gray(`Systems: ${systems.join(", ")}`)}`);
    }
  }
  console.log();

  console.log(chalk.bold("  MCP Servers (configured)"));
  const servers = config.mcpServers;
  let serverCount = 0;
  for (const [name, serverConfig] of Object.entries(servers)) {
    if (serverConfig) {
      serverCount++;
      console.log(`    ${chalk.green("●")} ${name}: ${chalk.gray(serverConfig.command + " " + serverConfig.args.join(" "))}`);
    }
  }
  if (serverCount === 0) {
    console.log(`    ${chalk.yellow("○")} No servers configured`);
  }
  console.log();

  console.log(chalk.bold("  Execution"));
  console.log(`    Max Parallel Tests: ${config.execution.maxParallelTests}`);
  console.log(`    Default Timeout:    ${config.execution.defaultTimeout}ms`);
  console.log(`    Retry Attempts:     ${config.execution.retryAttempts}`);
  console.log(`    Retry Delay:        ${config.execution.retryDelay}ms`);
  console.log();

  console.log(chalk.bold("  Reporting"));
  console.log(`    Output Dir:  ${config.reporting.outputDir}`);
  console.log(`    Formats:     ${config.reporting.formats.join(", ")}`);
  console.log(`    Screenshots: ${config.reporting.screenshotsOnFailure ? "on failure" : "disabled"}`);
  console.log(chalk.gray("─".repeat(50)));
  console.log();
}
