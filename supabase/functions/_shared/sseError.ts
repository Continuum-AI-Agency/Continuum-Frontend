export type SseErrorCode = "timeout" | "auth" | "rate_limit" | "api_error" | "unknown";

export type SseErrorPayload = {
  code: SseErrorCode;
  message: string;
  retriable: boolean;
};

export function classifySseError(error: unknown): SseErrorPayload {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (
    error instanceof DOMException && error.name === "AbortError" ||
    lower.includes("timed out") || lower.includes("timeout")
  ) {
    return { code: "timeout", message: "Upstream model timed out.", retriable: true };
  }
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("permission")) {
    return { code: "auth", message: "Upstream authorization failed.", retriable: false };
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return { code: "rate_limit", message: "Upstream rate limit hit.", retriable: true };
  }
  if (lower.includes("gemini api error") || lower.includes("openai") || lower.startsWith("4") || lower.startsWith("5")) {
    return { code: "api_error", message: msg.slice(0, 240), retriable: true };
  }
  return { code: "unknown", message: msg.slice(0, 240), retriable: false };
}

export function encodeStructuredSseError(error: unknown): string {
  return JSON.stringify(classifySseError(error));
}
