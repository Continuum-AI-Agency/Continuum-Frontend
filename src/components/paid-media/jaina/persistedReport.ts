import {
  type CheckpointReportV2,
  hasReportContent,
  type ReportPayload,
  reportPayloadSchema,
} from '@/lib/jaina/schemas';
import { interpretCheckpointReportPayload } from '@/lib/jaina/stream';
import {
  extractJsonObjectCandidates,
  parseLooseJsonCandidate,
  unwrapReportEnvelope,
} from '@/lib/jaina/unwrapping';

// The DB loader and the live-stream reducer MUST interpret a checkpoint-report
// payload identically — same strict-V2-then-heal tiering — so a report renders
// the same whether it just streamed in or was reloaded from history. Both
// delegate to `interpretCheckpointReportPayload` (single source of truth).
function parseReportPayload(value: unknown): ReportPayload | undefined {
  // Heal a checkpoint report first (normalize/coerce → merged shape), exactly as
  // the stream's extractReportPayloadFromUnknown does. normalize returns null for
  // non-report payloads, so direct-answer / specialist-insight payloads fall
  // through to their dedicated schema parse below — no divergence with the stream.
  const interpreted = interpretCheckpointReportPayload(value);
  if (interpreted?.report) return interpreted.report;
  const parsed = reportPayloadSchema.safeParse(value);
  if (parsed.success && hasReportContent(parsed.data)) return parsed.data;
  return undefined;
}

function parseReportV2Payload(value: unknown): CheckpointReportV2 | undefined {
  return interpretCheckpointReportPayload(value)?.reportV2 ?? undefined;
}

function parseReportFromUnknown(value: unknown, depth = 0): ReportPayload | undefined {
  if (depth > 6 || value == null) return undefined;

  if (typeof value === 'string') {
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

  if (!unwrapped || typeof unwrapped !== 'object') {
    return undefined;
  }
  const record = unwrapped as Record<string, unknown>;
  const prioritizedKeys = [
    'result_payload',
    'checkpoint_report',
    'report',
    'payload',
    'data',
    'content',
    'parts',
    'text',
    'detail',
    'message',
    'response',
  ];

  for (const key of prioritizedKeys) {
    if (!(key in record)) continue;
    const parsed = parseReportFromUnknown(record[key], depth + 1);
    if (parsed) return parsed;
  }

  return undefined;
}

function parseReportV2FromUnknown(value: unknown, depth = 0): CheckpointReportV2 | undefined {
  if (depth > 6 || value == null) return undefined;

  if (typeof value === 'string') {
    const embeddedCandidates = extractJsonObjectCandidates(value);
    for (const embedded of embeddedCandidates) {
      const parsed = parseReportV2FromUnknown(embedded, depth + 1);
      if (parsed) return parsed;
    }

    const looseParsed = parseLooseJsonCandidate(value.trim());
    if (looseParsed != null && looseParsed !== value) {
      const parsed = parseReportV2FromUnknown(looseParsed, depth + 1);
      if (parsed) return parsed;
    }
    return undefined;
  }

  const unwrapped = unwrapReportEnvelope(value);
  const direct = parseReportV2Payload(unwrapped);
  if (direct) return direct;

  if (Array.isArray(unwrapped)) {
    for (const item of unwrapped) {
      const parsed = parseReportV2FromUnknown(item, depth + 1);
      if (parsed) return parsed;
    }
    return undefined;
  }

  if (!unwrapped || typeof unwrapped !== 'object') {
    return undefined;
  }
  const record = unwrapped as Record<string, unknown>;
  const prioritizedKeys = [
    'result_payload',
    'checkpoint_report',
    'report',
    'payload',
    'data',
    'content',
    'parts',
    'text',
    'detail',
    'message',
    'response',
  ];

  for (const key of prioritizedKeys) {
    if (!(key in record)) continue;
    const parsed = parseReportV2FromUnknown(record[key], depth + 1);
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

export function parsePersistedReportV2Value(input: {
  report: unknown;
  content: string;
  reasoning?: unknown[];
}): CheckpointReportV2 | undefined {
  const direct = parseReportV2FromUnknown(input.report);
  if (direct) return direct;

  const embeddedReport = parseReportV2FromUnknown(input.content);
  if (embeddedReport) return embeddedReport;

  for (const entry of input.reasoning ?? []) {
    const parsed = parseReportV2FromUnknown(entry);
    if (parsed) return parsed;
  }

  return undefined;
}
