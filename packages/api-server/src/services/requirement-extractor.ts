import { createLogger } from "@test-automation-mcp/core";
import type { LLMRouter } from "@test-automation-mcp/llm";

const logger = createLogger("requirement-extractor");

export interface StructuredRequirement {
  id: string;
  title: string;
  description: string;
  type: "functional" | "non-functional" | "ui" | "api" | "data" | "integration" | "security" | "performance";
  priority: "critical" | "high" | "medium" | "low";
  targetSystem: "web" | "salesforce" | "sap" | "api" | "data";
  acceptanceCriteria: string[];
}

export interface ExtractionResult {
  requirements: StructuredRequirement[];
  summary: string;
  confidence: number;
}

const SYSTEM_PROMPT = `You are a test requirements analyst. Your job is to read documents (functional design documents, solution documents, user stories, test scripts, etc.) and extract structured test requirements.

For each requirement you identify, produce a JSON object with:
- id: a unique identifier like REQ-001, REQ-002, etc.
- title: short descriptive title
- description: what needs to be tested
- type: one of "functional", "non-functional", "ui", "api", "data", "integration", "security", "performance"
- priority: one of "critical", "high", "medium", "low"
- targetSystem: one of "web", "salesforce", "sap", "api", "data" (pick the most appropriate)
- acceptanceCriteria: array of specific testable conditions

Also provide:
- summary: a brief summary of the document
- confidence: 0-1 how confident you are in the extraction

Return ONLY valid JSON with this exact structure:
{
  "requirements": [...],
  "summary": "...",
  "confidence": 0.85
}`;

export class RequirementExtractor {
  constructor(private llm: LLMRouter) {}

  async extract(documentText: string): Promise<ExtractionResult> {
    logger.info({ textLength: documentText.length }, "Extracting requirements from document");

    const truncatedText =
      documentText.length > 50000
        ? documentText.slice(0, 50000) + "\n\n[Document truncated at 50,000 characters]"
        : documentText;

    try {
      const result = await this.llm.complete(
        [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Extract test requirements from the following document:\n\n${truncatedText}`,
          },
        ],
        { jsonMode: true, temperature: 0.2 }
      );

      const parsed = JSON.parse(result.content) as ExtractionResult;

      if (!parsed.requirements || !Array.isArray(parsed.requirements)) {
        throw new Error("LLM response missing requirements array");
      }

      parsed.requirements = parsed.requirements.map((req, i) => ({
        id: req.id || `REQ-${String(i + 1).padStart(3, "0")}`,
        title: req.title || "Untitled requirement",
        description: req.description || "",
        type: req.type || "functional",
        priority: req.priority || "medium",
        targetSystem: req.targetSystem || "web",
        acceptanceCriteria: req.acceptanceCriteria || [],
      }));

      logger.info(
        { count: parsed.requirements.length, confidence: parsed.confidence },
        "Requirements extracted"
      );

      return parsed;
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Requirement extraction failed"
      );

      return this.fallbackExtraction(documentText);
    }
  }

  private fallbackExtraction(text: string): ExtractionResult {
    const lines = text.split("\n").filter((l) => l.trim().length > 10);
    const requirements: StructuredRequirement[] = [];
    let counter = 1;

    for (const line of lines.slice(0, 20)) {
      const trimmed = line.trim();
      if (
        trimmed.match(/^(shall|must|should|when|given|then|as a|verify|ensure|test|check)/i) ||
        trimmed.match(/^[-*]\s+/i) ||
        trimmed.match(/^\d+\.\s+/)
      ) {
        requirements.push({
          id: `REQ-${String(counter).padStart(3, "0")}`,
          title: trimmed.slice(0, 80),
          description: trimmed,
          type: "functional",
          priority: "medium",
          targetSystem: "web",
          acceptanceCriteria: [trimmed],
        });
        counter++;
      }
    }

    if (requirements.length === 0) {
      requirements.push({
        id: "REQ-001",
        title: "General system validation",
        description: text.slice(0, 200),
        type: "functional",
        priority: "medium",
        targetSystem: "web",
        acceptanceCriteria: ["System behaves as described in the document"],
      });
    }

    return {
      requirements,
      summary: "Extracted via fallback parser (LLM unavailable). Review recommended.",
      confidence: 0.3,
    };
  }
}
