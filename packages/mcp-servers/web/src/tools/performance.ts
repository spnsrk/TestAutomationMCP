import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";

interface PerformanceMetrics {
  loadTime: number | null;
  domContentLoaded: number | null;
  firstPaint: number | null;
  firstContentfulPaint: number | null;
  largestContentfulPaint: number | null;
  firstInputDelay: number | null;
  cumulativeLayoutShift: number;
  transferSize: number;
  resourceCount: number;
  timeToInteractive?: number | null;
}

const getPerformanceMetrics = `
  (function() {
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return null;

    const navTiming = nav;
    const paintEntries = performance.getEntriesByType('paint');
    const firstPaint = paintEntries.find(e => e.name === 'first-paint');
    const firstContentfulPaint = paintEntries.find(e => e.name === 'first-contentful-paint');

    let largestContentfulPaint = null;
    let firstInputDelay = null;
    let cumulativeLayoutShift = 0;

    try {
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      if (lcpEntries.length > 0) {
        largestContentfulPaint = lcpEntries[lcpEntries.length - 1].startTime;
      }
    } catch (_) {}

    try {
      const fidEntries = performance.getEntriesByType('first-input');
      if (fidEntries.length > 0) {
        firstInputDelay = fidEntries[0].processingStart - fidEntries[0].startTime;
      }
    } catch (_) {}

    try {
      const lsEntries = performance.getEntriesByType('layout-shift');
      for (const e of lsEntries) {
        if (!e.hadRecentInput) cumulativeLayoutShift += e.value;
      }
    } catch (_) {}

    return {
      loadTime: navTiming.loadEventEnd > 0 ? navTiming.loadEventEnd - navTiming.startTime : null,
      domContentLoaded: navTiming.domContentLoadedEventEnd > 0 ? navTiming.domContentLoadedEventEnd - navTiming.startTime : null,
      firstPaint: firstPaint ? firstPaint.startTime : null,
      firstContentfulPaint: firstContentfulPaint ? firstContentfulPaint.startTime : null,
      largestContentfulPaint,
      firstInputDelay,
      cumulativeLayoutShift,
      transferSize: navTiming.transferSize || 0,
      resourceCount: performance.getEntriesByType('resource').length
    };
  })();
`;

