import pino from "pino";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export function createLogger(name: string, level: LogLevel = "info"): pino.Logger {
  return pino({
    name,
    level,
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino/file", options: { destination: 1 } }
        : undefined,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export function createChildLogger(
  parent: pino.Logger,
  bindings: Record<string, unknown>
): pino.Logger {
  return parent.child(bindings);
}
