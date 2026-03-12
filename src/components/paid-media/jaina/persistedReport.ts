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

function collectBalancedJsonObjectCandidates(value: string): string[] {
  const candidates: string[] = [];
  let depth = 0;
  let segmentStart = -1;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === "\\") {
        isEscaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        segmentStart = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && segmentStart >= 0) {
        candidates.push(value.slice(segmentStart, index + 1));
        segmentStart = -1;
      }
    }
  }

  return candidates;
}

function extractJsonObjectCandidates(value: string): unknown[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const rawCandidates = [trimmed];
  const firstBraceIndex = trimmed.indexOf("{");
  const lastBraceIndex = trimmed.lastIndexOf("}");
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    const sliced = trimmed.slice(firstBraceIndex, lastBraceIndex + 1);
    if (sliced !== trimmed) rawCandidates.push(sliced);
  }
  rawCandidates.push(...collectBalancedJsonObjectCandidates(trimmed));

  const parsedCandidates: unknown[] = [];
  for (const candidate of rawCandidates) {
    const parsed = parseJsonCandidate(candidate);
    if (parsed != null) parsedCandidates.push(parsed);
  }
  return parsedCandidates;
}

function parseReportPayload(value: unknown): ReportPayload | undefined {
  const parsed = reportPayloadSchema.safeParse(value);
  if (!parsed.success) return undefined;
  return hasReportContent(parsed.data) ? parsed.data : undefined;
}

function parseReportFromUnknown(value: unknown, depth = 0): ReportPayload | undefined {
  if (depth > 6 || value == null) return undefined;

  if (typeof value === "string") {
    const embeddedCandidates = extractJsonObjectCandidates(value);
    for (const embedded of embeddedCandidates) {
      const parsed = parseReportFromUnknown(embedded, depth + 1);
      if (parsed) return parsed;
    }
    return undefined;
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
