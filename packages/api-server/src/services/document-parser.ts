import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("document-parser");

export interface ParsedDocument {
  text: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    format: string;
  };
}

export async function parseDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParsedDocument> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  logger.info({ filename, ext, mimeType, size: buffer.length }, "Parsing document");

  switch (ext) {
    case "pdf":
      return parsePdf(buffer);
    case "docx":
      return parseDocx(buffer);
    case "xlsx":
    case "xls":
      return parseExcel(buffer);
    case "txt":
    case "md":
    case "csv":
      return parsePlainText(buffer, ext);
    default:
      return parsePlainText(buffer, ext);
  }
}

async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return {
      text: data.text,
      metadata: {
        pageCount: data.numpages,
        wordCount: data.text.split(/\s+/).filter(Boolean).length,
        format: "pdf",
      },
    };
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, "PDF parse failed");
    throw new Error(`Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      metadata: {
        wordCount: result.value.split(/\s+/).filter(Boolean).length,
        format: "docx",
      },
    };
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, "DOCX parse failed");
    throw new Error(`Failed to parse DOCX: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function parseExcel(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const lines: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      lines.push(`--- Sheet: ${sheetName} ---`);
      const csv = XLSX.utils.sheet_to_csv(sheet);
      lines.push(csv);
    }

    const text = lines.join("\n");
    return {
      text,
      metadata: {
        pageCount: workbook.SheetNames.length,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        format: "xlsx",
      },
    };
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, "Excel parse failed");
    throw new Error(`Failed to parse Excel: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function parsePlainText(buffer: Buffer, ext: string): ParsedDocument {
  const text = buffer.toString("utf-8");
  return {
    text,
    metadata: {
      wordCount: text.split(/\s+/).filter(Boolean).length,
      format: ext || "text",
    },
  };
}