export const performanceTools = {
  "web/perf.startTrace": {
    description: "Start a Playwright trace recording with screenshots and snapshots",
    inputSchema: z.object({
      name: z.string().describe("Trace name for identification"),
    }),
    handler: async (
      page: Page,
      params: { name: string }
    ): Promise<ToolResult> => {
      const context = page.context();
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        title: params.name,
      });
      return {
        status: "success",
        tool: "web/perf.startTrace",
        duration: 0,
        data: { name: params.name },
      };
    },
  },

  "web.perf.stopTrace": {
    description: "Stop trace recording and save to file",
    inputSchema: z.object({
      outputPath: z.string().describe("Path to save the trace file (e.g. trace.zip)"),
    }),
    handler: async (
      page: Page,
      params: { outputPath: string }
    ): Promise<ToolResult> => {
      const context = page.context();
      await context.tracing.stop({ path: params.outputPath });
      return {
        status: "success",
        tool: "web.perf.stopTrace",
        duration: 0,
        data: { traceFilePath: params.outputPath },
      };
    },
  },

  "web.perf.getMetrics": {
    description: "Get Core Web Vitals and performance metrics from the page",
    inputSchema: z.object({}),
    handler: async (page: Page): Promise<ToolResult> => {
      const raw = await page.evaluate(getPerformanceMetrics) as PerformanceMetrics | null;
      if (!raw) {
        return {
          status: "error",
          tool: "web.perf.getMetrics",
          duration: 0,
          error: { code: "NO_NAVIGATION", message: "No navigation timing data available" },
        };
      }
      const timeToInteractive = raw.domContentLoaded ?? raw.loadTime ?? null;
      const metrics = {
        loadTime: raw.loadTime,
        domContentLoaded: raw.domContentLoaded,
        firstPaint: raw.firstPaint,
        firstContentfulPaint: raw.firstContentfulPaint,
        largestContentfulPaint: raw.largestContentfulPaint,
        timeToInteractive,
        firstInputDelay: raw.firstInputDelay,
        cumulativeLayoutShift: raw.cumulativeLayoutShift,
        transferSize: raw.transferSize,
        resourceCount: raw.resourceCount,
      };
      return {
        status: "success",
        tool: "web.perf.getMetrics",
        duration: 0,
        data: metrics,
      };
    },
  },

  "web/perf.measureAction": {
    description: "Measure the duration of a specific action (click, fill, or navigate)",
    inputSchema: z.object({
      actionName: z.string().describe("Descriptive name for the action"),
      selector: z.string().describe("CSS selector (or URL for navigate action)"),
      action: z.enum(["click", "fill", "navigate"]).describe("Type of action to measure"),
      value: z.string().optional().describe("Value for fill action"),
    }),
    handler: async (
      page: Page,
      params: { actionName: string; selector: string; action: "click" | "fill" | "navigate"; value?: string }
    ): Promise<ToolResult> => {
      const start = performance.now();
      try {
        switch (params.action) {
          case "click":
            await page.click(params.selector);
            break;
          case "fill":
            await page.fill(params.selector, params.value ?? "");
            break;
          case "navigate":
            await page.goto(params.selector, { waitUntil: "load" });
            break;
        }
        const duration = Math.round(performance.now() - start);
        return {
          status: "success",
          tool: "web/perf.measureAction",
          duration,
          data: {
            actionName: params.actionName,
            action: params.action,
            selector: params.selector,
            durationMs: duration,
          },
        };
      } catch (err) {
        const duration = Math.round(performance.now() - start);
        return {
          status: "error",
          tool: "web/perf.measureAction",
          duration,
          error: {
            code: "ACTION_FAILED",
            message: err instanceof Error ? err.message : String(err),
          },
          data: { actionName: params.actionName, action: params.action, durationMs: duration },
        };
      }
    },
  },

  "web/perf.assertPerformance": {
    description: "Assert that a performance metric is within a threshold",
    inputSchema: z.object({
      metric: z.string().describe("Metric name (e.g. loadTime, firstContentfulPaint, largestContentfulPaint)"),
      maxValue: z.number().describe("Maximum allowed value"),
      unit: z.enum(["ms", "s", "bytes", "kb"]).describe("Unit of the metric"),
    }),
    handler: async (
      page: Page,
      params: { metric: string; maxValue: number; unit: "ms" | "s" | "bytes" | "kb" }
    ): Promise<ToolResult> => {
      const metricsResult = await page.evaluate(getPerformanceMetrics) as PerformanceMetrics | null;
      if (!metricsResult) {
        return {
          status: "error",
          tool: "web/perf.assertPerformance",
          duration: 0,
          error: { code: "NO_METRICS", message: "Could not retrieve performance metrics" },
        };
      }
      const rawValue = (metricsResult as unknown as Record<string, unknown>)[params.metric];
      if (rawValue === null || rawValue === undefined) {
        return {
          status: "failure",
          tool: "web/perf.assertPerformance",
          duration: 0,
          data: { metric: params.metric, actual: null, maxValue: params.maxValue, passed: false },
          error: { code: "METRIC_UNAVAILABLE", message: `Metric '${params.metric}' is not available` },
        };
      }
      const actualValue = Number(rawValue);
      let maxInSameUnit = params.maxValue;
      if (params.unit === "s") {
        maxInSameUnit = params.maxValue * 1000;
      } else if (params.unit === "kb") {
        maxInSameUnit = params.maxValue * 1024;
      }
      const passed = actualValue <= maxInSameUnit;
      return {
        status: passed ? "success" : "failure",
        tool: "web/perf.assertPerformance",
        duration: 0,
        data: {
          metric: params.metric,
          actualValue,
          maxValue: params.maxValue,
          unit: params.unit,
          passed,
        },
        error: passed
          ? undefined
          : {
              code: "THRESHOLD_EXCEEDED",
              message: `${params.metric}: ${actualValue} exceeds max ${params.maxValue} ${params.unit}`,
            },
      };
    },
  },
};
