import type { JainaPlan } from "@/components/paid-media/jaina/types";

export function sanitizeJsonStringLiterals(input: string): string {
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

export function parseLooseJsonCandidate(candidate: string): unknown | null {
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

function skipWhitespace(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function findJsonValueStartByKey(text: string, key: string): number | null {
  let searchFrom = 0;
  let latestValueStart: number | null = null;
  while (searchFrom < text.length) {
    const keyIndex = text.indexOf(`"${key}"`, searchFrom);
    if (keyIndex === -1) break;
    let cursor = skipWhitespace(text, keyIndex + key.length + 2);
    if (text[cursor] !== ":") {
      searchFrom = keyIndex + 1;
      continue;
    }
    cursor = skipWhitespace(text, cursor + 1);
    latestValueStart = cursor;
    searchFrom = keyIndex + 1;
  }
  return latestValueStart;
}

function extractBalancedJsonSegment(
  text: string,
  startIndex: number,
  openChar: "{" | "["
): string | null {
  const closeChar = openChar === "{" ? "}" : "]";
  if (text[startIndex] !== openChar) return null;

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let cursor = startIndex; cursor < text.length; cursor += 1) {
    const char = text[cursor];

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
    if (char === openChar) {
      depth += 1;
      continue;
    }
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, cursor + 1);
      }
    }
  }

  return null;
}

export function extractStringFieldByKeys(
  text: string,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const valueStart = findJsonValueStartByKey(text, key);
    if (valueStart === null || text[valueStart] !== "\"") continue;

    let cursor = valueStart + 1;
    let isEscaped = false;
    while (cursor < text.length) {
      const char = text[cursor];
      if (isEscaped) {
        isEscaped = false;
        cursor += 1;
        continue;
      }
      if (char === "\\") {
        isEscaped = true;
        cursor += 1;
        continue;
      }
      if (char === "\"") {
        const encoded = text.slice(valueStart, cursor + 1);
        const parsed = parseLooseJsonCandidate(encoded);
        if (typeof parsed === "string") return parsed;
        return undefined;
      }
      cursor += 1;
    }
  }
  return undefined;
}

export function extractArrayFieldByKeys(
  text: string,
  keys: string[]
): unknown[] | undefined {
  for (const key of keys) {
    const valueStart = findJsonValueStartByKey(text, key);
    if (valueStart === null || text[valueStart] !== "[") continue;
    const segment = extractBalancedJsonSegment(text, valueStart, "[");
    if (!segment) continue;
    const parsed = parseLooseJsonCandidate(segment);
    if (Array.isArray(parsed)) return parsed;
  }
  return undefined;
}

export function extractObjectFieldByKeys(
  text: string,
  keys: string[]
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const valueStart = findJsonValueStartByKey(text, key);
    if (valueStart === null || text[valueStart] !== "{") continue;
    const segment = extractBalancedJsonSegment(text, valueStart, "{");
    if (!segment) continue;
    const parsed = parseLooseJsonCandidate(segment);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  return undefined;
}

