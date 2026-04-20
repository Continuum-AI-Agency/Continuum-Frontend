import {
  hasReportContent,
  reportPayloadSchema,
  type ReportPayload,
} from "@/lib/jaina/schemas";
import {
  extractJsonObjectCandidates,
  parseLooseJsonCandidate,
  unwrapReportEnvelope,
} from "@/lib/jaina/unwrapping";

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

    const looseParsed = parseLooseJsonCandidate(value.trim());
    if (looseParsed != null && looseParsed !== value) {
      const parsed = parseReportFromUnknown(looseParsed, depth + 1);
      if (parsed) return parsed;
    }
    return undefined;
  }

  const unwrapped = unwrapReportEnvelope(value);
  const direct = parseReportPayload(unwrapped);
  if (direct) return direct;

  if (Array.isArray(unwrapped)) {
    for (const item of unwrapped) {
      const parsed = parseReportFromUnknown(item, depth + 1);
      if (parsed) return parsed;
    }
    return undefined;
  }

  if (!unwrapped || typeof unwrapped !== "object") {
    return undefined;
  }
  const record = unwrapped as Record<string, unknown>;
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
