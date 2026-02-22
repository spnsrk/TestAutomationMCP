import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const visualTools = {
  "web/baselineCapture": {
    description: "Capture a baseline screenshot for visual comparison",
    inputSchema: z.object({
      name: z.string().describe("Unique name for this baseline"),
      selector: z.string().optional(),
      baselineDir: z.string().default("./baselines"),
    }),
    handler: async (
      page: Page,
      params: { name: string; selector?: string; baselineDir?: string }
    ): Promise<ToolResult> => {
      const dir = params.baselineDir ?? "./baselines";
      const filePath = join(dir, `${params.name}.png`);

      await mkdir(dirname(filePath), { recursive: true });

      if (params.selector) {
        await page.locator(params.selector).screenshot({ path: filePath });
      } else {
        await page.screenshot({ path: filePath, fullPage: true });
      }

      return {
        status: "success",
        tool: "web/baselineCapture",
        duration: 0,
        data: { name: params.name, path: filePath },
      };
    },
  },

  "web/compareScreenshot": {
    description: "Compare current page against a baseline screenshot",
    inputSchema: z.object({
      name: z.string().describe("Baseline name to compare against"),
      selector: z.string().optional(),
      threshold: z.number().default(0.1).describe("Pixel difference threshold (0-1)"),
      baselineDir: z.string().default("./baselines"),
      diffDir: z.string().default("./diffs"),
    }),
    handler: async (
      page: Page,
      params: {
        name: string;
        selector?: string;
        threshold?: number;
        baselineDir?: string;
        diffDir?: string;
      }
    ): Promise<ToolResult> => {
      const baselineDir = params.baselineDir ?? "./baselines";
      const baselinePath = join(baselineDir, `${params.name}.png`);

      if (!existsSync(baselinePath)) {
        return {
          status: "error",
          tool: "web/compareScreenshot",
          duration: 0,
          error: {
            code: "BASELINE_NOT_FOUND",
            message: `Baseline '${params.name}' not found at ${baselinePath}. Capture a baseline first.`,
          },
        };
      }

      let currentBuffer: Buffer;
      if (params.selector) {
        currentBuffer = await page.locator(params.selector).screenshot();
      } else {
        currentBuffer = await page.screenshot({ fullPage: true });
      }

      try {
        const { PNG } = await import("pngjs");
        const pixelmatch = (await import("pixelmatch")).default;

        const baseline = PNG.sync.read(await readFile(baselinePath));
        const current = PNG.sync.read(currentBuffer);

        if (baseline.width !== current.width || baseline.height !== current.height) {
          return {
            status: "failure",
            tool: "web/compareScreenshot",
            duration: 0,
            data: {
              name: params.name,
              passed: false,
              reason: "dimension_mismatch",
              baseline: { width: baseline.width, height: baseline.height },
              current: { width: current.width, height: current.height },
            },
          };
        }

        const diff = new PNG({ width: baseline.width, height: baseline.height });
        const mismatchedPixels = pixelmatch(
          baseline.data,
          current.data,
          diff.data,
          baseline.width,
          baseline.height,
          { threshold: params.threshold ?? 0.1 }
        );

        const totalPixels = baseline.width * baseline.height;
        const diffPercent = (mismatchedPixels / totalPixels) * 100;
        const passed = mismatchedPixels === 0;

        if (!passed) {
          const diffDirPath = params.diffDir ?? "./diffs";
          await mkdir(diffDirPath, { recursive: true });
          const diffPath = join(diffDirPath, `${params.name}-diff.png`);
          await writeFile(diffPath, PNG.sync.write(diff));
        }

        return {
          status: passed ? "success" : "failure",
          tool: "web/compareScreenshot",
          duration: 0,
          data: {
            name: params.name,
            passed,
            mismatchedPixels,
            totalPixels,
            diffPercent: Math.round(diffPercent * 100) / 100,
          },
        };
      } catch (err) {
        return {
          status: "error",
          tool: "web/compareScreenshot",
          duration: 0,
          error: {
            code: "COMPARISON_ERROR",
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    },
  },
};