export function shouldAttemptStringReportExtraction(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  return (
    trimmed.includes("checkpoint_report") ||
    trimmed.includes("executive_summary") ||
    trimmed.includes("performance_snapshot") ||
    trimmed.includes("sections") ||
    trimmed.includes("blocks") ||
    trimmed.includes("strategic_recommendations")
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function unwrapReportEnvelope(value: unknown): unknown {
  let current: unknown = value;

  for (let i = 0; i < 4; i += 1) {
    const record = asRecord(current);
    if (!record) break;

    const nestedReport = asRecord(record.report);
    if (nestedReport) {
      current = nestedReport;
      continue;
    }

    const nestedPayload = asRecord(record.payload);
    if (nestedPayload) {
      current = nestedPayload;
      continue;
    }

    const nestedData = asRecord(record.data);
    if (nestedData) {
      current = nestedData;
      continue;
    }

    break;
  }

  return current;
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

export function extractJsonObjectCandidates(value: string): unknown[] {
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
    const parsed = parseLooseJsonCandidate(candidate);
    if (parsed != null) parsedCandidates.push(parsed);
  }
  return parsedCandidates;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parsePersistedResultWrapper(
  content: string,
  fallbackTitle?: string
): { text?: string; plan?: JainaPlan } | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null;

  const parsedValue = parseLooseJsonCandidate(trimmed);
  const parsed = asRecord(parsedValue);
  if (!parsed) return null;

  const type = toNonEmptyString(parsed.type);
  if (!type) return null;

  const normalizedType = type.startsWith("response.")
    ? type.slice("response.".length)
    : type;
  const dataRecord = asRecord(parsed.data);

  if (normalizedType === "text") {
    if (typeof parsed.content === "string") {
      return { text: parsed.content };
    }
    if (typeof dataRecord?.content === "string") {
      return { text: dataRecord.content };
    }
    return null;
  }

  if (normalizedType !== "plan_ready") {
    return null;
  }

  const planRecord = asRecord(parsed.plan) ?? asRecord(dataRecord?.plan) ?? parsed;
  const planId = toNonEmptyString(planRecord.plan_id) ?? toNonEmptyString(planRecord.id);
  if (!planId) return null;

  const rawSteps = Array.isArray(planRecord.steps)
    ? planRecord.steps
    : Array.isArray(planRecord.objectives)
      ? planRecord.objectives
      : [];
  const steps = rawSteps.reduce<JainaPlan["steps"]>((acc, step) => {
    const stepRecord = asRecord(step);
    if (!stepRecord) return acc;
    const title =
      toNonEmptyString(stepRecord.title) ??
      toNonEmptyString(stepRecord.task) ??
      toNonEmptyString(stepRecord.objective) ??
      toNonEmptyString(stepRecord.summary);
    if (!title) return acc;

    const description =
      toNonEmptyString(stepRecord.description) ??
      toNonEmptyString(stepRecord.success_criteria) ??
      toNonEmptyString(stepRecord.rationale);
    acc.push({
      title,
      ...(description ? { description } : {}),
      status:
        typeof stepRecord.status === "string"
          ? (stepRecord.status as JainaPlan["steps"][number]["status"])
          : "pending",
    });
    return acc;
  }, []);

  const normalizedFallback = fallbackTitle?.trim();
  const title =
    toNonEmptyString(planRecord.chat_title) ??
    toNonEmptyString(planRecord.title) ??
    toNonEmptyString(dataRecord?.chat_title) ??
    toNonEmptyString(dataRecord?.title) ??
    (normalizedFallback && normalizedFallback.length > 0
      ? normalizedFallback
      : undefined) ??
    (typeof planRecord.intent === "string"
      ? `${planRecord.intent.charAt(0).toUpperCase()}${planRecord.intent.slice(1)} plan`
      : "Execution Plan");

  const description =
    toNonEmptyString(planRecord.description) ??
    toNonEmptyString(planRecord.summary) ??
    toNonEmptyString(dataRecord?.description) ??
    toNonEmptyString(dataRecord?.summary) ??
    (typeof planRecord.date_preset === "string" && planRecord.date_preset
      ? `Scope: ${planRecord.date_preset}`
      : "Review this execution plan.");

  return {
    text: "",
    plan: {
      id: planId,
      title,
      description,
      status:
        typeof planRecord.status === "string"
          ? (planRecord.status as JainaPlan["status"])
          : "pending",
      steps,
    },
  };
}

export function isPersistedResultStub(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return false;

  const parsed = asRecord(parseLooseJsonCandidate(trimmed));
  if (!parsed) return false;

  const type = toNonEmptyString(parsed.type);
  if (!type) return false;
  const normalizedType = type.startsWith("response.")
    ? type.slice("response.".length)
    : type;
  return normalizedType === "plan_ready" || normalizedType === "text";
}
