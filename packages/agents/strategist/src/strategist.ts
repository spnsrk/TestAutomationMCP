import type {
  TestPlanRequest,
  TestPlanResponse,
  PlannedTestCase,
  CoverageTarget,
} from "@test-automation-mcp/core";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("strategist-agent");

interface ScopeAnalysis {
  detectedTypes: string[];
  detectedSystems: string[];
  keywords: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
}

interface FileImpact {
  system: string;
  testType: string;
  riskMultiplier: number;
}

const FILE_PATTERN_MAP: Record<string, FileImpact> = {
  ".apex": { system: "salesforce", testType: "integration", riskMultiplier: 1.3 },
  ".cls": { system: "salesforce", testType: "integration", riskMultiplier: 1.3 },
  ".trigger": { system: "salesforce", testType: "regression", riskMultiplier: 1.5 },
  ".page": { system: "salesforce", testType: "ui", riskMultiplier: 1.1 },
  ".component": { system: "salesforce", testType: "ui", riskMultiplier: 1.1 },
  ".xml": { system: "sap", testType: "integration", riskMultiplier: 1.2 },
  ".abap": { system: "sap", testType: "integration", riskMultiplier: 1.4 },
  ".ts": { system: "web", testType: "ui", riskMultiplier: 1.0 },
  ".tsx": { system: "web", testType: "ui", riskMultiplier: 1.0 },
  ".js": { system: "web", testType: "ui", riskMultiplier: 1.0 },
  ".jsx": { system: "web", testType: "ui", riskMultiplier: 1.0 },
  ".css": { system: "web", testType: "ui", riskMultiplier: 0.5 },
  ".scss": { system: "web", testType: "ui", riskMultiplier: 0.5 },
  ".html": { system: "web", testType: "ui", riskMultiplier: 0.7 },
  ".json": { system: "data", testType: "data-validation", riskMultiplier: 0.8 },
  ".sql": { system: "data", testType: "data-validation", riskMultiplier: 1.3 },
  ".py": { system: "api", testType: "api", riskMultiplier: 1.0 },
  ".java": { system: "api", testType: "api", riskMultiplier: 1.0 },
  ".go": { system: "api", testType: "api", riskMultiplier: 1.0 },
};

const SCOPE_KEYWORD_MAP: Record<string, { type: string; systems: string[] }> = {
  login: { type: "e2e", systems: ["web"] },
  authentication: { type: "e2e", systems: ["web", "api"] },
  authorization: { type: "e2e", systems: ["web", "api"] },
  signup: { type: "e2e", systems: ["web"] },
  registration: { type: "e2e", systems: ["web", "api"] },
  checkout: { type: "e2e", systems: ["web"] },
  payment: { type: "e2e", systems: ["web", "api"] },
  cart: { type: "e2e", systems: ["web"] },
  search: { type: "ui", systems: ["web"] },
  filter: { type: "ui", systems: ["web"] },
  navigation: { type: "ui", systems: ["web"] },
  dashboard: { type: "ui", systems: ["web"] },
  report: { type: "ui", systems: ["web", "salesforce"] },
  crud: { type: "api", systems: ["api", "data"] },
  rest: { type: "api", systems: ["api"] },
  graphql: { type: "api", systems: ["api"] },
  endpoint: { type: "api", systems: ["api"] },
  webhook: { type: "api", systems: ["api"] },
  soql: { type: "integration", systems: ["salesforce"] },
  apex: { type: "integration", systems: ["salesforce"] },
  salesforce: { type: "integration", systems: ["salesforce"] },
  opportunity: { type: "integration", systems: ["salesforce"] },
  lead: { type: "integration", systems: ["salesforce"] },
  account: { type: "integration", systems: ["salesforce"] },
  sap: { type: "integration", systems: ["sap"] },
  bapi: { type: "integration", systems: ["sap"] },
  rfc: { type: "integration", systems: ["sap"] },
  idoc: { type: "integration", systems: ["sap"] },
  transaction: { type: "integration", systems: ["sap"] },
  fiori: { type: "ui", systems: ["sap"] },
  database: { type: "data-validation", systems: ["data"] },
  migration: { type: "data-validation", systems: ["data"] },
  etl: { type: "data-validation", systems: ["data"] },
  sync: { type: "integration", systems: ["data", "salesforce"] },
  integration: { type: "integration", systems: ["api"] },
  performance: { type: "performance", systems: ["web", "api"] },
  load: { type: "performance", systems: ["api"] },
  stress: { type: "performance", systems: ["api"] },
  regression: { type: "regression", systems: ["web"] },
  smoke: { type: "smoke", systems: ["web", "api"] },
};

