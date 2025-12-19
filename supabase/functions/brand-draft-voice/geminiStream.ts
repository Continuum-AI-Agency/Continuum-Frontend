type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function extractGeminiChunkText(chunk: unknown): string {
  const normalizedChunk = Array.isArray(chunk) ? chunk[0] : chunk;
  if (!isRecord(normalizedChunk)) return "";

  const candidates = asArray(normalizedChunk.candidates);
  const firstCandidate = candidates[0];
  if (!isRecord(firstCandidate)) return "";

  const content = firstCandidate.content;
  if (!isRecord(content)) return "";

  const parts = asArray(content.parts);
  return parts
    .map((part) => (isRecord(part) ? asString(part.text) : undefined))
    .filter((text): text is string => typeof text === "string" && text.length > 0)
    .join("");
}

export function computeTextDelta(previousText: string, nextChunkText: string): { nextText: string; delta: string } {
  if (!nextChunkText) return { nextText: previousText, delta: "" };

  if (nextChunkText.startsWith(previousText)) {
    const delta = nextChunkText.slice(previousText.length);
    return { nextText: nextChunkText, delta };
  }

  return { nextText: previousText + nextChunkText, delta: nextChunkText };
}

