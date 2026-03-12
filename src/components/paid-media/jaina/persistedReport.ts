import {
  hasReportContent,
  reportPayloadSchema,
  type ReportPayload,
} from "@/lib/jaina/schemas";

function sanitizeJsonStringLiterals(input: string): string {
  let inString = false;
  let isEscaped = false;
  let output = "";

  for (const char of input) {
    if (!inString) {
      if (char === "\"") inString = true;
      output += char;
      continue;
    }

    if (isEscaped) {
      isEscaped = false;
      output += char;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      output += char;
      continue;
    }

    if (char === "\"") {
      inString = false;
      output += char;
      continue;
    }

    if (char === "\n") {
      output += "\\n";
      continue;
    }
    if (char === "\r") {
      output += "\\r";
      continue;
    }
    if (char === "\t") {
      output += "\\t";
      continue;
    }

    output += char;
  }

  return output;
}

function parseJsonCandidate(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(sanitizeJsonStringLiterals(candidate));
    } catch {
      return null;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function extractJsonObjectCandidate(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  const firstBraceIndex = trimmed.indexOf("{");
  const lastBraceIndex = trimmed.lastIndexOf("}");
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    const sliced = trimmed.slice(firstBraceIndex, lastBraceIndex + 1);
    if (sliced !== trimmed) candidates.push(sliced);
  }

  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function parseReportPayload(value: unknown): ReportPayload | undefined {
  const parsed = reportPayloadSchema.safeParse(value);
  if (!parsed.success) return undefined;
  return hasReportContent(parsed.data) ? parsed.data : undefined;
}

function parseReportFromUnknown(value: unknown, depth = 0): ReportPayload | undefined {
  if (depth > 6 || value == null) return undefined;

  if (typeof value === "string") {
    const embedded = extractJsonObjectCandidate(value);
    if (!embedded) return undefined;
    return parseReportFromUnknown(embedded, depth + 1);
  }

  const direct = parseReportPayload(value);
  if (direct) return direct;

  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseReportFromUnknown(item, depth + 1);
      if (parsed) return parsed;
    }
    return undefined;
  }

  const record = asRecord(value);
  if (!record) return undefined;

  if (record.type === "checkpoint_report") {
    const nested = parseReportFromUnknown(record.report, depth + 1);
    if (nested) return nested;
  }

  const prioritizedKeys = [
    "checkpoint_report",
    "report",
    "payload",
    "data",
    "content",
    "parts",
    "text",
    "detail",
    "message",
    "response",
  ];

  for (const key of prioritizedKeys) {
    if (!(key in record)) continue;
    const parsed = parseReportFromUnknown(record[key], depth + 1);
    if (parsed) return parsed;
  }

  return undefined;
}

export function parsePersistedReportValue(input: {
  report: unknown;
  content: string;
  reasoning?: unknown[];
}): ReportPayload | undefined {
  const direct = parseReportFromUnknown(input.report);
  if (direct) return direct;

  const embeddedReport = parseReportFromUnknown(input.content);
  if (embeddedReport) return embeddedReport;

  for (const entry of input.reasoning ?? []) {
    const parsed = parseReportFromUnknown(entry);
    if (parsed) return parsed;
  }

  return undefined;
}