const PRIORITY_KEYWORDS: Record<string, string> = {
  critical: "critical",
  urgent: "critical",
  blocker: "critical",
  important: "high",
  high: "high",
  security: "critical",
  auth: "critical",
  payment: "critical",
  checkout: "critical",
  data_loss: "critical",
  corruption: "critical",
};

const DURATION_ESTIMATES: Record<string, number> = {
  e2e: 120000,
  integration: 90000,
  api: 30000,
  ui: 60000,
  "data-validation": 45000,
  performance: 180000,
  regression: 90000,
  smoke: 30000,
};

export class StrategistAgent {
  async analyze(request: TestPlanRequest): Promise<TestPlanResponse> {
    logger.info({ scope: request.scope, targetSystems: request.targetSystems }, "Analyzing test plan request");

    const scopeAnalysis = this.analyzeScope(request.scope, request.requirements);
    const fileImpacts = request.changedFiles
      ? this.analyzeFileImpacts(request.changedFiles)
      : [];

    const testCases = this.buildTestCases(request, scopeAnalysis, fileImpacts);
    const prioritized = this.prioritize(testCases);
    const coverageTargets = this.detectCoverageGaps(prioritized, request.targetSystems);
    const estimatedDuration = prioritized.reduce((sum, tc) => sum + tc.estimatedDuration, 0);

    logger.info(
      { testCount: prioritized.length, estimatedDuration, coverageGaps: coverageTargets.length },
      "Test plan analysis complete",
    );

    return {
      plan: {
        testCases: prioritized,
        priority: prioritized.map((tc) => tc.id),
        estimatedDuration,
        coverageTargets,
      },
    };
  }

  prioritize(tests: PlannedTestCase[]): PlannedTestCase[] {
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    const typeOrder: Record<string, number> = {
      smoke: 0,
      e2e: 1,
      integration: 2,
      api: 3,
      ui: 4,
      "data-validation": 5,
      regression: 6,
      performance: 7,
    };

    return [...tests].sort((a, b) => {
      const priorityDiff =
        (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      if (priorityDiff !== 0) return priorityDiff;

      const typeDiff =
        (typeOrder[a.type] ?? 5) - (typeOrder[b.type] ?? 5);
      if (typeDiff !== 0) return typeDiff;

      return a.estimatedDuration - b.estimatedDuration;
    });
  }

  detectCoverageGaps(
    tests: PlannedTestCase[],
    targetSystems: string[],
  ): CoverageTarget[] {
    const gaps: CoverageTarget[] = [];

    const systemCoverage = new Map<string, Set<string>>();
    for (const system of targetSystems) {
      systemCoverage.set(system, new Set());
    }

    for (const test of tests) {
      for (const system of test.targetSystems) {
        const areas = systemCoverage.get(system);
        if (areas) {
          areas.add(test.type);
        }
      }
    }

    const expectedAreas: Record<string, string[]> = {
      web: ["e2e", "ui", "smoke", "regression"],
      salesforce: ["integration", "api", "data-validation", "e2e"],
      sap: ["integration", "e2e", "data-validation"],
      api: ["api", "integration", "smoke", "performance"],
      data: ["data-validation", "integration"],
    };

    for (const system of targetSystems) {
      const covered = systemCoverage.get(system) ?? new Set();
      const expected = expectedAreas[system] ?? ["integration"];

      for (const area of expected) {
        if (!covered.has(area)) {
          gaps.push({
            system,
            area,
            currentCoverage: 0,
            targetCoverage: 80,
          });
        }
      }

      if (covered.size > 0 && expected.length > 0) {
        const coverageRatio = covered.size / expected.length;
        if (coverageRatio < 0.75) {
          const missingAreas = expected.filter((a) => !covered.has(a));
          for (const area of missingAreas) {
            if (!gaps.some((g) => g.system === system && g.area === area)) {
              gaps.push({
                system,
                area,
                currentCoverage: Math.round(coverageRatio * 100),
                targetCoverage: 80,
              });
            }
          }
        }
      }
    }

    return gaps;
  }

  private analyzeScope(
    scope: string,
    requirements?: string[],
  ): ScopeAnalysis {
    const normalizedScope = scope.toLowerCase();
    const allText = requirements
      ? `${normalizedScope} ${requirements.join(" ").toLowerCase()}`
      : normalizedScope;

    const detectedTypes = new Set<string>();
    const detectedSystems = new Set<string>();
    const keywords: string[] = [];
    let riskScore = 0;

    for (const [keyword, mapping] of Object.entries(SCOPE_KEYWORD_MAP)) {
      if (allText.includes(keyword)) {
        keywords.push(keyword);
        detectedTypes.add(mapping.type);
        for (const sys of mapping.systems) {
          detectedSystems.add(sys);
        }
      }
    }

    for (const [keyword, priority] of Object.entries(PRIORITY_KEYWORDS)) {
      if (allText.includes(keyword)) {
        if (priority === "critical") riskScore += 3;
        else if (priority === "high") riskScore += 2;
      }
    }

    if (allText.includes("cross-system") || allText.includes("cross system")) {
      riskScore += 2;
    }
    if (allText.includes("data migration") || allText.includes("etl")) {
      riskScore += 2;
    }
    if (allText.includes("production") || allText.includes("prod")) {
      riskScore += 1;
    }

    if (detectedTypes.size === 0) {
      detectedTypes.add("e2e");
    }
    if (detectedSystems.size === 0) {
      detectedSystems.add("web");
    }

    let riskLevel: ScopeAnalysis["riskLevel"];
    if (riskScore >= 5) riskLevel = "critical";
    else if (riskScore >= 3) riskLevel = "high";
    else if (riskScore >= 1) riskLevel = "medium";
    else riskLevel = "low";

    return {
      detectedTypes: [...detectedTypes],
      detectedSystems: [...detectedSystems],
      keywords,
      riskLevel,
    };
  }

  private analyzeFileImpacts(changedFiles: string[]): FileImpact[] {
    const impacts: FileImpact[] = [];

    for (const file of changedFiles) {
      const ext = this.extractExtension(file);
      const mapped = FILE_PATTERN_MAP[ext];
      if (mapped) {
        impacts.push({ ...mapped });
      }

      if (file.includes("config") || file.includes("Config")) {
        impacts.push({ system: "web", testType: "regression", riskMultiplier: 1.5 });
      }
      if (file.includes("test") || file.includes("spec")) {
        impacts.push({ system: "web", testType: "regression", riskMultiplier: 0.5 });
      }
      if (file.includes("migration")) {
        impacts.push({ system: "data", testType: "data-validation", riskMultiplier: 1.8 });
      }
      if (
        file.includes("custom") && (ext === ".xml" || ext === ".json") &&
        (file.includes("sap") || file.includes("SAP"))
      ) {
        impacts.push({ system: "sap", testType: "integration", riskMultiplier: 1.6 });
      }
    }

    return impacts;
  }

  private extractExtension(filePath: string): string {
    const dotIndex = filePath.lastIndexOf(".");
    if (dotIndex === -1) return "";
    return filePath.slice(dotIndex);
  }

  private buildTestCases(
    request: TestPlanRequest,
    scopeAnalysis: ScopeAnalysis,
    fileImpacts: FileImpact[],
  ): PlannedTestCase[] {
    const testCases: PlannedTestCase[] = [];
    let counter = 1;

    const systemsToTest = new Set([
      ...request.targetSystems,
      ...scopeAnalysis.detectedSystems,
      ...fileImpacts.map((fi) => fi.system),
    ]);

    const typesToGenerate = new Set([
      ...scopeAnalysis.detectedTypes,
      ...fileImpacts.map((fi) => fi.testType),
    ]);

    for (const system of systemsToTest) {
      for (const type of typesToGenerate) {
        if (!this.isValidSystemTypeCombo(system, type)) continue;

        const priority = this.determinePriority(
          type,
          system,
          scopeAnalysis.riskLevel,
          fileImpacts,
        );

        const baseDuration = DURATION_ESTIMATES[type] ?? 60000;
        const riskMultiplier = this.getMaxRiskMultiplier(fileImpacts, system);
        const estimatedDuration = Math.round(baseDuration * riskMultiplier);

        const testCase: PlannedTestCase = {
          id: `TC-${String(counter).padStart(3, "0")}`,
          name: this.generateTestName(system, type, request.scope),
          description: this.generateTestDescription(
            system,
            type,
            request.scope,
            scopeAnalysis.keywords,
          ),
          type,
          priority,
          targetSystems: [system],
          estimatedDuration,
        };

        testCases.push(testCase);
        counter++;
      }
    }

    if (systemsToTest.size > 1 && scopeAnalysis.keywords.some((k) =>
      ["integration", "sync", "cross-system", "etl", "migration"].includes(k),
    )) {
      const systems = [...systemsToTest];
      for (let i = 0; i < systems.length - 1; i++) {
        for (let j = i + 1; j < systems.length; j++) {
          testCases.push({
            id: `TC-${String(counter).padStart(3, "0")}`,
            name: `Cross-system integration: ${systems[i]} ↔ ${systems[j]}`,
            description: `Validate data flow and integration between ${systems[i]} and ${systems[j]} for: ${request.scope}`,
            type: "integration",
            priority: "high",
            targetSystems: [systems[i], systems[j]],
            estimatedDuration: 150000,
          });
          counter++;
        }
      }
    }

    if (request.changedFiles && request.changedFiles.length > 0) {
      testCases.push({
        id: `TC-${String(counter).padStart(3, "0")}`,
        name: "Regression sweep for changed files",
        description: `Regression tests covering changes in ${request.changedFiles.length} modified file(s)`,
        type: "regression",
        priority: scopeAnalysis.riskLevel === "critical" ? "critical" : "high",
        targetSystems: [...systemsToTest],
        estimatedDuration: 90000,
      });
      counter++;
    }

    return testCases;
  }

  private isValidSystemTypeCombo(system: string, type: string): boolean {
    const valid: Record<string, Set<string>> = {
      web: new Set(["e2e", "ui", "smoke", "regression", "performance"]),
      salesforce: new Set(["integration", "api", "data-validation", "e2e", "regression", "smoke"]),
      sap: new Set(["integration", "e2e", "data-validation", "regression", "smoke"]),
      api: new Set(["api", "integration", "smoke", "performance", "regression"]),
      data: new Set(["data-validation", "integration", "regression"]),
    };

    const allowed = valid[system];
    return allowed ? allowed.has(type) : true;
  }

  private determinePriority(
    type: string,
    system: string,
    riskLevel: ScopeAnalysis["riskLevel"],
    fileImpacts: FileImpact[],
  ): string {
    if (riskLevel === "critical") return "critical";

    const systemImpacts = fileImpacts.filter((fi) => fi.system === system);
    const maxRisk = Math.max(0, ...systemImpacts.map((fi) => fi.riskMultiplier));

    if (maxRisk >= 1.5) return "critical";
    if (maxRisk >= 1.3) return "high";

    if (type === "smoke") return "critical";
    if (type === "e2e" && riskLevel === "high") return "high";
    if (type === "performance") return "low";

    const priorityMap: Record<string, string> = {
      e2e: "high",
      integration: "high",
      api: "medium",
      ui: "medium",
      "data-validation": "medium",
      regression: "medium",
      smoke: "critical",
      performance: "low",
    };

    return priorityMap[type] ?? "medium";
  }

  private getMaxRiskMultiplier(
    fileImpacts: FileImpact[],
    system: string,
  ): number {
    const relevant = fileImpacts.filter((fi) => fi.system === system);
    if (relevant.length === 0) return 1.0;
    return Math.max(...relevant.map((fi) => fi.riskMultiplier));
  }

  private generateTestName(
    system: string,
    type: string,
    scope: string,
  ): string {
    const scopeWords = scope.split(/\s+/).slice(0, 4).join(" ");
    const systemLabel = system.charAt(0).toUpperCase() + system.slice(1);
    const typeLabel = type.toUpperCase().replace("-", " ");
    return `[${systemLabel}] ${typeLabel} — ${scopeWords}`;
  }

  private generateTestDescription(
    system: string,
    type: string,
    scope: string,
    keywords: string[],
  ): string {
    const keywordStr = keywords.length > 0
      ? ` (keywords: ${keywords.join(", ")})`
      : "";
    return `${type} test for ${system} system covering: ${scope}${keywordStr}`;
  }
}
